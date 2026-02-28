from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from app.schemas.vensim import (
    ImportedTimeSettings,
    VensimCapabilityReport,
    ImportedVariableSummary,
    VensimImportGapSummary,
)


@dataclass
class VensimImportSession:
    import_id: str
    filename: str
    mdl_path: Path
    model_handle: Any | None
    variables: list[ImportedVariableSummary] = field(default_factory=list)
    time_settings: ImportedTimeSettings = field(default_factory=ImportedTimeSettings)
    capabilities: VensimCapabilityReport = field(default_factory=lambda: VensimCapabilityReport(tier="T0"))
    warnings: list[dict] = field(default_factory=list)
    errors: list[dict] = field(default_factory=list)
    canonical: dict | None = None
    diagnostics: dict = field(default_factory=dict)
    import_gaps: VensimImportGapSummary = field(default_factory=VensimImportGapSummary)
    parity_readiness: str = "yellow"
    parity_reasons: list[str] = field(default_factory=list)


_SESSIONS: dict[str, VensimImportSession] = {}


def put_session(session: VensimImportSession) -> None:
    _SESSIONS[session.import_id] = session



def get_session(import_id: str) -> VensimImportSession | None:
    return _SESSIONS.get(import_id)
