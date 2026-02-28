from __future__ import annotations

import sys
import uuid
from pathlib import Path
from typing import Any
import re

from fastapi import UploadFile

from app.schemas.model import ModelDocument, ValidationIssue
from app.schemas.vensim import (
    ImportedGraphSummary,
    VensimImportResponse,
    VensimModelView,
    VensimImportSource,
    VensimImportGapSummary,
    VensimImportGapItem,
)
from app.vensim.cache import VensimImportSession, put_session
from app.vensim.capabilities import detect_capabilities
from app.vensim.errors import vensim_http_error
from app.vensim.introspection import build_dependency_graph, extract_time_settings, extract_variables

TEMP_ROOT = Path("/tmp/sd_vensim_imports")
MAX_GAP_SAMPLES = 24



def _ensure_pysd_importable():
    repo_root = Path(__file__).resolve().parents[3]
    local_pysd_root = repo_root / "pysd"
    if str(local_pysd_root) not in sys.path:
        sys.path.insert(0, str(local_pysd_root))



def _load_with_pysd(mdl_path: Path) -> tuple[Any, bool]:
    _ensure_pysd_importable()
    try:
        import pysd  # type: ignore
    except Exception as exc:
        raise vensim_http_error(500, "VENSIM_IMPORT_FAILED", f"PySD is not available: {exc}")
    try:
        return pysd.read_vensim(str(mdl_path)), False
    except Exception as exc:
        # Some PySD builds fail on 2-argument RAMP(...) even though Vensim treats
        # the end argument as optional; patch to FINAL TIME as a safe fallback.
        source = mdl_path.read_text(encoding="utf-8", errors="ignore")
        patched = _patch_two_arg_ramp_calls(source)
        if patched != source:
            patched_path = mdl_path.with_name(f"{mdl_path.stem}.patched.mdl")
            patched_path.write_text(patched, encoding="utf-8")
            try:
                return pysd.read_vensim(str(patched_path)), True
            except Exception:
                pass
        raise vensim_http_error(422, "VENSIM_TRANSLATION_ERROR", f"Could not import Vensim model: {exc}")


def _split_call_args(raw: str) -> list[str]:
    args: list[str] = []
    depth = 0
    cur: list[str] = []
    for ch in raw:
        if ch == "," and depth == 0:
            arg = "".join(cur).strip()
            if arg:
                args.append(arg)
            cur = []
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        cur.append(ch)
    tail = "".join(cur).strip()
    if tail:
        args.append(tail)
    return args


def _patch_two_arg_ramp_calls(source: str) -> str:
    out: list[str] = []
    i = 0
    upper = source.upper()
    while i < len(source):
        if not upper.startswith("RAMP(", i):
            out.append(source[i])
            i += 1
            continue
        start = i + len("RAMP(")
        depth = 1
        j = start
        while j < len(source) and depth > 0:
            if source[j] == "(":
                depth += 1
            elif source[j] == ")":
                depth -= 1
            j += 1
        if depth != 0:
            out.append(source[i])
            i += 1
            continue
        args_body = source[start : j - 1]
        args = _split_call_args(args_body)
        if len(args) == 2:
            out.append(f"RAMP({args_body}, FINAL TIME)")
        else:
            out.append(source[i:j])
        i = j
    return "".join(out)



def _type_from_kind(kind: str | None, name: str | None = None, equation: str | None = None) -> str:
    if not kind:
        # fallback heuristics for imported variables when kind is missing
        lname = (name or "").lower()
        leq = (equation or "").lower()
        if any(t in lname for t in ["stock", "population", "inventory", "level"]):
            return "stock"
        if any(t in lname for t in ["flow", "rate", "birth", "death", "inflow", "outflow"]) or "delay" in leq or "smooth" in leq:
            return "flow"
        return "aux"
    k = kind.lower()
    if "stock" in k or "level" in k:
        return "stock"
    if "rate" in k or "flow" in k:
        return "flow"
    return "aux"


def _append_gap_sample(samples: list[VensimImportGapItem], item: VensimImportGapItem) -> None:
    if len(samples) < MAX_GAP_SAMPLES:
        samples.append(item)


def _parse_lookup_points(equation: str | None) -> list[dict[str, float]]:
    if not equation:
        return []
    if "WITH LOOKUP" not in equation.upper():
        return []
    points = []
    for x_raw, y_raw in re.findall(r"\((-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)\)", equation):
        try:
            points.append({"x": float(x_raw), "y": float(y_raw)})
        except Exception:
            continue
    unique = []
    seen_x = set()
    for point in sorted(points, key=lambda p: p["x"]):
        if point["x"] in seen_x:
            continue
        unique.append(point)
        seen_x.add(point["x"])
    if len(unique) < 2:
        return []
    return unique


def _normalize_name(value: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "", value.lower().replace(" ", "_"))


def _extract_integ_rate_expression(equation: str | None) -> str | None:
    if not equation:
        return None
    match = re.search(r"\bINTEG\s*\(", equation, flags=re.IGNORECASE)
    if not match:
        return None
    open_idx = equation.find("(", match.start())
    if open_idx < 0:
        return None
    depth = 1
    i = open_idx + 1
    while i < len(equation) and depth > 0:
        ch = equation[i]
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth -= 1
        i += 1
    if depth != 0:
        return None
    args = _split_call_args(equation[open_idx + 1 : i - 1])
    if not args:
        return None
    return args[0]


def _split_top_level_sum_terms(expr: str) -> list[tuple[int, str]]:
    terms: list[tuple[int, str]] = []
    depth = 0
    sign = 1
    cur: list[str] = []
    for ch in expr:
        if ch in "+-" and depth == 0:
            token = "".join(cur).strip()
            if token:
                terms.append((sign, token))
            sign = 1 if ch == "+" else -1
            cur = []
            continue
        if ch == "(":
            depth += 1
        elif ch == ")":
            depth = max(0, depth - 1)
        cur.append(ch)
    token = "".join(cur).strip()
    if token:
        terms.append((sign, token))
    return terms


def _strip_outer_parens(value: str) -> str:
    out = value.strip()
    while out.startswith("(") and out.endswith(")"):
        depth = 0
        valid = True
        for idx, ch in enumerate(out):
            if ch == "(":
                depth += 1
            elif ch == ")":
                depth -= 1
                if depth < 0:
                    valid = False
                    break
            if depth == 0 and idx != len(out) - 1:
                valid = False
                break
        if not valid:
            break
        out = out[1:-1].strip()
    return out


def _resolve_sum_term_symbol(term: str, normalized_names: dict[str, str]) -> str | None:
    cleaned = _strip_outer_parens(term)
    if not cleaned:
        return None
    if re.search(r"[*/^]", cleaned):
        return None
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_ ]*", cleaned):
        return None
    return normalized_names.get(_normalize_name(cleaned))


def _infer_stock_flow_relations(variables: list, names: list[str]) -> tuple[list[tuple[str, str, int]], set[str]]:
    normalized_names = {_normalize_name(name): name for name in names}
    relations: list[tuple[str, str, int]] = []
    flow_candidates: set[str] = set()
    for variable in variables:
        stock_name = variable.name
        if not stock_name or stock_name not in normalized_names.values():
            continue
        rate_expr = _extract_integ_rate_expression(variable.equation)
        if not rate_expr:
            continue
        for sign, term in _split_top_level_sum_terms(rate_expr):
            flow_name = _resolve_sum_term_symbol(term, normalized_names)
            if not flow_name or flow_name == stock_name:
                continue
            flow_candidates.add(flow_name)
            relations.append((stock_name, flow_name, sign))
    return relations, flow_candidates


def _best_effort_canonical(filename: str, variables: list, graph: ImportedGraphSummary | None) -> tuple[ModelDocument | None, VensimImportGapSummary]:
    names = [v.name for v in variables if v.name]
    gap_samples: list[VensimImportGapItem] = []
    dropped_variables = sum(1 for v in variables if not v.name)
    for idx, variable in enumerate(variables):
        if variable.name:
            continue
        _append_gap_sample(
            gap_samples,
            VensimImportGapItem(
                kind="variable",
                symbol=f"variable_{idx + 1}",
                reason="Variable skipped because no stable import name was available",
                severity="warning",
            ),
        )
    if not names:
        return None, VensimImportGapSummary(
            dropped_variables=dropped_variables,
            dropped_edges=0,
            unparsed_equations=0,
            unsupported_constructs=[],
            samples=gap_samples,
        )
    edges = graph.edges if graph else []
    incoming = {name: 0 for name in names}
    outgoing = {name: 0 for name in names}
    deps_for = {name: set() for name in names}
    dropped_edges = 0
    for src, dst in edges:
        if src in incoming and dst in incoming:
            incoming[dst] += 1
            outgoing[src] += 1
            deps_for[dst].add(src)
            continue
        dropped_edges += 1
        _append_gap_sample(
            gap_samples,
            VensimImportGapItem(
                kind="edge",
                symbol=f"{src} -> {dst}",
                reason="Dependency edge omitted because one or both variables could not be mapped to canonical nodes",
                severity="warning",
            ),
        )

    levels: dict[str, int] = {}
    remaining = set(names)
    # best-effort layered layout by dependency depth
    for _ in range(len(names)):
        progress = False
        for name in list(remaining):
            parents = [p for p in deps_for[name] if p in names]
            if all(p in levels for p in parents):
                levels[name] = (max([levels[p] for p in parents], default=-1) + 1)
                remaining.remove(name)
                progress = True
        if not progress:
            # cycle fallback
            for idx, name in enumerate(sorted(remaining)):
                levels[name] = max(levels.values(), default=0) + idx
            break

    var_map = {v.name: v for v in variables if v.name in names}
    columns: dict[int, list[str]] = {}
    for name, level in levels.items():
        columns.setdefault(level, []).append(name)

    stock_flow_relations, inferred_flow_names = _infer_stock_flow_relations(variables, names)

    nodes = []
    id_for_name: dict[str, str] = {}
    node_for_name: dict[str, dict] = {}
    unparsed_equations = 0
    for level in sorted(columns):
        for row_idx, name in enumerate(sorted(columns[level])):
            var = var_map.get(name)
            equation = (var.equation if var else None) or "(imported)"
            lookup_points = _parse_lookup_points(var.equation if var else None)
            if lookup_points:
                node_type = "lookup"
            else:
                node_type = _type_from_kind(var.kind if var else None, name=name, equation=(var.equation if var else None))
                if node_type != "stock" and name in inferred_flow_names:
                    node_type = "flow"
            if var and (var.equation is None or not str(var.equation).strip()):
                unparsed_equations += 1
                _append_gap_sample(
                    gap_samples,
                    VensimImportGapItem(
                        kind="equation",
                        symbol=name,
                        reason="Equation text was empty or unavailable; placeholder equation used",
                        severity="warning",
                    ),
                )
            node_id = f"import_{node_type}_{len(nodes)+1}"
            id_for_name[name] = node_id
            common = dict(
                id=node_id,
                type=node_type,
                name=name,
                label=name,
                equation=equation,
                units=(var.units if var else None),
                position={"x": 180 + level * 260, "y": 120 + row_idx * 120},
            )
            if node_type == "stock":
                node = {**common, "initial_value": 0}
                nodes.append(node)
                node_for_name[name] = node
            elif node_type == "lookup":
                node = {**common, "points": lookup_points or [{"x": 0.0, "y": 0.0}, {"x": 1.0, "y": 1.0}], "interpolation": "linear"}
                nodes.append(node)
                node_for_name[name] = node
            elif node_type == "flow":
                node = {**common, "source_stock_id": None, "target_stock_id": None}
                nodes.append(node)
                node_for_name[name] = node
            else:
                node = dict(common)
                nodes.append(node)
                node_for_name[name] = node

    canonical_edges = []
    for idx, (src, dst) in enumerate(edges, start=1):
        if src in id_for_name and dst in id_for_name:
            canonical_edges.append(
                {"id": f"import_edge_{idx}", "type": "influence", "source": id_for_name[src], "target": id_for_name[dst]}
            )

    flow_link_pairs: set[tuple[str, str]] = set()
    flow_link_index = len(canonical_edges) + 1
    for stock_name, flow_name, sign in stock_flow_relations:
        flow_node = node_for_name.get(flow_name)
        stock_id = id_for_name.get(stock_name)
        flow_id = id_for_name.get(flow_name)
        if not flow_node or flow_node.get("type") != "flow" or not stock_id or not flow_id:
            continue
        if sign >= 0:
            if flow_node.get("target_stock_id") is None:
                flow_node["target_stock_id"] = stock_id
            elif flow_node.get("target_stock_id") != stock_id:
                _append_gap_sample(
                    gap_samples,
                    VensimImportGapItem(
                        kind="edge",
                        symbol=flow_name,
                        reason=f"Flow has multiple inferred target stocks ({flow_node.get('target_stock_id')} and {stock_id}); keeping first",
                        severity="warning",
                    ),
                )
            pair = (flow_id, stock_id)
        else:
            if flow_node.get("source_stock_id") is None:
                flow_node["source_stock_id"] = stock_id
            elif flow_node.get("source_stock_id") != stock_id:
                _append_gap_sample(
                    gap_samples,
                    VensimImportGapItem(
                        kind="edge",
                        symbol=flow_name,
                        reason=f"Flow has multiple inferred source stocks ({flow_node.get('source_stock_id')} and {stock_id}); keeping first",
                        severity="warning",
                    ),
                )
            pair = (stock_id, flow_id)
        if pair in flow_link_pairs:
            continue
        flow_link_pairs.add(pair)
        canonical_edges.append(
            {"id": f"import_flow_link_{flow_link_index}", "type": "flow_link", "source": pair[0], "target": pair[1]}
        )
        flow_link_index += 1

    model = ModelDocument.model_validate(
        {
            "id": filename.replace(".", "_"),
            "name": filename,
            "version": 1,
            "nodes": nodes,
            "edges": canonical_edges,
            "outputs": names[: min(20, len(names))],
        }
    )
    return model, VensimImportGapSummary(
        dropped_variables=dropped_variables,
        dropped_edges=dropped_edges,
        unparsed_equations=unparsed_equations,
        unsupported_constructs=[],
        samples=gap_samples,
    )


async def import_vensim_file(file: UploadFile) -> VensimImportResponse:
    if not file.filename or not file.filename.lower().endswith(".mdl"):
        raise vensim_http_error(400, "VENSIM_UNSUPPORTED_FILE", "Only Vensim .mdl files are supported")

    TEMP_ROOT.mkdir(parents=True, exist_ok=True)
    import_id = str(uuid.uuid4())
    session_dir = TEMP_ROOT / import_id
    session_dir.mkdir(parents=True, exist_ok=True)
    mdl_path = session_dir / file.filename
    data = await file.read()
    mdl_path.write_bytes(data)
    source_text = data.decode("utf-8", errors="ignore")

    loaded_model = _load_with_pysd(mdl_path)
    if isinstance(loaded_model, tuple) and len(loaded_model) == 2:
        model_handle, used_ramp_patch = loaded_model
    else:
        model_handle = loaded_model
        used_ramp_patch = False
    variables = extract_variables(model_handle)
    capability_report, cap_warnings = detect_capabilities(source_text, variables=variables)
    time_settings = extract_time_settings(model_handle)
    dependency_graph = build_dependency_graph(variables)

    warnings = list(cap_warnings)
    if used_ramp_patch:
        warnings.append(
            ValidationIssue(
                code="VENSIM_RAMP_FALLBACK_APPLIED",
                message="Patched 2-argument RAMP calls to include FINAL TIME for compatibility.",
                severity="warning",
            )
        )
    fallback_functions = sorted({d.function for d in capability_report.details if d.support_mode == "native_fallback"})
    unsupported_functions = sorted({d.function for d in capability_report.details if d.support_mode == "unsupported"})
    if unsupported_functions:
        parity_readiness = "red"
        parity_reasons = [f"Unsupported functions: {', '.join(unsupported_functions)}"]
    elif fallback_functions or capability_report.partial:
        parity_readiness = "yellow"
        parity_reasons = ["Partial/fallback compatibility detected; parity must be validated with tolerances."]
    else:
        parity_readiness = "green"
        parity_reasons = ["No unsupported/partial advanced functions detected."]

    diagnostics = {
        "function_count": len(capability_report.details),
        "fallback_functions": fallback_functions,
        "unsupported_functions": unsupported_functions,
        "families": [f.model_dump() for f in capability_report.families],
    }
    canonical, import_gaps = _best_effort_canonical(file.filename, variables, dependency_graph)
    unsupported_constructs = sorted(set(capability_report.unsupported))
    import_gaps.unsupported_constructs = unsupported_constructs
    for fn in unsupported_constructs[:8]:
        _append_gap_sample(
            import_gaps.samples,
            VensimImportGapItem(
                kind="construct",
                symbol=fn,
                reason="Unsupported construct detected during compatibility analysis",
                severity="error",
            ),
        )
    if canonical is None:
        warnings.append(ValidationIssue(code="VENSIM_IMPORT_FAILED", message="Imported model has no inspectable variables", severity="warning"))

    session = VensimImportSession(
        import_id=import_id,
        filename=file.filename,
        mdl_path=mdl_path,
        model_handle=model_handle,
        variables=variables,
        time_settings=time_settings,
        capabilities=capability_report,
        warnings=[w.model_dump() for w in warnings],
        errors=[],
        canonical=canonical.model_dump() if canonical else None,
        diagnostics=diagnostics,
        import_gaps=import_gaps,
        parity_readiness=parity_readiness,
        parity_reasons=parity_reasons,
    )
    put_session(session)

    return VensimImportResponse(
        ok=True,
        import_id=import_id,
        source=VensimImportSource(filename=file.filename),
        capabilities=capability_report,
        warnings=warnings,
        errors=[],
        model_view=VensimModelView(
            canonical=canonical,
            variables=variables,
            time_settings=time_settings,
            dependency_graph=dependency_graph,
            import_gaps=import_gaps,
        ),
    )
