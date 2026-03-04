"""Tests for pipeline result caching API."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _cleanup():
    yield
    client.delete("/api/analysis/pipelines/test_pipeline/results")


def test_save_and_load_results():
    # Initially empty
    resp = client.get("/api/analysis/pipelines/test_pipeline/results")
    assert resp.status_code == 200
    assert resp.json()["results"] == {}

    # Save some results
    results = {
        "node_1": {"ok": True, "preview": {"columns": [], "rows": []}, "shape": [10, 2]},
        "node_2": {"ok": False, "error": "Something went wrong"},
    }
    resp = client.put(
        "/api/analysis/pipelines/test_pipeline/results",
        json={"results": results},
    )
    assert resp.status_code == 200

    # Load them back
    resp = client.get("/api/analysis/pipelines/test_pipeline/results")
    assert resp.status_code == 200
    loaded = resp.json()["results"]
    assert loaded["node_1"]["ok"] is True
    assert loaded["node_1"]["shape"] == [10, 2]
    assert loaded["node_2"]["ok"] is False
    assert loaded["node_2"]["error"] == "Something went wrong"


def test_merge_results():
    # Save initial results
    client.put(
        "/api/analysis/pipelines/test_pipeline/results",
        json={"results": {"node_1": {"ok": True}}},
    )

    # Save more (should merge via upsert)
    client.put(
        "/api/analysis/pipelines/test_pipeline/results",
        json={"results": {"node_2": {"ok": True}}},
    )

    resp = client.get("/api/analysis/pipelines/test_pipeline/results")
    loaded = resp.json()["results"]
    assert "node_1" in loaded
    assert "node_2" in loaded


def test_clear_results():
    client.put(
        "/api/analysis/pipelines/test_pipeline/results",
        json={"results": {"node_1": {"ok": True}}},
    )

    resp = client.delete("/api/analysis/pipelines/test_pipeline/results")
    assert resp.status_code == 200

    resp = client.get("/api/analysis/pipelines/test_pipeline/results")
    assert resp.json()["results"] == {}
