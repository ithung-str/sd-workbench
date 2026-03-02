from __future__ import annotations

from typing import Annotated, Literal, Optional, Union

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class Position(BaseModel):
    x: float
    y: float


class LookupPoint(BaseModel):
    x: float
    y: float

    model_config = ConfigDict(extra="forbid")


class WaypointPosition(BaseModel):
    x: float
    y: float

    model_config = ConfigDict(extra="forbid")


class VisualStyle(BaseModel):
    fill: Optional[str] = None
    stroke: Optional[str] = None
    stroke_width: Optional[float] = None
    line_style: Optional[str] = None
    opacity: Optional[float] = None
    text_color: Optional[str] = None
    font_family: Optional[str] = None
    font_size: Optional[float] = None
    font_weight: Optional[str] = None
    text_align: Optional[str] = None
    background: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class LayoutMetadata(BaseModel):
    width: Optional[float] = None
    height: Optional[float] = None
    rotation: Optional[float] = None
    visible: Optional[bool] = None
    locked: Optional[bool] = None
    z_index: Optional[int] = None
    source: Optional[str] = None
    waypoints: Optional[list[WaypointPosition]] = None

    model_config = ConfigDict(extra="forbid")


class AnnotationMetadata(BaseModel):
    kind: Optional[str] = None
    title: Optional[str] = None
    note: Optional[str] = None
    raw_xml: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class ImportedModelInfo(BaseModel):
    description: Optional[str] = None
    author: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class ImportedRoundTripMetadata(BaseModel):
    source_ids: dict[str, str] = Field(default_factory=dict)
    unmapped_fragments: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class ImportedMetadata(BaseModel):
    source_format: Optional[str] = None
    model_info: Optional[ImportedModelInfo] = None
    style_defaults: dict[str, str] = Field(default_factory=dict)
    roundtrip: Optional[ImportedRoundTripMetadata] = None

    model_config = ConfigDict(extra="forbid")


class BaseNode(BaseModel):
    id: str
    type: str
    name: str
    label: str
    equation: str
    units: Optional[str] = None
    position: Position
    style: Optional[VisualStyle] = None
    layout: Optional[LayoutMetadata] = None
    annotation: Optional[AnnotationMetadata] = None
    source_id: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class StockNode(BaseNode):
    type: Literal["stock"]
    initial_value: float | str
    min_value: Optional[float] = None
    max_value: Optional[float] = None


class AuxNode(BaseNode):
    type: Literal["aux"]


class FlowNode(BaseNode):
    type: Literal["flow"]
    source_stock_id: Optional[str] = None
    target_stock_id: Optional[str] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None


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
    style: Optional[VisualStyle] = None
    layout: Optional[LayoutMetadata] = None
    annotation: Optional[AnnotationMetadata] = None
    source_id: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class CloudNode(BaseModel):
    id: str
    type: Literal["cloud"]
    position: Position

    model_config = ConfigDict(extra="forbid")


Node = Annotated[Union[StockNode, AuxNode, FlowNode, LookupNode, TextNode, CloudNode], Field(discriminator="type")]


class InfluenceEdge(BaseModel):
    id: str
    type: Literal["influence"]
    source: str
    target: str
    source_handle: Optional[str] = None
    target_handle: Optional[str] = None
    style: Optional[VisualStyle] = None
    layout: Optional[LayoutMetadata] = None
    source_id: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class FlowLinkEdge(BaseModel):
    id: str
    type: Literal["flow_link"]
    source: str
    target: str
    source_handle: Optional[str] = None
    target_handle: Optional[str] = None
    style: Optional[VisualStyle] = None
    layout: Optional[LayoutMetadata] = None

    model_config = ConfigDict(extra="forbid")


Edge = Annotated[Union[InfluenceEdge, FlowLinkEdge], Field(discriminator="type")]


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


class SimConfigOverride(BaseModel):
    start: Optional[float] = None
    stop: Optional[float] = None
    dt: Optional[float] = None
    return_step: Optional[float] = None

    model_config = ConfigDict(extra="forbid")


class ScenarioOverrides(BaseModel):
    sim_config: Optional[SimConfigOverride] = None
    outputs: list[str] = Field(default_factory=list)
    params: dict[str, float | str] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class ScenarioDefinition(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    color: Optional[str] = None
    tags: list[str] = Field(default_factory=list)
    status: Literal["baseline", "policy", "draft", "archived"] = "policy"
    overrides: ScenarioOverrides = Field(default_factory=ScenarioOverrides)

    model_config = ConfigDict(extra="forbid")


class DashboardCard(BaseModel):
    id: str
    type: Literal["kpi", "line", "table"]
    title: str
    variable: str
    order: int
    table_rows: Optional[int] = None
    x: Optional[float] = None
    y: Optional[float] = None
    w: Optional[float] = None
    h: Optional[float] = None

    model_config = ConfigDict(extra="forbid")


class DashboardDefinition(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    cards: list[DashboardCard] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class AnalysisDefaults(BaseModel):
    baseline_scenario_id: Optional[str] = None
    active_dashboard_id: Optional[str] = None

    model_config = ConfigDict(extra="forbid")


class AnalysisConfig(BaseModel):
    scenarios: list[ScenarioDefinition] = Field(default_factory=list)
    dashboards: list[DashboardDefinition] = Field(default_factory=list)
    defaults: AnalysisDefaults = Field(default_factory=AnalysisDefaults)

    model_config = ConfigDict(extra="forbid")


class DiagramStyleDefaults(BaseModel):
    stock: Optional[VisualStyle] = None
    flow: Optional[VisualStyle] = None
    aux: Optional[VisualStyle] = None
    lookup: Optional[VisualStyle] = None

    model_config = ConfigDict(extra="forbid")


class ModelMetadata(BaseModel):
    description: Optional[str] = None
    author: Optional[str] = None
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    analysis: Optional[AnalysisConfig] = None
    imported: Optional[ImportedMetadata] = None
    default_styles: Optional[DiagramStyleDefaults] = None

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


class ScenarioRunResult(BaseModel):
    scenario_id: str
    scenario_name: str
    series: dict[str, list[float]]
    warnings: list[ValidationIssue] = Field(default_factory=list)
    metadata: SimulateMetadata

    model_config = ConfigDict(extra="forbid")


class ScenarioRunError(BaseModel):
    scenario_id: str
    scenario_name: str
    code: str
    message: str

    model_config = ConfigDict(extra="forbid")


class BatchSimulateRequest(BaseModel):
    model: ModelDocument
    sim_config: SimConfig
    scenarios: list[ScenarioDefinition] = Field(default_factory=list)
    include_baseline: bool = True

    model_config = ConfigDict(extra="forbid")


class BatchSimulateResponse(BaseModel):
    ok: bool
    runs: list[ScenarioRunResult] = Field(default_factory=list)
    errors: list[ScenarioRunError] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class SensitivityParameterRange(BaseModel):
    name: str
    low: float
    high: float
    steps: int = 5

    model_config = ConfigDict(extra="forbid")

    @model_validator(mode="after")
    def _validate_bounds(self) -> "SensitivityParameterRange":
        if self.steps < 2:
            raise ValueError("steps must be >= 2")
        if self.high < self.low:
            raise ValueError("high must be >= low")
        return self


class OATSensitivityRequest(BaseModel):
    model: ModelDocument
    sim_config: SimConfig
    scenarios: list[ScenarioDefinition] = Field(default_factory=list)
    scenario_id: Optional[str] = None
    output: str
    metric: Literal["final", "max", "min", "mean"] = "final"
    parameters: list[SensitivityParameterRange] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class OATSensitivityPoint(BaseModel):
    parameter: str
    value: float
    metric_value: float

    model_config = ConfigDict(extra="forbid")


class OATSensitivityItem(BaseModel):
    parameter: str
    baseline_metric: float
    min_metric: float
    max_metric: float
    swing: float
    normalized_swing: float
    points: list[OATSensitivityPoint] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class OATSensitivityResponse(BaseModel):
    ok: bool
    scenario_id: str
    output: str
    metric: Literal["final", "max", "min", "mean"]
    baseline_metric: float
    items: list[OATSensitivityItem] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class MonteCarloParameter(BaseModel):
    name: str
    distribution: Literal["uniform", "normal", "triangular"] = "uniform"
    min: Optional[float] = None
    max: Optional[float] = None
    mean: Optional[float] = None
    stddev: Optional[float] = None
    mode: Optional[float] = None

    model_config = ConfigDict(extra="forbid")


class MonteCarloRequest(BaseModel):
    model: ModelDocument
    sim_config: SimConfig
    scenarios: list[ScenarioDefinition] = Field(default_factory=list)
    scenario_id: Optional[str] = None
    output: str
    metric: Literal["final", "max", "min", "mean"] = "final"
    runs: int = 100
    seed: int = 42
    parameters: list[MonteCarloParameter] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")

    @field_validator("runs")
    @classmethod
    def _runs_in_range(cls, value: int) -> int:
        if value < 2:
            raise ValueError("runs must be >= 2")
        if value > 5000:
            raise ValueError("runs must be <= 5000")
        return value


class MonteCarloRunMetric(BaseModel):
    run_index: int
    metric_value: float
    params: dict[str, float] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class MonteCarloQuantiles(BaseModel):
    p05: float
    p25: float
    p50: float
    p75: float
    p95: float
    mean: float
    stddev: float
    min: float
    max: float

    model_config = ConfigDict(extra="forbid")


class MonteCarloResponse(BaseModel):
    ok: bool
    scenario_id: str
    output: str
    metric: Literal["final", "max", "min", "mean"]
    runs: int
    seed: int
    quantiles: MonteCarloQuantiles
    samples: list[MonteCarloRunMetric] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")
