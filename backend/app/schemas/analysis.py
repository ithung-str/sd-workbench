from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class AnalysisNodeSchema(BaseModel):
    id: str
    type: Literal["data_source", "code", "sql", "output", "note", "group", "sheets_export", "publish"]
    x: float = 0
    y: float = 0
    w: Optional[float] = None
    h: Optional[float] = None
    data_table_id: Optional[str] = None
    code: Optional[str] = None
    sql: Optional[str] = None
    content: Optional[str] = None
    output_mode: Optional[Literal["table", "bar", "line", "scatter"]] = None
    chart_config: Optional[dict] = None
    parent_group: Optional[str] = None
    collapsed: Optional[bool] = None
    group_color: Optional[str] = None
    spreadsheet_url: Optional[str] = None
    sheet_name: Optional[str] = None
    publish_table_id: Optional[str] = None
    publish_mode: Optional[Literal["overwrite", "append"]] = None

    model_config = ConfigDict(extra="forbid")


class AnalysisEdgeSchema(BaseModel):
    id: str
    source: str
    target: str

    model_config = ConfigDict(extra="forbid")


class AnalysisPipelineSchema(BaseModel):
    id: str
    name: str
    nodes: list[AnalysisNodeSchema] = Field(default_factory=list)
    edges: list[AnalysisEdgeSchema] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class AnalysisComponentSchema(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    code: str

    model_config = ConfigDict(extra="forbid")


# --- Execution request/response ---

class DataTablePayload(BaseModel):
    columns: list[dict]
    rows: list[list]


class ExecuteNode(BaseModel):
    id: str
    type: Literal["data_source", "code", "sql", "output", "note", "group", "sheets_export", "publish"]
    code: Optional[str] = None
    sql: Optional[str] = None
    data_table: Optional[DataTablePayload] = None
    publish_table_name: Optional[str] = None
    publish_table_id: Optional[str] = None
    publish_mode: Optional[Literal["overwrite", "append"]] = None


class ExecuteEdge(BaseModel):
    source: str
    target: str


class ExecutePipelineRequest(BaseModel):
    pipeline_id: str
    run_from: Optional[str] = None
    nodes: list[ExecuteNode]
    edges: list[ExecuteEdge]


class NodeResultResponse(BaseModel):
    ok: bool
    preview: Optional[dict] = None
    shape: Optional[list[int]] = None
    logs: Optional[str] = None
    error: Optional[str] = None


class ExecutePipelineResponse(BaseModel):
    results: dict[str, NodeResultResponse]
