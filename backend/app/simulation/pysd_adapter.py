from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from app.simulation.integrator import simulate_euler
from app.simulation.translator import translate_model
from app.schemas.model import ModelDocument, SimConfig


EngineName = Literal["internal_euler", "pysd"]


@dataclass
class SimulationRunResult:
    engine: EngineName
    series: dict[str, list[float]]



def run(model: ModelDocument, sim_config: SimConfig, engine: EngineName = "internal_euler") -> SimulationRunResult:
    executable = translate_model(model)
    # MVP: PySD adapter falls back to internal engine until JSON->PySD bridge is implemented.
    series = simulate_euler(executable, start=sim_config.start, stop=sim_config.stop, dt=sim_config.dt)
    actual_engine: EngineName = "internal_euler" if engine == "internal_euler" else "pysd"
    return SimulationRunResult(engine=actual_engine, series=series)
