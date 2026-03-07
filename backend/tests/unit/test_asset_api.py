"""Tests for the asset API layer."""
import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _uid() -> str:
    return uuid.uuid4().hex[:8]


def _create_table_asset(name: str = "Test Asset", slug: str | None = None):
    body = {
        "name": name,
        "kind": "table",
        "source": "upload",
        "columns": [{"key": "a", "label": "A", "type": "number"}],
        "rows": [[1], [2], [3]],
    }
    if slug:
        body["slug"] = slug
    resp = client.post("/api/assets", json=body)
    assert resp.status_code == 201
    return resp.json()


def test_create_and_get():
    asset = _create_table_asset("Revenue Data")
    assert asset["name"] == "Revenue Data"
    assert asset["kind"] == "table"
    assert asset["slug"] is not None
    assert asset["row_count"] == 3

    detail = client.get(f"/api/assets/{asset['id']}").json()
    assert detail["rows"] == [[1], [2], [3]]
    assert detail["versions_count"] == 1


def test_list_assets():
    _create_table_asset("List Test A")
    resp = client.get("/api/assets")
    assert resp.status_code == 200
    names = [a["name"] for a in resp.json()]
    assert "List Test A" in names


def test_list_filter_by_kind():
    _create_table_asset("Kind Filter Test")
    resp = client.get("/api/assets", params={"kind": "file"})
    names = [a["name"] for a in resp.json()]
    assert "Kind Filter Test" not in names


def test_slug_lookup():
    slug = f"my-slug-{_uid()}"
    asset = _create_table_asset("Slug Lookup", slug=slug)
    resp = client.get(f"/api/assets/by-slug/{slug}")
    assert resp.status_code == 200
    assert resp.json()["id"] == asset["id"]


def test_slug_data_json():
    slug = f"slug-data-{_uid()}"
    _create_table_asset("Slug Data", slug=slug)
    resp = client.get(f"/api/assets/by-slug/{slug}/data")
    assert resp.status_code == 200
    data = resp.json()
    assert "columns" in data
    assert "rows" in data
    assert len(data["rows"]) == 3


def test_slug_data_csv():
    slug = f"csv-export-{_uid()}"
    _create_table_asset("CSV Export", slug=slug)
    resp = client.get(f"/api/assets/by-slug/{slug}/data", params={"format": "csv"})
    assert resp.status_code == 200
    assert "text/csv" in resp.headers["content-type"]
    lines = resp.text.strip().split("\n")
    assert len(lines) == 4  # header + 3 rows


def test_publish_version():
    slug = f"versioned-{_uid()}"
    asset = _create_table_asset("Versioned", slug=slug)
    asset_id = asset["id"]

    # Publish v2
    resp = client.post(f"/api/assets/{asset_id}/publish", json={
        "columns": [{"key": "a", "label": "A", "type": "number"}],
        "rows": [[10], [20]],
        "lineage": {"pipeline_id": "pipe1", "node_id": "node1"},
    })
    assert resp.status_code == 201
    v2 = resp.json()
    assert v2["version"] == 2

    # Latest by slug should be v2
    latest = client.get(f"/api/assets/by-slug/{slug}").json()
    assert latest["version"] == 2
    assert latest["rows"] == [[10], [20]]
    assert latest["versions_count"] == 2


def test_version_history():
    slug = f"history-test-{_uid()}"
    asset = _create_table_asset("History Test", slug=slug)
    asset_id = asset["id"]

    client.post(f"/api/assets/{asset_id}/publish", json={
        "rows": [[99]],
    })

    resp = client.get(f"/api/assets/{asset_id}/versions")
    assert resp.status_code == 200
    versions = resp.json()
    assert len(versions) == 2
    assert versions[0]["version"] == 2
    assert versions[1]["version"] == 1


def test_update_asset():
    asset = _create_table_asset("Update Me")
    resp = client.put(f"/api/assets/{asset['id']}", json={"name": "Updated Name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated Name"


def test_delete_asset():
    asset = _create_table_asset("Delete Me")
    resp = client.delete(f"/api/assets/{asset['id']}")
    assert resp.status_code == 204

    resp = client.get(f"/api/assets/{asset['id']}")
    assert resp.status_code == 404


def test_file_asset():
    resp = client.post("/api/assets", json={
        "name": "Config File",
        "kind": "file",
        "source": "upload",
        "content_text": "key: value\nfoo: bar",
    })
    assert resp.status_code == 201
    asset = resp.json()
    assert asset["kind"] == "file"

    detail = client.get(f"/api/assets/{asset['id']}").json()
    assert detail["content_text"] == "key: value\nfoo: bar"


def test_value_asset():
    resp = client.post("/api/assets", json={
        "name": "KPI",
        "kind": "value",
        "source": "pipeline",
        "value": {"revenue": 1234, "growth": 0.15},
    })
    assert resp.status_code == 201
    asset = resp.json()
    assert asset["kind"] == "value"

    detail = client.get(f"/api/assets/{asset['id']}").json()
    assert detail["value"] == {"revenue": 1234, "growth": 0.15}


def test_backward_compat_data_tables():
    """Existing /api/data/tables endpoints still work."""
    resp = client.post("/api/data/tables", json={
        "name": "Compat Table",
        "columns": [{"key": "x", "label": "X", "type": "string"}],
        "rows": [["hello"]],
    })
    assert resp.status_code == 201
    table = resp.json()
    assert table["name"] == "Compat Table"

    # Should also appear in assets list
    assets = client.get("/api/assets").json()
    assert any(a["id"] == table["id"] for a in assets)


def test_slug_uniqueness():
    a1 = _create_table_asset("Same Name")
    a2 = _create_table_asset("Same Name")
    assert a1["slug"] != a2["slug"]
    assert a2["slug"].startswith("same-name")
