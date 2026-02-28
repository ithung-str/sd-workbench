from __future__ import annotations

import sys
import uuid
from pathlib import Path
from typing import Any

from fastapi import UploadFile

from app.schemas.model import ModelDocument, ValidationIssue
from app.schemas.vensim import ImportedGraphSummary, VensimImportResponse, VensimModelView, VensimImportSource
from app.vensim.cache import VensimImportSession, put_session
from app.vensim.capabilities import detect_capabilities
from app.vensim.errors import vensim_http_error
from app.vensim.introspection import build_dependency_graph, extract_time_settings, extract_variables

TEMP_ROOT = Path("/tmp/sd_vensim_imports")



def _ensure_pysd_importable():
    repo_root = Path(__file__).resolve().parents[3]
    local_pysd_root = repo_root / "pysd"
    if str(local_pysd_root) not in sys.path:
        sys.path.insert(0, str(local_pysd_root))



def _load_with_pysd(mdl_path: Path) -> Any:
    _ensure_pysd_importable()
    try:
        import pysd  # type: ignore
    except Exception as exc:
        raise vensim_http_error(500, "VENSIM_IMPORT_FAILED", f"PySD is not available: {exc}")
    try:
        return pysd.read_vensim(str(mdl_path))
    except Exception as exc:
        raise vensim_http_error(422, "VENSIM_TRANSLATION_ERROR", f"Could not import Vensim model: {exc}")



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


def _best_effort_canonical(filename: str, variables: list, graph: ImportedGraphSummary | None) -> ModelDocument | None:
    names = [v.name for v in variables if v.name][:18]
    if not names:
        return None
    edges = graph.edges if graph else []
    incoming = {name: 0 for name in names}
    outgoing = {name: 0 for name in names}
    deps_for = {name: set() for name in names}
    for src, dst in edges:
        if src in incoming and dst in incoming:
            incoming[dst] += 1
            outgoing[src] += 1
            deps_for[dst].add(src)

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

    nodes = []
    id_for_name: dict[str, str] = {}
    for level in sorted(columns):
        for row_idx, name in enumerate(sorted(columns[level])):
            var = var_map.get(name)
            node_type = _type_from_kind(var.kind if var else None, name=name, equation=(var.equation if var else None))
            node_id = f"import_{node_type}_{len(nodes)+1}"
            id_for_name[name] = node_id
            common = dict(
                id=node_id,
                type=node_type,
                name=name,
                label=name,
                equation=(var.equation or "(imported)") if var else "(imported)",
                units=(var.units if var else None),
                position={"x": 180 + level * 260, "y": 120 + row_idx * 120},
            )
            if node_type == "stock":
                nodes.append({**common, "initial_value": 0})
            elif node_type == "flow":
                nodes.append(common)
            else:
                nodes.append(common)

    canonical_edges = []
    for idx, (src, dst) in enumerate(edges[:80], start=1):
        if src in id_for_name and dst in id_for_name:
            canonical_edges.append(
                {"id": f"import_edge_{idx}", "type": "influence", "source": id_for_name[src], "target": id_for_name[dst]}
            )

    return ModelDocument.model_validate(
        {
            "id": filename.replace(".", "_"),
            "name": filename,
            "version": 1,
            "nodes": nodes,
            "edges": canonical_edges,
            "outputs": names[: min(8, len(names))],
        }
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

    model_handle = _load_with_pysd(mdl_path)
    variables = extract_variables(model_handle)
    capability_report, cap_warnings = detect_capabilities(source_text, variables=variables)
    time_settings = extract_time_settings(model_handle)
    dependency_graph = build_dependency_graph(variables)

    warnings = list(cap_warnings)
    canonical = _best_effort_canonical(file.filename, variables, dependency_graph)
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
        ),
    )
