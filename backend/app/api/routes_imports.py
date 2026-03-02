from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, File, UploadFile
from pydantic import BaseModel

from app.converters.model_to_xmile import export_xmile
from app.converters.xmile_to_insightmaker import convert_xmile_to_insightmaker
from app.imports.cache import get_session
from app.imports.errors import imported_http_error
from app.imports.serializer import serialize_insightmaker_xml
from app.imports.service import import_insightmaker_file
from app.imports.spreadsheet_parser import parse_csv, parse_excel
from app.imports.simulator import (
    diagnostics_for_import,
    readiness_for_import,
    run_imported_monte_carlo,
    run_imported_oat_sensitivity,
    simulate_imported_model,
    simulate_imported_model_batch,
)
from app.schemas.imported import (
    ImportedBatchSimulateRequest,
    ImportedBatchSimulateResponse,
    ImportedDiagnosticsResponse,
    ImportedModelResponse,
    ImportedMonteCarloRequest,
    ImportedMonteCarloResponse,
    ImportedOATSensitivityRequest,
    ImportedOATSensitivityResponse,
    ImportedReadinessResponse,
    ImportedSimulateRequest,
    ImportedSimulateResponse,
)
from app.schemas.model import ModelDocument, SimConfig

router = APIRouter(prefix="/api/imports", tags=["imports"])


@router.post("/insightmaker", response_model=ImportedModelResponse)
async def import_insightmaker_endpoint(file: UploadFile | None = File(default=None)) -> ImportedModelResponse:
    if file is None:
        raise imported_http_error(400, "IM_FILE_REQUIRED", "file upload is required")
    return await import_insightmaker_file(file)


@router.post("/simulate", response_model=ImportedSimulateResponse)
def simulate_imported_endpoint(request: ImportedSimulateRequest) -> ImportedSimulateResponse:
    return simulate_imported_model(request)


@router.post("/scenarios/simulate-batch", response_model=ImportedBatchSimulateResponse)
def simulate_imported_batch_endpoint(request: ImportedBatchSimulateRequest) -> ImportedBatchSimulateResponse:
    return simulate_imported_model_batch(request)


@router.post("/sensitivity/oat", response_model=ImportedOATSensitivityResponse)
def sensitivity_imported_oat_endpoint(request: ImportedOATSensitivityRequest) -> ImportedOATSensitivityResponse:
    return run_imported_oat_sensitivity(request)


@router.post("/sensitivity/monte-carlo", response_model=ImportedMonteCarloResponse)
def sensitivity_imported_monte_carlo_endpoint(request: ImportedMonteCarloRequest) -> ImportedMonteCarloResponse:
    return run_imported_monte_carlo(request)


@router.get("/{import_id}/diagnostics", response_model=ImportedDiagnosticsResponse)
def diagnostics_endpoint(import_id: str) -> ImportedDiagnosticsResponse:
    return diagnostics_for_import(import_id)


@router.get("/{import_id}/readiness", response_model=ImportedReadinessResponse)
def readiness_endpoint(import_id: str) -> ImportedReadinessResponse:
    return readiness_for_import(import_id)


@router.get("/{import_id}/insightmaker-xml")
def export_insightmaker_xml(import_id: str) -> dict:
    session = get_session(import_id)
    if session is None or not session.canonical:
        raise imported_http_error(404, "IM_IMPORT_EXPIRED", "Import session not found or expired")
    xml = serialize_insightmaker_xml(session.canonical)
    return {"ok": True, "import_id": import_id, "xml": xml}


class XMILEConvertRequest(BaseModel):
    xml: str


@router.post("/converters/xmile-to-insightmaker")
def convert_xmile_to_insightmaker_endpoint(request: XMILEConvertRequest) -> dict:
    try:
        xml, diagnostics = convert_xmile_to_insightmaker(request.xml)
    except ValueError as exc:
        raise imported_http_error(422, "XMILE_CONVERSION_ERROR", str(exc))
    return {"ok": True, "xml": xml, "diagnostics": diagnostics}


# ---------------------------------------------------------------------------
# CSV / Excel spreadsheet import
# ---------------------------------------------------------------------------


@router.post("/spreadsheet")
async def import_spreadsheet_endpoint(file: UploadFile | None = File(default=None)) -> dict:
    """Import stocks and flows from a CSV or Excel (.xlsx) file."""
    if file is None:
        raise imported_http_error(400, "SS_FILE_REQUIRED", "file upload is required")

    filename = file.filename or "upload"
    normalized = filename.lower()

    if normalized.endswith(".csv"):
        payload_bytes = await file.read()
        payload = payload_bytes.decode("utf-8", errors="ignore")
        try:
            result = parse_csv(payload, filename)
        except ValueError as exc:
            raise imported_http_error(422, "SS_PARSE_ERROR", str(exc))
    elif normalized.endswith(".xlsx"):
        payload_bytes = await file.read()
        try:
            result = parse_excel(payload_bytes, filename)
        except ValueError as exc:
            raise imported_http_error(422, "SS_PARSE_ERROR", str(exc))
    else:
        raise imported_http_error(400, "SS_UNSUPPORTED_FILE", "Only .csv and .xlsx files are supported")

    return {
        "ok": True,
        "model": result["model"].model_dump(),
        "warnings": result["warnings"],
        "node_count": result["node_count"],
    }


# ---------------------------------------------------------------------------
# XMILE export
# ---------------------------------------------------------------------------


class XMILEExportRequest(BaseModel):
    model: ModelDocument
    sim_config: Optional[SimConfig] = None


@router.post("/export/xmile")
def export_xmile_endpoint(request: XMILEExportRequest) -> dict:
    """Export a ModelDocument to XMILE 1.0 XML."""
    try:
        xml = export_xmile(request.model, request.sim_config)
    except Exception as exc:
        raise imported_http_error(422, "XMILE_EXPORT_ERROR", str(exc))
    return {"ok": True, "xml": xml}
