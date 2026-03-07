"""Data table CRUD API routes (backward-compatible layer over asset service)."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas.asset import AssetCreate, AssetKind, AssetUpdate
from app.schemas.data_table import (
    DataTableCreate,
    DataTableDetail,
    DataTableMeta,
    DataTableUpdate,
)
from app.services import asset_service
from app.services.data_service import (
    get_table,
    list_tables,
)

router = APIRouter(prefix="/api/data", tags=["data"])


@router.get("/tables", response_model=list[DataTableMeta])
def list_data_tables(
    search: str | None = None,
    source: str | None = None,
    tag: str | None = None,
) -> list[DataTableMeta]:
    return list_tables(search=search, source=source, tag=tag)


@router.get("/tables/{table_id}", response_model=DataTableDetail)
def get_data_table(table_id: str) -> DataTableDetail:
    table = get_table(table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")
    return table


@router.post("/tables", response_model=DataTableMeta, status_code=201)
def create_data_table(body: DataTableCreate) -> DataTableMeta:
    """Create a data table (delegates to asset service)."""
    asset = asset_service.create_asset(AssetCreate(
        id=body.id,
        name=body.name,
        kind=AssetKind.table,
        source=body.source,
        description=body.description,
        tags=body.tags,
        columns=body.columns,
        rows=body.rows,
        google_sheets=body.googleSheets,
        original_filename=body.original_filename,
    ))
    # Return in DataTableMeta format
    table = get_table(asset.id)
    if not table:
        raise HTTPException(status_code=500, detail="Failed to create table")
    return DataTableMeta(
        id=table.id,
        name=table.name,
        source=table.source,
        description=table.description,
        tags=table.tags,
        columns=table.columns,
        rowCount=table.rowCount,
        createdAt=table.createdAt,
        updatedAt=table.updatedAt,
        googleSheets=table.googleSheets,
        original_filename=table.original_filename,
    )


@router.put("/tables/{table_id}/upsert", response_model=DataTableMeta)
def upsert_data_table(table_id: str, body: DataTableCreate) -> DataTableMeta:
    body.id = table_id
    asset = asset_service.upsert_asset(AssetCreate(
        id=body.id,
        name=body.name,
        kind=AssetKind.table,
        source=body.source,
        description=body.description,
        tags=body.tags,
        columns=body.columns,
        rows=body.rows,
        google_sheets=body.googleSheets,
        original_filename=body.original_filename,
    ))
    table = get_table(asset.id)
    if not table:
        raise HTTPException(status_code=500, detail="Failed to upsert table")
    return DataTableMeta(
        id=table.id,
        name=table.name,
        source=table.source,
        description=table.description,
        tags=table.tags,
        columns=table.columns,
        rowCount=table.rowCount,
        createdAt=table.createdAt,
        updatedAt=table.updatedAt,
        googleSheets=table.googleSheets,
        original_filename=table.original_filename,
    )


@router.patch("/tables/{table_id}", response_model=DataTableMeta)
def update_data_table(table_id: str, body: DataTableUpdate) -> DataTableMeta:
    result = asset_service.update_asset(table_id, AssetUpdate(
        name=body.name,
        description=body.description,
        tags=body.tags,
        columns=body.columns,
        rows=body.rows,
        google_sheets=body.googleSheets,
    ))
    if not result:
        raise HTTPException(status_code=404, detail="Table not found")
    table = get_table(table_id)
    if not table:
        raise HTTPException(status_code=500, detail="Table not found after update")
    return DataTableMeta(
        id=table.id,
        name=table.name,
        source=table.source,
        description=table.description,
        tags=table.tags,
        columns=table.columns,
        rowCount=table.rowCount,
        createdAt=table.createdAt,
        updatedAt=table.updatedAt,
        googleSheets=table.googleSheets,
        original_filename=table.original_filename,
    )


@router.delete("/tables/{table_id}", status_code=204)
def delete_data_table(table_id: str) -> None:
    if not asset_service.delete_asset(table_id):
        raise HTTPException(status_code=404, detail="Table not found")


@router.get("/tables/{table_id}/export/csv")
def export_csv(table_id: str) -> StreamingResponse:
    table = get_table(table_id)
    if not table:
        raise HTTPException(status_code=404, detail="Table not found")

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([col.label for col in table.columns])
    for row in table.rows:
        writer.writerow(row)
    buf.seek(0)

    filename = table.name.replace('"', "'") + ".csv"
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
