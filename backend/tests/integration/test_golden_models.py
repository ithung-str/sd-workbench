from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import pytest

from app.schemas.model import ModelDocument, SimConfig
from app.simulation.executor import execute_model

GOLDEN_DIR = Path(__file__).resolve().parents[1] / "golden_models"



def _load_case(case_dir: Path):
    model = ModelDocument.model_validate_json((case_dir / "model.json").read_text())
    sim_config = SimConfig.model_validate_json((case_dir / "sim_config.json").read_text())
    tolerances = json.loads((case_dir / "tolerances.json").read_text())
    with (case_dir / "expected.csv").open() as f:
        rows = list(csv.DictReader(f))
    expected = {k: [float(r[k]) for r in rows] for k in rows[0].keys()}
    return model, sim_config, expected, tolerances



def _tol(var: str, tolerances: dict):
    default = tolerances.get("default", {"rtol": 1e-4, "atol": 1e-6})
    varspec = tolerances.get("variables", {}).get(var, {})
    return varspec.get("rtol", default["rtol"]), varspec.get("atol", default["atol"])


@pytest.mark.parametrize("case_name", ["teacup_cooling", "bathtub_inventory", "simple_population"])
def test_golden_model_outputs(case_name: str):
    model, sim_config, expected, tolerances = _load_case(GOLDEN_DIR / case_name)
    actual, _ = execute_model(model, sim_config)
    assert set(expected.keys()) == set(actual.keys())
    for col in expected:
        assert len(expected[col]) == len(actual[col])
        for i, (exp, act) in enumerate(zip(expected[col], actual[col])):
            if col == "time":
                assert math.isclose(exp, act, rel_tol=0.0, abs_tol=1e-12), f"{case_name}:{col}[{i}]"
            else:
                rtol, atol = _tol(col, tolerances)
                assert math.isclose(exp, act, rel_tol=rtol, abs_tol=atol), f"{case_name}:{col}[{i}] expected={exp} actual={act}"
                assert math.isfinite(act)


def test_teacup_monotonic_cooling_invariant():
    model, sim_config, _expected, _tol_cfg = _load_case(GOLDEN_DIR / "teacup_cooling")
    actual, _ = execute_model(model, sim_config)
    temps = actual["temperature"]
    assert all(temps[i+1] <= temps[i] + 1e-12 for i in range(len(temps)-1))
    assert temps[-1] > 70


def test_bathtub_mass_balance_invariant():
    model, sim_config, _expected, _tol_cfg = _load_case(GOLDEN_DIR / "bathtub_inventory")
    actual, _ = execute_model(model, sim_config)
    inv = actual["inventory"]
    inflow = actual["inflow"]
    outflow = actual["outflow"]
    dt = sim_config.dt
    for i in range(len(inv)-1):
        lhs = inv[i+1]
        rhs = inv[i] + (inflow[i] - outflow[i]) * dt
        assert math.isclose(lhs, rhs, rel_tol=0, abs_tol=1e-9)


def test_population_non_negative_invariant():
    model, sim_config, _expected, _tol_cfg = _load_case(GOLDEN_DIR / "simple_population")
    actual, _ = execute_model(model, sim_config)
    assert all(v >= 0 for v in actual["population"])
