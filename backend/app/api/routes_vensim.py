from __future__ import annotations

import logging

from fastapi import APIRouter, File, UploadFile

from app.schemas.vensim import (
    VensimBatchSimulateRequest,
    VensimBatchSimulateResponse,
    VensimDiagnosticsResponse,
    VensimMonteCarloRequest,
    VensimMonteCarloResponse,
    VensimOATSensitivityRequest,
    VensimOATSensitivityResponse,
    VensimParityReadinessResponse,
    VensimSimulateRequest,
    VensimSimulateResponse,
)
from app.vensim.cache import get_session
from app.vensim.errors import vensim_http_error
from app.vensim.simulator import (
    run_vensim_monte_carlo,
    run_vensim_oat_sensitivity,
    simulate_imported_vensim,
    simulate_imported_vensim_batch,
)

router = APIRouter(prefix="/api/vensim", tags=["vensim"])
logger = logging.getLogger(__name__)


@router.post("/import")
async def import_vensim_endpoint(file: UploadFile | None = File(default=None)) -> None:
    if file is not None:
        logger.info("MDL import request rejected filename=%s", file.filename)
    raise vensim_http_error(410, "VENSIM_IMPORT_DISABLED", "MDL import is disabled")


@router.post("/simulate", response_model=VensimSimulateResponse)
def simulate_vensim_endpoint(request: VensimSimulateRequest) -> VensimSimulateResponse:
    return simulate_imported_vensim(request)


@router.post("/scenarios/simulate-batch", response_model=VensimBatchSimulateResponse)
def simulate_vensim_batch_endpoint(request: VensimBatchSimulateRequest) -> VensimBatchSimulateResponse:
    return simulate_imported_vensim_batch(request)


@router.post("/sensitivity/oat", response_model=VensimOATSensitivityResponse)
def sensitivity_vensim_oat_endpoint(request: VensimOATSensitivityRequest) -> VensimOATSensitivityResponse:
    return run_vensim_oat_sensitivity(request)


@router.post("/sensitivity/monte-carlo", response_model=VensimMonteCarloResponse)
def sensitivity_vensim_monte_carlo_endpoint(request: VensimMonteCarloRequest) -> VensimMonteCarloResponse:
    return run_vensim_monte_carlo(request)


@router.get("/import/{import_id}/diagnostics", response_model=VensimDiagnosticsResponse)
def diagnostics_endpoint(import_id: str) -> VensimDiagnosticsResponse:
    session = get_session(import_id)
    if session is None:
        raise vensim_http_error(404, "VENSIM_IMPORT_EXPIRED", "Import session not found or expired")
    return VensimDiagnosticsResponse(
        ok=True,
        import_id=import_id,
        capabilities=session.capabilities,
        warnings=session.warnings or [],
        errors=session.errors or [],
        import_gaps=session.import_gaps,
    )


@router.get("/import/{import_id}/parity-readiness", response_model=VensimParityReadinessResponse)
def parity_readiness_endpoint(import_id: str) -> VensimParityReadinessResponse:
    session = get_session(import_id)
    if session is None:
        raise vensim_http_error(404, "VENSIM_IMPORT_EXPIRED", "Import session not found or expired")
    return VensimParityReadinessResponse(
        ok=True,
        import_id=import_id,
        readiness=session.parity_readiness,
        reasons=session.parity_reasons,
    )
