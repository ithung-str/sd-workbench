from __future__ import annotations

import re
from collections import Counter, defaultdict

from app.schemas.model import ValidationIssue
from app.schemas.vensim import (
    ImportedVariableSummary,
    VensimCapabilityReport,
    VensimFamilyCapabilitySummary,
    VensimFunctionCapabilityDetail,
)
from app.vensim.function_registry import BUILTIN_SAFE_FUNCTIONS, FUNCTION_ALIAS_MAP, TIME_SETTING_TOKENS

_FUNCTION_RE = re.compile(r"\b([A-Z][A-Z0-9_ ]{1,60})\s*\(")


def _extract_function_calls(text: str) -> list[str]:
    return [m.group(1).strip() for m in _FUNCTION_RE.finditer(text.upper())]


def _severity_for_mode(mode: str) -> str:
    if mode == "unsupported":
        return "error"
    if mode == "native_fallback":
        return "warning"
    return "info"


def _tier(unsupported_count: int, fallback_count: int, unknown_count: int) -> str:
    if unsupported_count > 0:
        return "T0"
    if unknown_count > 0:
        return "T1"
    if fallback_count > 0:
        return "T2"
    return "T3"


def detect_capabilities(
    source_text: str,
    variables: list[ImportedVariableSummary] | None = None,
) -> tuple[VensimCapabilityReport, list[ValidationIssue]]:
    texts = [source_text.upper()]
    if variables:
        texts.extend((v.equation or "").upper() for v in variables if v.equation)

    found_calls: list[str] = []
    for text in texts:
        found_calls.extend(_extract_function_calls(text))

    call_counts = Counter(found_calls)
    details: list[VensimFunctionCapabilityDetail] = []
    warnings: list[ValidationIssue] = []

    supported: list[str] = []
    partial: list[str] = []
    unsupported: list[str] = []
    unknown: list[str] = []

    for fn, count in sorted(call_counts.items()):
        if fn in BUILTIN_SAFE_FUNCTIONS:
            continue
        spec = FUNCTION_ALIAS_MAP.get(fn)
        if spec is None:
            unknown.append(fn)
            detail = VensimFunctionCapabilityDetail(
                function=fn,
                family="unknown",
                support_mode="native_fallback",
                pysd_support="partial",
                deterministic=True,
                dimensional=False,
                count=count,
                severity="warning",
                notes="Function not in compatibility registry; execution may rely on PySD behavior.",
            )
            details.append(detail)
            warnings.append(
                ValidationIssue(
                    code="VENSIM_UNKNOWN_FUNCTION",
                    message=f"Unknown Vensim function '{fn}' detected; compatibility not guaranteed",
                    severity="warning",
                    symbol=fn,
                )
            )
            continue

        detail = VensimFunctionCapabilityDetail(
            function=spec.key,
            family=spec.family,
            support_mode=spec.support_mode,
            pysd_support=spec.pysd_support,
            deterministic=spec.deterministic,
            dimensional=spec.dimensional,
            count=count,
            severity=_severity_for_mode(spec.support_mode),
            notes=spec.notes,
        )
        details.append(detail)

        if spec.support_mode == "unsupported":
            unsupported.append(spec.key)
            warnings.append(
                ValidationIssue(
                    code="VENSIM_UNSUPPORTED_FEATURE",
                    message=f"Unsupported Vensim feature '{spec.key}'",
                    severity="warning",
                    symbol=spec.key,
                )
            )
        elif spec.support_mode == "native_fallback" or spec.pysd_support == "partial":
            partial.append(spec.key)
            warnings.append(
                ValidationIssue(
                    code="VENSIM_PARTIAL_SUPPORT_WARNING",
                    message=f"Partial or fallback support likely for '{spec.key}'",
                    severity="warning",
                    symbol=spec.key,
                )
            )
        else:
            supported.append(spec.key)

    semantic_supported = []
    upper_source = source_text.upper()
    for token in TIME_SETTING_TOKENS:
        if token in upper_source:
            semantic_supported.append(token)
    if variables:
        for token in TIME_SETTING_TOKENS:
            token_py = token.lower().replace(" ", "_")
            if any((v.name and v.name.lower().replace(" ", "_") == token_py) or (v.py_name and v.py_name.lower() == token_py) for v in variables):
                if token not in semantic_supported:
                    semantic_supported.append(token)

    family_map: dict[str, list[VensimFunctionCapabilityDetail]] = defaultdict(list)
    for detail in details:
        family_map[detail.family].append(detail)

    families: list[VensimFamilyCapabilitySummary] = []
    for family, rows in sorted(family_map.items()):
        highest = "info"
        support_mode = "pysd"
        if any(r.support_mode == "unsupported" for r in rows):
            support_mode = "unsupported"
            highest = "error"
        elif any(r.support_mode == "native_fallback" for r in rows):
            support_mode = "native_fallback"
            highest = "warning"
        families.append(
            VensimFamilyCapabilitySummary(
                family=family,
                functions=sorted(set(r.function for r in rows)),
                highest_severity=highest,
                support_mode=support_mode,
            )
        )

    report = VensimCapabilityReport(
        tier=_tier(len(unsupported), len([d for d in details if d.support_mode == "native_fallback"]), len(unknown)),
        supported=sorted(set(supported + semantic_supported)),
        partial=sorted(set(partial + unknown)),
        unsupported=sorted(set(unsupported)),
        detected_functions=sorted(call_counts.keys()),
        detected_time_settings=semantic_supported,
        details=details,
        families=families,
    )
    return report, warnings
