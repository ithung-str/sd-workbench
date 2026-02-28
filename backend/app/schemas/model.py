from __future__ import annotations

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, Field, ConfigDict, field_validator, model_validator


class Position(BaseModel):
    x: float
    y: float


class LookupPoint(BaseModel):
    x: float
    y: float

    model_config = ConfigDict(extra="forbid")


class BaseNode(BaseModel):
    id: str
    type: str
    name: str
    label: str
    equation: str
    units: Optional[str] = None
    position: Position

    model_config = ConfigDict(extra="forbid")


class StockNode(BaseNode):
    type: Literal["stock"]
    initial_value: float | str


class AuxNode(BaseNode):
    type: Literal["aux"]


class FlowNode(BaseNode):
    type: Literal["flow"]
    source_stock_id: Optional[str] = None
    target_stock_id: Optional[str] = None


class LookupNode(BaseNode):
    type: Literal["lookup"]
    points: list[LookupPoint] = Field(default_factory=list)
    interpolation: Literal["linear"] = "linear"

    @field_validator("points")
    @classmethod
    def _validate_points(cls, points: list[LookupPoint]) -> list[LookupPoint]:
        if len(points) < 2:
            raise ValueError("lookup points must contain at least 2 points")
        xs = [p.x for p in points]
        if xs != sorted(xs):
            raise ValueError("lookup points must be sorted by x")
        if len(set(xs)) != len(xs):
            raise ValueError("lookup points x values must be unique")
        return points


class TextNode(BaseModel):
    id: str
    type: Literal["text"]
    text: str = ""
    position: Position

    model_config = ConfigDict(extra="forbid")


Node = Annotated[Union[StockNode, AuxNode, FlowNode, LookupNode, TextNode], Field(discriminator="type")]


class InfluenceEdge(BaseModel):
    id: str
    type: Literal["influence"]
    source: str
    target: str
    source_handle: Optional[str] = None
    target_handle: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class FlowLinkEdge(BaseModel):
    id: str
    type: Literal["flow_link"]
    source: str
    target: str
    source_handle: Optional[str] = None
    target_handle: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


Edge = Annotated[Union[InfluenceEdge, FlowLinkEdge], Field(discriminator="type")]


class ModelMetadata(BaseModel):
    description: Optional[str] = None
    author: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class ModelDocument(BaseModel):
    id: str
    name: str
    version: Literal[1]
    metadata: Optional[ModelMetadata] = None
    nodes: list[Node]
    edges: list[Edge] = Field(default_factory=list)
    outputs: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class SimConfig(BaseModel):
    start: float
    stop: float
    dt: float
    method: Literal["euler"] = "euler"
    return_step: Optional[float] = None

    model_config = ConfigDict(extra="forbid")

    @field_validator("dt")
    @classmethod
    def _positive_dt(cls, value: float) -> float:
        if value <= 0:
            raise ValueError("dt must be > 0")
        return value

    @model_validator(mode="after")
    def _validate_range(self) -> "SimConfig":
        if self.stop < self.start:
            raise ValueError("stop must be >= start")
        if self.return_step is not None and self.return_step <= 0:
            raise ValueError("return_step must be > 0")
        return self


class ValidationIssue(BaseModel):
    code: str
    message: str
    severity: Literal["error", "warning"]
    node_id: Optional[str] = None
    edge_id: Optional[str] = None
    field: Optional[str] = None
    symbol: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class ValidateRequest(BaseModel):
    model: ModelDocument

    model_config = ConfigDict(extra="forbid")


class ValidateResponse(BaseModel):
    ok: bool
    errors: list[ValidationIssue] = Field(default_factory=list)
    warnings: list[ValidationIssue] = Field(default_factory=list)
    normalized: Optional[ModelDocument] = None

    model_config = ConfigDict(extra="forbid")


class SimulateRequest(BaseModel):
    model: ModelDocument
    sim_config: SimConfig

    model_config = ConfigDict(extra="forbid")


class SimulateMetadata(BaseModel):
    engine: str
    method: Literal["euler"]
    row_count: int
    variables_returned: list[str]

    model_config = ConfigDict(extra="forbid")


class SimulateResponse(BaseModel):
    ok: bool
    series: dict[str, list[float]]
    warnings: list[ValidationIssue] = Field(default_factory=list)
    metadata: SimulateMetadata

    model_config = ConfigDict(extra="forbid")
