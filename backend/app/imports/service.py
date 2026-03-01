from __future__ import annotations

import re
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.imports.cache import ImportSession, put_session
from app.imports.errors import imported_http_error
from app.imports.insightmaker_parser import parse_insightmaker_xml
from app.schemas.imported import (
    ImportedCapabilityReport,
    ImportedFamilyCapabilitySummary,
    ImportedFunctionCapabilityDetail,
    ImportedModelResponse,
    ImportedModelSource,
)

TEMP_ROOT = Path("/tmp/sd_imported_models")
TEMP_ROOT.mkdir(parents=True, exist_ok=True)


FUNCTION_RE = re.compile(r"\b([A-Za-z][A-Za-z0-9_ ]*)\s*\(")


def _family_for(name: str) -> str:
    n = name.lower().replace(" ", "_")
    if n in {"step", "ramp", "pulse", "pulse_train"}:
        return "time"
    if n.startswith("delay"):
        return "delays"
    if n.startswith("smooth"):
        return "smoothing"
    if n.startswith("random"):
        return "stochastic"
    if "lookup" in n:
        return "lookup"
    return "math"


def detect_imported_capabilities(equations: list[str]) -> ImportedCapabilityReport:
    detected: list[str] = []
    details: list[ImportedFunctionCapabilityDetail] = []
    family_map: dict[str, set[str]] = {}
    for equation in equations:
        for match in FUNCTION_RE.finditer(equation or ""):
            fn = match.group(1).strip().upper()
            if fn in detected:
                continue
            detected.append(fn)
            family = _family_for(fn)
            family_map.setdefault(family, set()).add(fn)
            support_mode = "native_fallback" if family in {"time", "delays", "smoothing", "stochastic", "lookup"} else "pysd"
            details.append(
                ImportedFunctionCapabilityDetail(
                    function=fn,
                    family=family,
                    support_mode=support_mode,
                    pysd_support="partial" if support_mode != "pysd" else "yes",
                    deterministic=family != "stochastic",
                    dimensional=True,
                    notes="Detected in imported equation.",
                )
            )
    partial = [d.function for d in details if d.support_mode != "pysd"]
    tier = "T2" if partial else "T1"
    return ImportedCapabilityReport(
        tier=tier,
        supported=[d.function for d in details if d.support_mode == "pysd"],
        partial=partial,
        unsupported=[],
        detected_functions=detected,
        detected_time_settings=["TIME START", "TIME STEP"] if detected else [],
        details=details,
        families=[
            ImportedFamilyCapabilitySummary(
                family=family,
                functions=sorted(functions),
                highest_severity="warning" if family in {"stochastic", "lookup"} else "info",
                support_mode="native_fallback" if family in {"time", "delays", "smoothing", "stochastic", "lookup"} else "pysd",
            )
            for family, functions in sorted(family_map.items())
        ],
    )


async def import_insightmaker_file(file: UploadFile) -> ImportedModelResponse:
    if not file.filename:
        raise imported_http_error(400, "IM_UNSUPPORTED_FILE", "A file name is required")
    normalized = file.filename.lower()
    if not (normalized.endswith(".xml") or normalized.endswith(".insightmaker")):
        raise imported_http_error(400, "IM_UNSUPPORTED_FILE", "Only Insight Maker .xml or .InsightMaker files are supported")

    payload_bytes = await file.read()
    payload = payload_bytes.decode("utf-8", errors="ignore")
    try:
        parsed = parse_insightmaker_xml(payload, file.filename)
    except ValueError as exc:
        raise imported_http_error(422, "IM_PARSE_ERROR", str(exc))

    import_id = f"im_{uuid.uuid4().hex[:10]}"
    path = TEMP_ROOT / f"{import_id}.xml"
    path.write_text(payload, encoding="utf-8")

    equations = [v.equation or "" for v in parsed.model_view.variables]
    capabilities = detect_imported_capabilities(equations)

    session = ImportSession(
        import_id=import_id,
        filename=file.filename,
        source_format="insightmaker-xml",
        source_path=path,
        model_handle=None,
        canonical=parsed.model_view.canonical,
        variables=parsed.model_view.variables,
        time_settings=parsed.model_view.time_settings,
        capabilities=capabilities,
        warnings=[],
        errors=[],
        import_gaps=parsed.model_view.import_gaps,
        parity_readiness="yellow" if capabilities.partial else "green",
        parity_reasons=["Advanced functions detected; run diagnostics before policy analysis"] if capabilities.partial else [],
    )
    gaps = parsed.model_view.import_gaps
    warning_messages: list[str] = []
    if (gaps.dropped_variables or 0) > 0:
        warning_messages.append(f"{gaps.dropped_variables} variable(s) were dropped during import")
    if (gaps.dropped_edges or 0) > 0:
        warning_messages.append(f"{gaps.dropped_edges} edge(s) were dropped during import")
    if (gaps.unparsed_equations or 0) > 0:
        warning_messages.append(f"{gaps.unparsed_equations} equation(s) could not be parsed exactly")
    if gaps.unsupported_constructs:
        warning_messages.append(f"{len(gaps.unsupported_constructs)} unsupported construct(s) were preserved as raw fragments")
    warnings = [
        {
            "code": "IM_IMPORT_WARNING",
            "message": message,
            "severity": "warning",
        }
        for message in warning_messages
    ]
    session.warnings = warnings
    put_session(session)

    return ImportedModelResponse(
        ok=True,
        import_id=import_id,
        source=ImportedModelSource(filename=file.filename, format="insightmaker-xml"),
        capabilities=capabilities,
        warnings=warnings,
        errors=[],
        model_view=parsed.model_view,
    )
