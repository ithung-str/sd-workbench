from __future__ import annotations

from fastapi import APIRouter

from app.schemas.model import SimulateRequest, SimulateResponse, ValidateRequest, ValidateResponse
from app.services.model_service import simulate_model, validate_model

router = APIRouter(prefix="/api")


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok", "service": "sd-model-backend"}


@router.post("/models/validate", response_model=ValidateResponse)
def validate_endpoint(request: ValidateRequest) -> ValidateResponse:
    return validate_model(request.model)


@router.post("/models/simulate", response_model=SimulateResponse)
def simulate_endpoint(request: SimulateRequest) -> SimulateResponse:
    return simulate_model(request.model, request.sim_config)
