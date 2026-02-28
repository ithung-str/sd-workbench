from __future__ import annotations

from fastapi import APIRouter, File, UploadFile

from app.schemas.vensim import VensimImportResponse, VensimSimulateRequest, VensimSimulateResponse
from app.vensim.importer import import_vensim_file
from app.vensim.simulator import simulate_imported_vensim

router = APIRouter(prefix="/api/vensim", tags=["vensim"])


@router.post("/import", response_model=VensimImportResponse)
async def import_vensim_endpoint(file: UploadFile = File(...)) -> VensimImportResponse:
    return await import_vensim_file(file)


@router.post("/simulate", response_model=VensimSimulateResponse)
def simulate_vensim_endpoint(request: VensimSimulateRequest) -> VensimSimulateResponse:
    return simulate_imported_vensim(request)
