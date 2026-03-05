from typing import Literal, Optional

from pydantic import BaseModel


class NotebookCell(BaseModel):
    index: int
    cell_type: Literal["code", "markdown", "raw"]
    source: str
    outputs_text: Optional[str] = None  # flattened text outputs


class ParseNotebookResponse(BaseModel):
    ok: bool
    name: str = ""
    cells: list[NotebookCell] = []
    error: Optional[str] = None


class TransformNotebookRequest(BaseModel):
    cells: list[NotebookCell]
    pipeline_name: str = "Imported Notebook"


class SourceHint(BaseModel):
    source_type: Literal["csv", "excel", "google_sheets", "url", "unknown"] = "unknown"
    filename: Optional[str] = None
    url: Optional[str] = None


class ExportHint(BaseModel):
    export_type: Literal["google_sheets", "file", "unknown"] = "unknown"
    url: Optional[str] = None
    sheet_name: Optional[str] = None
    filename: Optional[str] = None


class TransformNodeDef(BaseModel):
    type: Literal["data_source", "code", "sql", "output", "note", "group", "sheets_export", "publish"]
    name: str = ""
    description: str = ""
    code: Optional[str] = None
    sql: Optional[str] = None
    content: Optional[str] = None  # for note nodes
    output_mode: Optional[Literal["table", "bar", "line", "scatter", "stats"]] = None
    original_cells: list[int] = []
    source_hint: Optional[SourceHint] = None
    export_hint: Optional[ExportHint] = None


class TransformEdgeDef(BaseModel):
    from_index: int
    to_index: int


class TransformNotebookResponse(BaseModel):
    ok: bool
    nodes: list[TransformNodeDef] = []
    edges: list[TransformEdgeDef] = []
    warnings: list[str] = []
    error: Optional[str] = None
