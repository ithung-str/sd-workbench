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


class NotebookSection(BaseModel):
    id: str
    name: str
    purpose: str = ""
    cell_indices: list[int] = []


class NotebookAnalysis(BaseModel):
    total_cells: int = 0
    code_cell_count: int = 0
    markdown_cell_count: int = 0
    output_cell_count: int = 0
    export_cell_count: int = 0
    stage_count: int = 0
    complexity_tier: Literal["small", "medium", "large"] = "small"


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
    group_id: Optional[str] = None
    group_name: Optional[str] = None


class TransformEdgeDef(BaseModel):
    from_index: int
    to_index: int


class TransformNotebookResponse(BaseModel):
    ok: bool
    sections: list[NotebookSection] = []
    nodes: list[TransformNodeDef] = []
    edges: list[TransformEdgeDef] = []
    warnings: list[str] = []
    error: Optional[str] = None
