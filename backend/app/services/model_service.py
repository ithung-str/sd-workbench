from __future__ import annotations

from fastapi import HTTPException

from app.schemas.model import (
    ModelDocument,
    SimConfig,
    SimulateResponse,
    ValidateResponse,
)
from app.simulation.executor import execute_model
from app.validation.schema import validate_structure
from app.validation.semantic import validate_semantics



def validate_model(model: ModelDocument) -> ValidateResponse:
    errors1, warnings1 = validate_structure(model)
    errors2, warnings2 = validate_semantics(model)
    errors = [*errors1, *errors2]
    warnings = [*warnings1, *warnings2]
    return ValidateResponse(ok=not errors, errors=errors, warnings=warnings, normalized=model)



def simulate_model(model: ModelDocument, sim_config: SimConfig) -> SimulateResponse:
    validation = validate_model(model)
    if not validation.ok:
        raise HTTPException(
            status_code=422,
            detail={
                "ok": False,
                "errors": [e.model_dump() for e in validation.errors],
                "warnings": [w.model_dump() for w in validation.warnings],
            },
        )
    try:
        series, metadata = execute_model(model, sim_config)
    except Exception as exc:  # pragma: no cover
        raise HTTPException(
            status_code=500,
            detail={
                "ok": False,
                "errors": [
                    {
                        "code": "SIMULATION_RUNTIME_ERROR",
                        "message": str(exc),
                        "severity": "error",
                    }
                ],
                "warnings": [],
            },
        ) from exc

    return SimulateResponse(ok=True, series=series, warnings=validation.warnings, metadata=metadata)
