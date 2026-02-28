from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator

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


class VensimImportGapItem(BaseModel):
    kind: Literal["variable", "edge", "equation", "construct", "layout"]
    symbol: str
    reason: str
    severity: Literal["info", "warning", "error"] = "warning"

    model_config = ConfigDict(extra="forbid")


class VensimImportGapSummary(BaseModel):
    dropped_variables: int = 0
    dropped_edges: int = 0
    unparsed_equations: int = 0
    unsupported_constructs: list[str] = Field(default_factory=list)
    samples: list[VensimImportGapItem] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class VensimFunctionCapabilityDetail(BaseModel):
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


class VensimFamilyCapabilitySummary(BaseModel):
    family: str
    functions: list[str] = Field(default_factory=list)
    highest_severity: Literal["info", "warning", "error"] = "info"
    support_mode: Literal["pysd", "native_fallback", "unsupported"] = "pysd"

    model_config = ConfigDict(extra="forbid")


class VensimCapabilityReport(BaseModel):
    tier: Literal["T0", "T1", "T2", "T3", "T4"]
    supported: list[str] = Field(default_factory=list)
    partial: list[str] = Field(default_factory=list)
    unsupported: list[str] = Field(default_factory=list)
    detected_functions: list[str] = Field(default_factory=list)
    detected_time_settings: list[str] = Field(default_factory=list)
    details: list[VensimFunctionCapabilityDetail] = Field(default_factory=list)
    families: list[VensimFamilyCapabilitySummary] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class VensimImportSource(BaseModel):
    filename: str
    format: Literal["vensim-mdl"] = "vensim-mdl"

    model_config = ConfigDict(extra="forbid")


class VensimModelView(BaseModel):
    canonical: Optional[ModelDocument] = None
    variables: list[ImportedVariableSummary] = Field(default_factory=list)
    dimensions: list[ImportedDimensionSummary] = Field(default_factory=list)
    time_settings: Optional[ImportedTimeSettings] = None
    dependency_graph: Optional[ImportedGraphSummary] = None
    import_gaps: VensimImportGapSummary = Field(default_factory=VensimImportGapSummary)

    model_config = ConfigDict(extra="forbid")


class VensimImportResponse(BaseModel):
    ok: bool
    import_id: str
    source: VensimImportSource
    capabilities: VensimCapabilityReport
    warnings: list[ValidationIssue] = Field(default_factory=list)
    errors: list[ValidationIssue] = Field(default_factory=list)
    model_view: VensimModelView

    model_config = ConfigDict(extra="forbid")


class VensimDiagnosticsResponse(BaseModel):
    ok: bool
    import_id: str
    capabilities: VensimCapabilityReport
    warnings: list[ValidationIssue] = Field(default_factory=list)
    errors: list[ValidationIssue] = Field(default_factory=list)
    import_gaps: VensimImportGapSummary = Field(default_factory=VensimImportGapSummary)

    model_config = ConfigDict(extra="forbid")


class VensimParityReadinessResponse(BaseModel):
    ok: bool
    import_id: str
    readiness: Literal["green", "yellow", "red"]
    reasons: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class VensimSimConfigOverride(BaseModel):
    start: Optional[float] = None
    stop: Optional[float] = None
    dt: Optional[float] = None
    saveper: Optional[float] = None

    model_config = ConfigDict(extra="forbid")


class VensimSimulateRequest(BaseModel):
    import_id: str
    sim_config: Optional[VensimSimConfigOverride] = None
    outputs: list[str] = Field(default_factory=list)
    params: dict[str, float | str] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class VensimSimulateMetadata(BaseModel):
    engine: Literal["pysd"]
    source_format: Literal["vensim-mdl"]
    import_id: str
    row_count: int
    variables_returned: list[str]
    time: ImportedTimeSettings
    execution_mode: Literal["pysd", "mixed", "blocked"] = "pysd"
    fallback_activations: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class VensimSimulateResponse(BaseModel):
    ok: bool
    series: dict[str, list[float]]
    warnings: list[ValidationIssue] = Field(default_factory=list)
    metadata: VensimSimulateMetadata

    model_config = ConfigDict(extra="forbid")


class VensimScenarioRunResult(BaseModel):
    scenario_id: str
    scenario_name: str
    series: dict[str, list[float]]
    warnings: list[ValidationIssue] = Field(default_factory=list)
    metadata: VensimSimulateMetadata

    model_config = ConfigDict(extra="forbid")


class VensimBatchSimulateRequest(BaseModel):
    import_id: str
    sim_config: Optional[VensimSimConfigOverride] = None
    scenarios: list[ScenarioDefinition] = Field(default_factory=list)
    include_baseline: bool = True
    outputs: list[str] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class VensimBatchSimulateResponse(BaseModel):
    ok: bool
    runs: list[VensimScenarioRunResult] = Field(default_factory=list)
    errors: list[ScenarioRunError] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class VensimOATSensitivityRequest(BaseModel):
    import_id: str
    sim_config: Optional[VensimSimConfigOverride] = None
    scenarios: list[ScenarioDefinition] = Field(default_factory=list)
    scenario_id: Optional[str] = None
    output: str
    metric: Literal["final", "max", "min", "mean"] = "final"
    parameters: list[SensitivityParameterRange] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class VensimOATSensitivityResponse(BaseModel):
    ok: bool
    scenario_id: str
    output: str
    metric: Literal["final", "max", "min", "mean"]
    baseline_metric: float
    items: list[OATSensitivityItem] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class VensimMonteCarloRequest(BaseModel):
    import_id: str
    sim_config: Optional[VensimSimConfigOverride] = None
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


class VensimMonteCarloSample(BaseModel):
    run_index: int
    metric_value: float
    params: dict[str, float] = Field(default_factory=dict)

    model_config = ConfigDict(extra="forbid")


class VensimMonteCarloQuantiles(BaseModel):
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


class VensimMonteCarloResponse(BaseModel):
    ok: bool
    scenario_id: str
    output: str
    metric: Literal["final", "max", "min", "mean"]
    runs: int
    seed: int
    quantiles: VensimMonteCarloQuantiles
    samples: list[VensimMonteCarloSample] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")
