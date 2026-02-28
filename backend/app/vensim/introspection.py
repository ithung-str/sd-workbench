from __future__ import annotations

import re
from typing import Any

from app.schemas.vensim import ImportedGraphSummary, ImportedTimeSettings, ImportedVariableSummary



def _safe_call(obj: Any, attr: str):
    try:
        value = getattr(obj, attr)
    except Exception:
        return None
    try:
        return value() if callable(value) else value
    except Exception:
        return None



def extract_time_settings(model_handle: Any) -> ImportedTimeSettings:
    # PySD model often exposes components.<timevar>() methods or direct model methods.
    components = getattr(model_handle, "components", None)
    def read_from_components(name: str):
        if components is None:
            return None
        return _safe_call(components, name)

    return ImportedTimeSettings(
        initial_time=_first_numeric([_safe_call(model_handle, "initial_time"), read_from_components("initial_time")]),
        final_time=_first_numeric([_safe_call(model_handle, "final_time"), read_from_components("final_time")]),
        time_step=_first_numeric([_safe_call(model_handle, "time_step"), read_from_components("time_step")]),
        saveper=_first_numeric([_safe_call(model_handle, "saveper"), read_from_components("saveper")]),
    )



def _first_numeric(values):
    for value in values:
        try:
            if value is None:
                continue
            return float(value)
        except Exception:
            continue
    return None



def extract_variables(model_handle: Any) -> list[ImportedVariableSummary]:
    variables: list[ImportedVariableSummary] = []
    doc_df = None
    try:
        if hasattr(model_handle, "doc"):
            doc_df = model_handle.doc()
    except Exception:
        doc_df = None

    if doc_df is not None:
        try:
            rows = doc_df.to_dict(orient="records")
            for row in rows:
                dimensions = row.get("Subscripts") or row.get("subscripts") or row.get("Dimensions") or row.get("dimensions")
                dependencies = (
                    row.get("Dependencies")
                    or row.get("dependencies")
                    or row.get("Depends On")
                    or row.get("depends_on")
                )
                variables.append(
                    ImportedVariableSummary(
                        name=str(row.get("Real Name") or row.get("real_name") or row.get("name") or row.get("Py Name") or ""),
                        py_name=_str_or_none(row.get("Py Name") or row.get("py_name")),
                        kind=_str_or_none(row.get("Type") or row.get("type")),
                        equation=_str_or_none(
                            row.get("Equation")
                            or row.get("equation")
                            or row.get("Eqn")
                            or row.get("eqn")
                            or row.get("Model Expr")
                            or row.get("model_expr")
                        ),
                        units=_str_or_none(row.get("Units") or row.get("units")),
                        doc=_str_or_none(row.get("Comment") or row.get("comment") or row.get("Doc") or row.get("doc")),
                        dimensions=_parse_dimensions(dimensions),
                        dependencies=_parse_dependencies(dependencies),
                    )
                )
        except Exception:
            variables = []

    if variables:
        return [v for v in variables if v.name]

    # Fallback: inspect components attributes
    components = getattr(model_handle, "components", None)
    if components is None:
        return []
    for name in dir(components):
        if name.startswith("_"):
            continue
        value = getattr(components, name, None)
        if callable(value):
            variables.append(ImportedVariableSummary(name=name, py_name=name))
    return variables


def build_dependency_graph(variables: list[ImportedVariableSummary]) -> ImportedGraphSummary:
    names = [v.name for v in variables if v.name]
    py_names = [v.py_name for v in variables if v.py_name]
    all_names = sorted(set(names + [n for n in py_names if n]))
    if not all_names:
        return ImportedGraphSummary(edges=[])

    token_re = re.compile(r"\b([A-Za-z_][A-Za-z0-9_]*)\b")
    normalized_map = { _normalize_name(name): name for name in all_names }
    reserved = {
        "and","or","not","if","else","for","in","lambda","true","false","none",
        "step","ramp","pulse","smooth","smooth3","smoothn","delay1","delay3","delayn","min","max","abs","exp","log"
    }
    edges: set[tuple[str, str]] = set()
    for variable in variables:
        target = variable.name or variable.py_name
        if not target:
            continue
        # Prefer explicit dependency metadata if provided by PySD docs/introspection
        if variable.dependencies:
            for dep in variable.dependencies:
                source = normalized_map.get(_normalize_name(dep)) or dep
                if source in all_names and source != target:
                    edges.add((source, target))
            continue
        if not variable.equation:
            continue
        for token in token_re.findall(variable.equation):
            norm = _normalize_name(token)
            if not norm or norm in reserved:
                continue
            source = normalized_map.get(norm)
            if not source or source == target:
                continue
            edges.add((source, target))
    return ImportedGraphSummary(edges=sorted(edges))



def _str_or_none(value):
    if value is None:
        return None
    s = str(value).strip()
    return s or None


def _normalize_name(name: str) -> str:
    return re.sub(r"[^a-z0-9_]+", "", name.lower().replace(" ", "_"))


def _parse_dimensions(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple)):
        return [str(v).strip() for v in value if str(v).strip()]
    text = str(value).strip()
    if not text:
        return []
    # Common doc formats: "dim1,dim2" or "[dim1, dim2]"
    text = text.strip("[]")
    parts = [p.strip() for p in re.split(r"[;,]", text)]
    return [p for p in parts if p]


def _parse_dependencies(value: Any) -> list[str]:
    if value is None:
        return []
    if isinstance(value, (list, tuple, set)):
        return [str(v).strip() for v in value if str(v).strip()]
    text = str(value).strip()
    if not text:
        return []
    text = text.strip("[]()")
    parts = [p.strip().strip("'").strip('"') for p in re.split(r"[;,]", text)]
    return [p for p in parts if p]
