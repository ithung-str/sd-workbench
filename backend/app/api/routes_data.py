"""Data table CRUD API routes."""
from __future__ import annotations

import csv
import io

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from app.schemas.data_table import (
    DataTableCreate,
    DataTableDetail,
    DataTableMeta,
    DataTableUpdate,
)
from app.services.data_service import (
    create_table,
    delete_table,
    get_table,
    list_tables,
    update_table,
    upsert_table,
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
    return create_table(body)


@router.put("/tables/{table_id}/upsert", response_model=DataTableMeta)
def upsert_data_table(table_id: str, body: DataTableCreate) -> DataTableMeta:
    body.id = table_id
    return upsert_table(body)


@router.patch("/tables/{table_id}", response_model=DataTableMeta)
def update_data_table(table_id: str, body: DataTableUpdate) -> DataTableMeta:
    result = update_table(table_id, body)
    if not result:
        raise HTTPException(status_code=404, detail="Table not found")
    return result


@router.delete("/tables/{table_id}", status_code=204)
def delete_data_table(table_id: str) -> None:
    if not delete_table(table_id):
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
