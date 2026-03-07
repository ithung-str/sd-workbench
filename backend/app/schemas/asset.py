"""Pydantic schemas for the asset API."""
from __future__ import annotations

from enum import Enum
from typing import Literal, Optional

from pydantic import BaseModel, Field

from app.schemas.data_table import ColumnStats, DataColumnSchema, GoogleSheetsMetaSchema


class AssetKind(str, Enum):
    table = "table"
    file = "file"
    value = "value"


class AssetLineage(BaseModel):
    pipeline_id: str
    node_id: str
    run_at: Optional[str] = None


# --- Response schemas ---


class AssetMeta(BaseModel):
    id: str
    slug: Optional[str] = None
    name: str
    kind: AssetKind = AssetKind.table
    source: str = "upload"
    description: str = ""
    tags: list[str] = []
    version: int = 1
    versions_count: int = 1
    lineage: Optional[AssetLineage] = None
    # Table-specific
    columns: Optional[list[DataColumnSchema]] = None
    row_count: Optional[int] = None
    # Timestamps
    created_at: str = ""
    updated_at: str = ""
    # Google Sheets (table assets only)
    google_sheets: Optional[GoogleSheetsMetaSchema] = None
    original_filename: Optional[str] = None


class AssetDetail(AssetMeta):
    # Table
    rows: Optional[list[list]] = None
    column_stats: Optional[dict[str, ColumnStats]] = None
    # File
    content_text: Optional[str] = None
    # Value
    value: Optional[object] = None


class AssetVersionMeta(BaseModel):
    id: str
    version: int
    created_at: str
    updated_at: str
    row_count: Optional[int] = None
    lineage: Optional[AssetLineage] = None


# --- Request schemas ---


class AssetCreate(BaseModel):
    id: Optional[str] = None
    name: str
    kind: AssetKind = AssetKind.table
    source: str = "upload"
    slug: Optional[str] = None
    description: str = ""
    tags: list[str] = []
    lineage: Optional[AssetLineage] = None
    # Table
    columns: Optional[list[DataColumnSchema]] = None
    rows: Optional[list[list]] = None
    # File
    content_text: Optional[str] = None
    # Value
    value: Optional[object] = None
    # Google Sheets
    google_sheets: Optional[GoogleSheetsMetaSchema] = None
    original_filename: Optional[str] = None


class AssetUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    description: Optional[str] = None
    tags: Optional[list[str]] = None
    # Table
    columns: Optional[list[DataColumnSchema]] = None
    rows: Optional[list[list]] = None
    # File
    content_text: Optional[str] = None
    # Value
    value: Optional[object] = None
    # Google Sheets
    google_sheets: Optional[GoogleSheetsMetaSchema] = None


class AssetPublish(BaseModel):
    """Publish a new version of an asset from pipeline output."""
    # Table
    columns: Optional[list[DataColumnSchema]] = None
    rows: Optional[list[list]] = None
    # File
    content_text: Optional[str] = None
    # Value
    value: Optional[object] = None
    # Lineage
    lineage: Optional[AssetLineage] = None
