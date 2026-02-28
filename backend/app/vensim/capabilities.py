from __future__ import annotations

import re

from app.schemas.model import ValidationIssue
from app.schemas.vensim import ImportedVariableSummary
from app.schemas.vensim import VensimCapabilityReport

_FUNCTION_RE = re.compile(r"\b([A-Z][A-Z0-9_ ]{1,40})\s*\(")

SUPPORTED_HINTS = {
    "STEP", "RAMP", "PULSE", "PULSE TRAIN", "SMOOTH", "SMOOTH3", "SMOOTHN", "DELAY1", "DELAY3", "DELAYN"
}
PARTIAL_HINTS = {"GET TIME VALUE", "RANDOM NORMAL", "RANDOM EXPONENTIAL"}
UNSUPPORTED_HINTS = {"SHIFT IF TRUE"}



def detect_capabilities(
    source_text: str,
    variables: list[ImportedVariableSummary] | None = None,
) -> tuple[VensimCapabilityReport, list[ValidationIssue]]:
    upper = source_text.upper()
    found = {m.group(1).strip() for m in _FUNCTION_RE.finditer(upper)}
    if variables:
        for variable in variables:
            if not variable.equation:
                continue
            found.update(m.group(1).strip() for m in _FUNCTION_RE.finditer(variable.equation.upper()))
    found = sorted(found)

    supported = sorted([f for f in found if f in SUPPORTED_HINTS])
    partial = sorted([f for f in found if f in PARTIAL_HINTS])
    unsupported = sorted([f for f in found if f in UNSUPPORTED_HINTS])

    # Heuristic tags even if not function syntax
    semantic_supported = []
    for token in ["INITIAL TIME", "FINAL TIME", "TIME STEP", "SAVEPER"]:
        if token in upper:
            semantic_supported.append(token)
    if variables:
        for token in ["INITIAL TIME", "FINAL TIME", "TIME STEP", "SAVEPER"]:
            token_py = token.lower().replace(" ", "_")
            if any((v.name and v.name.lower().replace(" ", "_") == token_py) or (v.py_name and v.py_name.lower() == token_py) for v in variables):
                if token not in semantic_supported:
                    semantic_supported.append(token)

    warnings: list[ValidationIssue] = []
    for fn in partial:
        warnings.append(ValidationIssue(code="VENSIM_PARTIAL_SUPPORT_WARNING", message=f"Partial support likely for '{fn}'", severity="warning", symbol=fn))
    for fn in unsupported:
        warnings.append(ValidationIssue(code="VENSIM_UNSUPPORTED_FEATURE", message=f"Unsupported Vensim feature '{fn}'", severity="warning", symbol=fn))

    tier = "T1"
    if unsupported:
        tier = "T0"
    elif partial:
        tier = "T1"

    report = VensimCapabilityReport(
        tier=tier,
        supported=sorted(set(supported + semantic_supported)),
        partial=partial,
        unsupported=unsupported,
        detected_functions=found,
        detected_time_settings=semantic_supported,
    )
    return report, warnings
