from __future__ import annotations

from fastapi import APIRouter

from app.schemas.model import (
    BatchSimulateRequest,
    BatchSimulateResponse,
    MonteCarloRequest,
    MonteCarloResponse,
    OATSensitivityRequest,
    OATSensitivityResponse,
    SimulateRequest,
    SimulateResponse,
    ValidateRequest,
    ValidateResponse,
)
from app.services.model_service import (
    run_monte_carlo,
    run_oat_sensitivity,
    simulate_model,
    simulate_scenario_batch,
    validate_model,
)

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


@router.post("/models/scenarios/simulate-batch", response_model=BatchSimulateResponse)
def simulate_batch_endpoint(request: BatchSimulateRequest) -> BatchSimulateResponse:
    return simulate_scenario_batch(request)


@router.post("/models/sensitivity/oat", response_model=OATSensitivityResponse)
def sensitivity_oat_endpoint(request: OATSensitivityRequest) -> OATSensitivityResponse:
    return run_oat_sensitivity(request)


@router.post("/models/sensitivity/monte-carlo", response_model=MonteCarloResponse)
def sensitivity_monte_carlo_endpoint(request: MonteCarloRequest) -> MonteCarloResponse:
    return run_monte_carlo(request)
