"""Pydantic schemas for data table API."""
from __future__ import annotations

from pydantic import BaseModel, Field


class DataColumnSchema(BaseModel):
    key: str
    label: str
    type: str  # 'number' | 'string' | 'date'


class GoogleSheetsMetaSchema(BaseModel):
    spreadsheetId: str
    spreadsheetUrl: str
    sheetName: str
    sheetId: int


class ColumnStats(BaseModel):
    dtype: str
    count: int
    nulls: int
    mean: float | None = None
    std: float | None = None
    min: float | None = None
    max: float | None = None
    p25: float | None = Field(None, alias="25%")
    p50: float | None = Field(None, alias="50%")
    p75: float | None = Field(None, alias="75%")
    unique: int | None = None

    model_config = {"populate_by_name": True}


# --- Request schemas ---

class DataTableCreate(BaseModel):
    id: str | None = None
    name: str
    source: str = "csv"
    description: str = ""
    tags: list[str] = []
    columns: list[DataColumnSchema]
    rows: list[list[str | int | float | None]]
    googleSheets: GoogleSheetsMetaSchema | None = None
    original_filename: str | None = None


class DataTableUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    tags: list[str] | None = None
    columns: list[DataColumnSchema] | None = None
    rows: list[list[str | int | float | None]] | None = None
    googleSheets: GoogleSheetsMetaSchema | None = None


# --- Response schemas ---

class DataTableMeta(BaseModel):
    id: str
    name: str
    source: str
    description: str = ""
    tags: list[str] = []
    columns: list[DataColumnSchema]
    rowCount: int
    createdAt: str
    updatedAt: str
    googleSheets: GoogleSheetsMetaSchema | None = None
    original_filename: str | None = None


class DataTableDetail(DataTableMeta):
    rows: list[list[str | int | float | None]]
    column_stats: dict[str, ColumnStats] = {}
