from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


SupportMode = Literal["pysd", "native_fallback", "unsupported"]
PySDSupport = Literal["yes", "partial", "no"]


@dataclass(frozen=True)
class FunctionSpec:
    key: str
    aliases: tuple[str, ...]
    family: str
    support_mode: SupportMode
    pysd_support: PySDSupport
    deterministic: bool
    dimensional: bool
    notes: str


FUNCTION_SPECS: tuple[FunctionSpec, ...] = (
    FunctionSpec("STEP", ("STEP",), "exogenous", "pysd", "yes", True, False, "Classic step input."),
    FunctionSpec("RAMP", ("RAMP",), "exogenous", "pysd", "yes", True, False, "Classic ramp input."),
    FunctionSpec("PULSE", ("PULSE",), "exogenous", "pysd", "yes", True, False, "Pulse function."),
    FunctionSpec("PULSE TRAIN", ("PULSE TRAIN",), "exogenous", "pysd", "yes", True, False, "Pulse train function."),
    FunctionSpec("DELAY1", ("DELAY1",), "dynamic", "pysd", "yes", True, False, "First-order delay."),
    FunctionSpec("DELAY3", ("DELAY3",), "dynamic", "pysd", "yes", True, False, "Third-order delay."),
    FunctionSpec("DELAYN", ("DELAYN",), "dynamic", "pysd", "yes", True, False, "Nth-order delay."),
    FunctionSpec("SMOOTH", ("SMOOTH",), "dynamic", "pysd", "yes", True, False, "First-order smooth."),
    FunctionSpec("SMOOTH3", ("SMOOTH3",), "dynamic", "pysd", "yes", True, False, "Third-order smooth."),
    FunctionSpec("SMOOTHN", ("SMOOTHN",), "dynamic", "pysd", "yes", True, False, "Nth-order smooth."),
    FunctionSpec("GET TIME VALUE", ("GET TIME VALUE",), "time_lookup", "native_fallback", "partial", True, False, "Time-value retrieval has PySD variability."),
    FunctionSpec("RANDOM NORMAL", ("RANDOM NORMAL",), "stochastic", "native_fallback", "partial", False, False, "Random normal distribution."),
    FunctionSpec("RANDOM EXPONENTIAL", ("RANDOM EXPONENTIAL",), "stochastic", "native_fallback", "partial", False, False, "Random exponential distribution."),
    FunctionSpec("SHIFT IF TRUE", ("SHIFT IF TRUE",), "special", "unsupported", "no", True, False, "Not currently translated safely."),
    FunctionSpec("ALLOCATE AVAILABLE", ("ALLOCATE AVAILABLE",), "allocation", "unsupported", "no", True, True, "Allocation structures are not yet supported."),
    FunctionSpec("LOOKUP", ("LOOKUP", "WITH LOOKUP"), "lookup", "pysd", "partial", True, True, "Lookup behavior depends on model encoding."),
)


# Common scalar functions that should never be treated as unsupported advanced features.
BUILTIN_SAFE_FUNCTIONS = {
    "MIN",
    "MAX",
    "ABS",
    "EXP",
    "LOG",
    "SIN",
    "COS",
    "TAN",
    "SQRT",
    "IF THEN ELSE",
    "INTEGER",
}


TIME_SETTING_TOKENS = ("INITIAL TIME", "FINAL TIME", "TIME STEP", "SAVEPER")


def alias_map() -> dict[str, FunctionSpec]:
    out: dict[str, FunctionSpec] = {}
    for spec in FUNCTION_SPECS:
        for alias in spec.aliases:
            out[alias.upper()] = spec
    return out


FUNCTION_ALIAS_MAP = alias_map()
