from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.model import (
    MonteCarloParameter,
    OATSensitivityItem,
    ScenarioDefinition,
    ScenarioRunError,
    SensitivityParameterRange,
)
from app.schemas.model import ModelDocument, ValidationIssue


class ImportedVariableSummary(BaseModel):
    name: str
    py_name: Optional[str] = None
    kind: Optional[str] = None
    equation: Optional[str] = None
    units: Optional[str] = None
    doc: Optional[str] = None
    dimensions: list[str] = Field(default_factory=list)
    dependencies: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class ImportedDimensionSummary(BaseModel):
    name: str
    values: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class ImportedTimeSettings(BaseModel):
    initial_time: Optional[float] = None
    final_time: Optional[float] = None
    time_step: Optional[float] = None
    saveper: Optional[float] = None

    model_config = ConfigDict(extra="forbid")


class ImportedGraphSummary(BaseModel):
    edges: list[tuple[str, str]] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class ImportGapItem(BaseModel):
    kind: Literal["variable", "edge", "equation", "construct", "layout"]
    symbol: str
    reason: str
    severity: Literal["info", "warning", "error"] = "warning"

    model_config = ConfigDict(extra="forbid")


class ImportGapSummary(BaseModel):
    dropped_variables: int = 0
    dropped_edges: int = 0
    unparsed_equations: int = 0
    unsupported_constructs: list[str] = Field(default_factory=list)
    samples: list[ImportGapItem] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class ImportedFunctionCapabilityDetail(BaseModel):
    function: str
    family: str
    support_mode: Literal["pysd", "native_fallback", "unsupported"]
    pysd_support: Literal["yes", "partial", "no"]
    deterministic: bool
    dimensional: bool
    count: int = 1
    severity: Literal["info", "warning", "error"] = "info"
    notes: str = ""

    model_config = ConfigDict(extra="forbid")


class ImportedFamilyCapabilitySummary(BaseModel):
    family: str
    functions: list[str] = Field(default_factory=list)
    highest_severity: Literal["info", "warning", "error"] = "info"
    support_mode: Literal["pysd", "native_fallback", "unsupported"] = "pysd"

    model_config = ConfigDict(extra="forbid")


class ImportedCapabilityReport(BaseModel):
    tier: Literal["T0", "T1", "T2", "T3", "T4"]
    supported: list[str] = Field(default_factory=list)
    partial: list[str] = Field(default_factory=list)
    unsupported: list[str] = Field(default_factory=list)
    detected_functions: list[str] = Field(default_factory=list)
    detected_time_settings: list[str] = Field(default_factory=list)
    details: list[ImportedFunctionCapabilityDetail] = Field(default_factory=list)
    families: list[ImportedFamilyCapabilitySummary] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class ImportedModelSource(BaseModel):
    filename: str
    format: Literal["insightmaker-xml", "vensim-mdl"] = "insightmaker-xml"

    model_config = ConfigDict(extra="forbid")


class ImportedVisualSummary(BaseModel):
    text_nodes: int = 0
    display_nodes: int = 0
    styled_nodes: int = 0
    styled_edges: int = 0

    model_config = ConfigDict(extra="forbid")


class ImportedModelView(BaseModel):
    canonical: Optional[ModelDocument] = None
    variables: list[ImportedVariableSummary] = Field(default_factory=list)
    dimensions: list[ImportedDimensionSummary] = Field(default_factory=list)
    time_settings: Optional[ImportedTimeSettings] = None
    dependency_graph: Optional[ImportedGraphSummary] = None
    import_gaps: ImportGapSummary = Field(default_factory=ImportGapSummary)
    visual_summary: ImportedVisualSummary = Field(default_factory=ImportedVisualSummary)

    model_config = ConfigDict(extra="forbid")


class ImportedModelResponse(BaseModel):
    ok: bool
    import_id: str
    source: ImportedModelSource
    capabilities: ImportedCapabilityReport
    warnings: list[ValidationIssue] = Field(default_factory=list)
    errors: list[ValidationIssue] = Field(default_factory=list)
    model_view: ImportedModelView

    model_config = ConfigDict(extra="forbid")


class ImportedDiagnosticsResponse(BaseModel):
    ok: bool
    import_id: str
    capabilities: ImportedCapabilityReport
    warnings: list[ValidationIssue] = Field(default_factory=list)
    errors: list[ValidationIssue] = Field(default_factory=list)
    import_gaps: ImportGapSummary = Field(default_factory=ImportGapSummary)

    model_config = ConfigDict(extra="forbid")


class ImportedReadinessResponse(BaseModel):
    ok: bool
    import_id: str
    readiness: Literal["green", "yellow", "red"]
    reasons: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class ImportedSimConfigOverride(BaseModel):
    start: Optional[float] = None
    stop: Optional[float] = None
    dt: Optional[float] = None
    saveper: Optional[float] = None

    model_config = ConfigDict(extra="forbid")


class ImportedSimulateRequest(BaseModel):
    import_id: str
    sim_config: Optional[ImportedSimConfigOverride] = None
    outputs: list[str] = Field(default_factory=list)
    params: dict[str, float | str] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class ImportedSimulateMetadata(BaseModel):
    engine: Literal["pysd", "internal_euler"]
    source_format: Literal["insightmaker-xml", "vensim-mdl"]
    import_id: str
    row_count: int
    variables_returned: list[str]
    time: ImportedTimeSettings
    execution_mode: Literal["pysd", "mixed", "blocked", "native"] = "native"
    fallback_activations: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class ImportedSimulateResponse(BaseModel):
    ok: bool
    series: dict[str, list[float]]
    warnings: list[ValidationIssue] = Field(default_factory=list)
    metadata: ImportedSimulateMetadata

    model_config = ConfigDict(extra="forbid")


class ImportedScenarioRunResult(BaseModel):
    scenario_id: str
    scenario_name: str
    series: dict[str, list[float]]
    warnings: list[ValidationIssue] = Field(default_factory=list)
    metadata: ImportedSimulateMetadata

    model_config = ConfigDict(extra="forbid")


class ImportedBatchSimulateRequest(BaseModel):
    import_id: str
    sim_config: Optional[ImportedSimConfigOverride] = None
    scenarios: list[ScenarioDefinition] = Field(default_factory=list)
    include_baseline: bool = True
    outputs: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class ImportedBatchSimulateResponse(BaseModel):
    ok: bool
    runs: list[ImportedScenarioRunResult] = Field(default_factory=list)
    errors: list[ScenarioRunError] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class ImportedOATSensitivityRequest(BaseModel):
    import_id: str
    sim_config: Optional[ImportedSimConfigOverride] = None
    scenarios: list[ScenarioDefinition] = Field(default_factory=list)
    scenario_id: Optional[str] = None
    output: str
    metric: Literal["final", "max", "min", "mean"]
    parameters: list[SensitivityParameterRange] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class ImportedOATSensitivityResponse(BaseModel):
    ok: bool
    scenario_id: str
    output: str
    metric: Literal["final", "max", "min", "mean"]
    baseline_metric: float
    items: list[OATSensitivityItem] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class ImportedMonteCarloSample(BaseModel):
    run_index: int
    metric_value: float
    params: dict[str, float]

    model_config = ConfigDict(extra="forbid")


class ImportedMonteCarloQuantiles(BaseModel):
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


class ImportedMonteCarloRequest(BaseModel):
    import_id: str
    sim_config: Optional[ImportedSimConfigOverride] = None
    scenarios: list[ScenarioDefinition] = Field(default_factory=list)
    scenario_id: Optional[str] = None
    output: str
    metric: Literal["final", "max", "min", "mean"]
    runs: int = 100
    seed: int = 42
    parameters: list[MonteCarloParameter] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class ImportedMonteCarloResponse(BaseModel):
    ok: bool
    scenario_id: str
    output: str
    metric: Literal["final", "max", "min", "mean"]
    runs: int
    seed: int
    quantiles: ImportedMonteCarloQuantiles
    samples: list[ImportedMonteCarloSample]

    model_config = ConfigDict(extra="forbid")
