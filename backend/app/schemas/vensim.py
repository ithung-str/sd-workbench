from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

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


class VensimCapabilityReport(BaseModel):
    tier: Literal["T0", "T1", "T2", "T3", "T4"]
    supported: list[str] = Field(default_factory=list)
    partial: list[str] = Field(default_factory=list)
    unsupported: list[str] = Field(default_factory=list)
    detected_functions: list[str] = Field(default_factory=list)
    detected_time_settings: list[str] = Field(default_factory=list)

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

    model_config = ConfigDict(extra="forbid")


class VensimSimulateResponse(BaseModel):
    ok: bool
    series: dict[str, list[float]]
    warnings: list[ValidationIssue] = Field(default_factory=list)
    metadata: VensimSimulateMetadata

    model_config = ConfigDict(extra="forbid")
