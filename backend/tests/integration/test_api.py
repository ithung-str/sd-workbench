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
