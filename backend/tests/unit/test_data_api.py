"""Tests for the data tables API."""
import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


@pytest.fixture(autouse=True)
def _cleanup():
    """Clean up test tables after each test."""
    yield
    # Delete all tables created during the test
    resp = client.get("/api/data/tables")
    for t in resp.json():
        client.delete(f"/api/data/tables/{t['id']}")


def _create_sample(name="Test Table", source="csv"):
    return client.post("/api/data/tables", json={
        "name": name,
        "source": source,
        "description": "A test table",
        "tags": ["test", "demo"],
        "columns": [
            {"key": "x", "label": "X", "type": "number"},
            {"key": "y", "label": "Y", "type": "string"},
        ],
        "rows": [[1, "a"], [2, "b"], [3, None]],
    })


def test_create_and_list():
    resp = _create_sample()
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "Test Table"
    assert body["rowCount"] == 3
    assert body["tags"] == ["test", "demo"]

    listing = client.get("/api/data/tables").json()
    assert len(listing) >= 1
    assert any(t["id"] == body["id"] for t in listing)


def test_get_detail_with_stats():
    create_resp = _create_sample()
    table_id = create_resp.json()["id"]

    resp = client.get(f"/api/data/tables/{table_id}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["rows"] == [[1, "a"], [2, "b"], [3, None]]
    assert "column_stats" in body
    assert "x" in body["column_stats"]
    stats_x = body["column_stats"]["x"]
    assert stats_x["count"] == 3
    assert stats_x["min"] == 1
    assert stats_x["max"] == 3


def test_rename():
    table_id = _create_sample().json()["id"]
    resp = client.patch(f"/api/data/tables/{table_id}", json={"name": "Renamed"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Renamed"


def test_update_description_and_tags():
    table_id = _create_sample().json()["id"]
    resp = client.patch(f"/api/data/tables/{table_id}", json={
        "description": "Updated desc",
        "tags": ["updated"],
    })
    assert resp.status_code == 200
    assert resp.json()["description"] == "Updated desc"
    assert resp.json()["tags"] == ["updated"]


def test_delete():
    table_id = _create_sample().json()["id"]
    resp = client.delete(f"/api/data/tables/{table_id}")
    assert resp.status_code == 204
    assert client.get(f"/api/data/tables/{table_id}").status_code == 404


def test_search():
    _create_sample("Sales Data")
    _create_sample("Weather Data")

    resp = client.get("/api/data/tables", params={"search": "sales"})
    assert resp.status_code == 200
    results = resp.json()
    assert len(results) == 1
    assert results[0]["name"] == "Sales Data"


def test_filter_by_source():
    _create_sample("CSV Table", source="csv")
    _create_sample("Sheets Table", source="google_sheets")

    resp = client.get("/api/data/tables", params={"source": "csv"})
    results = resp.json()
    assert all(t["source"] == "csv" for t in results)


def test_export_csv():
    table_id = _create_sample().json()["id"]
    resp = client.get(f"/api/data/tables/{table_id}/export/csv")
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    lines = resp.text.strip().splitlines()
    assert lines[0].strip() == "X,Y"
    assert len(lines) == 4  # header + 3 rows


def test_upsert():
    # Create via upsert
    resp = client.put("/api/data/tables/dt_upsert_test/upsert", json={
        "id": "dt_upsert_test",
        "name": "First",
        "source": "csv",
        "columns": [{"key": "a", "label": "A", "type": "number"}],
        "rows": [[1]],
    })
    assert resp.status_code == 200
    assert resp.json()["name"] == "First"

    # Update via upsert
    resp = client.put("/api/data/tables/dt_upsert_test/upsert", json={
        "id": "dt_upsert_test",
        "name": "Updated",
        "source": "csv",
        "columns": [{"key": "a", "label": "A", "type": "number"}],
        "rows": [[1], [2]],
    })
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated"
    assert resp.json()["rowCount"] == 2
