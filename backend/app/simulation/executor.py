from __future__ import annotations

from app.schemas.model import ModelDocument, SimConfig, SimulateMetadata, SimulateResponse
from app.simulation.pysd_adapter import run



def execute_model(model: ModelDocument, sim_config: SimConfig) -> tuple[dict[str, list[float]], SimulateMetadata]:
    result = run(model, sim_config, engine="internal_euler")
    row_count = len(result.series.get("time", []))
    metadata = SimulateMetadata(
        engine=result.engine,
        method="euler",
        row_count=row_count,
        variables_returned=list(result.series.keys()),
    )
    return result.series, metadata
