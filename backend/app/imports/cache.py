from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Literal

from app.schemas.imported import (
    ImportGapSummary,
    ImportedCapabilityReport,
    ImportedTimeSettings,
    ImportedVariableSummary,
)


@dataclass
class ImportSession:
    import_id: str
    filename: str
    source_format: Literal["insightmaker-xml", "vensim-mdl"]
    source_path: Path | None = None
    model_handle: Any | None = None
    canonical: Any | None = None
    variables: list[ImportedVariableSummary] = field(default_factory=list)
    time_settings: ImportedTimeSettings = field(default_factory=ImportedTimeSettings)
    capabilities: ImportedCapabilityReport = field(default_factory=lambda: ImportedCapabilityReport(tier="T0"))
    warnings: list[dict] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)
    import_gaps: ImportGapSummary = field(default_factory=ImportGapSummary)
    parity_readiness: str = "yellow"
    parity_reasons: list[str] = field(default_factory=list)


_SESSIONS: dict[str, ImportSession] = {}


def put_session(session: ImportSession) -> None:
    _SESSIONS[session.import_id] = session


def get_session(import_id: str) -> ImportSession | None:
    return _SESSIONS.get(import_id)
