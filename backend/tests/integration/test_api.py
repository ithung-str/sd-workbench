from __future__ import annotations

import csv
import json
from pathlib import Path

import pytest

pytest.importorskip("fastapi")
pytest.importorskip("httpx")
from fastapi.testclient import TestClient

from app.main import app

ROOT = Path(__file__).resolve().parents[1] / "golden_models"



def _load_json(path: Path):
    return json.loads(path.read_text())



def test_health():
    client = TestClient(app)
    resp = client.get("/api/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"



def test_validate_returns_structured_errors_with_node_id():
    client = TestClient(app)
    payload = {
        "model": {
            "id": "m1",
            "name": "broken",
            "version": 1,
            "nodes": [
                {"id": "s1", "type": "stock", "name": "temperature", "label": "T", "equation": "x", "initial_value": 1, "position": {"x": 0, "y": 0}}
            ],
            "edges": [],
            "outputs": ["temperature"]
        }
    }
    resp = client.post("/api/models/validate", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is False
    assert any(e["code"] == "UNKNOWN_SYMBOL" and e.get("node_id") == "s1" for e in body["errors"])



def test_simulate_returns_series_time_and_expected_length():
    client = TestClient(app)
    case = ROOT / "teacup_cooling"
    payload = {
        "model": _load_json(case / "model.json"),
        "sim_config": _load_json(case / "sim_config.json"),
    }
    resp = client.post("/api/models/simulate", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert "time" in body["series"]
    start, stop, dt = payload["sim_config"]["start"], payload["sim_config"]["stop"], payload["sim_config"]["dt"]
    expected_len = int(round((stop - start) / dt)) + 1
    assert len(body["series"]["time"]) == expected_len
    for key, values in body["series"].items():
        assert all(v == v for v in values), f"NaN in {key}"



def test_simulate_returns_422_on_invalid_model():
    client = TestClient(app)
    payload = {
        "model": {
            "id": "m1",
            "name": "broken",
            "version": 1,
            "nodes": [
                {"id": "s1", "type": "stock", "name": "stock", "label": "Stock", "equation": "missing", "initial_value": 1, "position": {"x": 0, "y": 0}}
            ],
            "edges": [],
            "outputs": ["stock"]
        },
        "sim_config": {"start": 0, "stop": 5, "dt": 1, "method": "euler"}
    }
    resp = client.post("/api/models/simulate", json=payload)
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert any(e["code"] == "UNKNOWN_SYMBOL" for e in detail["errors"])


def test_simulate_batch_runs_baseline_and_policy():
    client = TestClient(app)
    case = ROOT / "teacup_cooling"
    payload = {
        "model": _load_json(case / "model.json"),
        "sim_config": _load_json(case / "sim_config.json"),
        "scenarios": [
            {
                "id": "policy_fast_cooling",
                "name": "Policy: Faster cooling",
                "status": "policy",
                "overrides": {
                    "params": {"cooling_constant": 0.3},
                },
            }
        ],
        "include_baseline": True,
    }
    resp = client.post("/api/models/scenarios/simulate-batch", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert len(body["runs"]) == 2
    assert {run["scenario_id"] for run in body["runs"]} == {"baseline", "policy_fast_cooling"}


def test_oat_sensitivity_returns_ranked_items():
    client = TestClient(app)
    case = ROOT / "teacup_cooling"
    payload = {
        "model": _load_json(case / "model.json"),
        "sim_config": _load_json(case / "sim_config.json"),
        "output": "temperature",
        "metric": "final",
        "parameters": [
            {"name": "ambient_temperature", "low": 60, "high": 80, "steps": 3},
            {"name": "cooling_constant", "low": 0.05, "high": 0.2, "steps": 4},
        ],
    }
    resp = client.post("/api/models/sensitivity/oat", json=payload)
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["output"] == "temperature"
    assert len(body["items"]) == 2
    assert body["items"][0]["normalized_swing"] >= body["items"][1]["normalized_swing"]


def test_monte_carlo_is_deterministic_for_seed():
    client = TestClient(app)
    case = ROOT / "teacup_cooling"
    payload = {
        "model": _load_json(case / "model.json"),
        "sim_config": _load_json(case / "sim_config.json"),
        "output": "temperature",
        "metric": "final",
        "runs": 25,
        "seed": 1234,
        "parameters": [
            {"name": "ambient_temperature", "distribution": "uniform", "min": 65, "max": 75},
            {"name": "cooling_constant", "distribution": "triangular", "min": 0.08, "max": 0.2, "mode": 0.11},
        ],
    }
    resp1 = client.post("/api/models/sensitivity/monte-carlo", json=payload)
    resp2 = client.post("/api/models/sensitivity/monte-carlo", json=payload)
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    body1 = resp1.json()
    body2 = resp2.json()
    assert body1["quantiles"] == body2["quantiles"]
    assert [s["metric_value"] for s in body1["samples"]] == [s["metric_value"] for s in body2["samples"]]
