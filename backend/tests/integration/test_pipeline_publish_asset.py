"""Integration test: pipeline publish node → asset creation → slug API retrieval.

Tests the full flow:
1. Run a pipeline with a data_source → code → publish node
2. Verify the publish node creates an asset with a slug
3. Retrieve the asset via the /by-slug/:slug endpoint
4. Retrieve the raw data via /by-slug/:slug/data
5. Re-run the pipeline → verify a new version is published
6. Verify /by-slug/:slug returns the latest version
"""
import uuid

from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def _uid() -> str:
    return uuid.uuid4().hex[:8]


def test_pipeline_publish_creates_asset_and_slug_works():
    """Full integration: pipeline → publish → asset → slug → data."""
    pipe_id = f"pipe_{_uid()}"
    publish_table_id = f"dt_pub_{_uid()}"
    publish_name = f"Revenue Report {_uid()}"

    # Step 1: Run pipeline with publish node
    resp = client.post("/api/analysis/execute", json={
        "pipeline_id": pipe_id,
        "nodes": [
            {
                "id": "src",
                "type": "data_source",
                "data_table": {
                    "columns": [
                        {"key": "quarter", "label": "Quarter", "type": "string"},
                        {"key": "revenue", "label": "Revenue", "type": "number"},
                    ],
                    "rows": [["Q1", 100], ["Q2", 200], ["Q3", 300]],
                },
            },
            {
                "id": "transform",
                "type": "code",
                "code": "df['revenue_k'] = df['revenue'] / 1000",
            },
            {
                "id": "pub",
                "type": "publish",
                "publish_table_id": publish_table_id,
                "publish_table_name": publish_name,
                "publish_mode": "overwrite",
            },
        ],
        "edges": [
            {"source": "src", "target": "transform"},
            {"source": "transform", "target": "pub"},
        ],
    })
    assert resp.status_code == 200
    results = resp.json()["results"]
    assert results["src"]["ok"]
    assert results["transform"]["ok"]
    assert results["pub"]["ok"]
    assert "slug:" in results["pub"]["logs"].lower() or publish_name in results["pub"]["logs"]

    # Step 2: Verify the asset exists via direct API
    asset_resp = client.get(f"/api/assets/{publish_table_id}")
    assert asset_resp.status_code == 200
    asset = asset_resp.json()
    assert asset["name"] == publish_name
    assert asset["kind"] == "table"
    assert asset["source"] == "pipeline"
    assert asset["slug"] is not None
    assert asset["version"] == 1
    slug = asset["slug"]

    # Step 3: Retrieve via slug (the "latest" endpoint)
    slug_resp = client.get(f"/api/assets/by-slug/{slug}")
    assert slug_resp.status_code == 200
    slug_asset = slug_resp.json()
    assert slug_asset["name"] == publish_name
    assert slug_asset["row_count"] == 3

    # Step 4: Get raw data via slug
    data_resp = client.get(f"/api/assets/by-slug/{slug}/data")
    assert data_resp.status_code == 200
    data = data_resp.json()
    assert len(data["columns"]) == 3  # quarter, revenue, revenue_k
    assert len(data["rows"]) == 3
    # Check the transform was applied
    col_keys = [c["key"] for c in data["columns"]]
    assert "revenue_k" in col_keys

    # Step 5: Get as CSV
    csv_resp = client.get(f"/api/assets/by-slug/{slug}/data", params={"format": "csv"})
    assert csv_resp.status_code == 200
    assert "text/csv" in csv_resp.headers["content-type"]
    csv_lines = csv_resp.text.strip().split("\n")
    assert len(csv_lines) == 4  # header + 3 rows

    # Step 6: Re-run pipeline with updated data → new version
    resp2 = client.post("/api/analysis/execute", json={
        "pipeline_id": pipe_id,
        "nodes": [
            {
                "id": "src",
                "type": "data_source",
                "data_table": {
                    "columns": [
                        {"key": "quarter", "label": "Quarter", "type": "string"},
                        {"key": "revenue", "label": "Revenue", "type": "number"},
                    ],
                    "rows": [["Q1", 150], ["Q2", 250], ["Q3", 350], ["Q4", 400]],
                },
            },
            {
                "id": "transform",
                "type": "code",
                "code": "df['revenue_k'] = df['revenue'] / 1000",
            },
            {
                "id": "pub",
                "type": "publish",
                "publish_table_id": publish_table_id,
                "publish_table_name": publish_name,
                "publish_mode": "overwrite",
            },
        ],
        "edges": [
            {"source": "src", "target": "transform"},
            {"source": "transform", "target": "pub"},
        ],
    })
    assert resp2.status_code == 200
    assert resp2.json()["results"]["pub"]["ok"]

    # Step 7: Slug now resolves to v2 with 4 rows
    latest_resp = client.get(f"/api/assets/by-slug/{slug}")
    assert latest_resp.status_code == 200
    latest = latest_resp.json()
    assert latest["version"] == 2
    assert latest["row_count"] == 4
    assert latest["versions_count"] == 2

    # Step 8: Verify version history
    versions_resp = client.get(f"/api/assets/{publish_table_id}/versions")
    assert versions_resp.status_code == 200
    versions = versions_resp.json()
    assert len(versions) == 2
    assert versions[0]["version"] == 2  # newest first
    assert versions[1]["version"] == 1

    # Step 9: Raw data via slug now returns the updated data
    data_resp2 = client.get(f"/api/assets/by-slug/{slug}/data")
    assert data_resp2.status_code == 200
    data2 = data_resp2.json()
    assert len(data2["rows"]) == 4
    # Q4 should be present
    quarters = [row[0] for row in data2["rows"]]
    assert "Q4" in quarters


def test_pipeline_publish_append_mode():
    """Pipeline publish with append mode adds rows to existing asset."""
    pipe_id = f"pipe_{_uid()}"
    publish_table_id = f"dt_append_{_uid()}"

    # First run: create initial asset
    client.post("/api/analysis/execute", json={
        "pipeline_id": pipe_id,
        "nodes": [
            {
                "id": "src",
                "type": "data_source",
                "data_table": {
                    "columns": [{"key": "x", "label": "X", "type": "number"}],
                    "rows": [[1], [2]],
                },
            },
            {
                "id": "pub",
                "type": "publish",
                "publish_table_id": publish_table_id,
                "publish_table_name": "Append Test",
                "publish_mode": "overwrite",
            },
        ],
        "edges": [{"source": "src", "target": "pub"}],
    })

    # Verify 2 rows
    asset = client.get(f"/api/assets/{publish_table_id}").json()
    assert asset["row_count"] == 2

    # Second run: append mode
    resp = client.post("/api/analysis/execute", json={
        "pipeline_id": pipe_id,
        "nodes": [
            {
                "id": "src",
                "type": "data_source",
                "data_table": {
                    "columns": [{"key": "x", "label": "X", "type": "number"}],
                    "rows": [[3], [4], [5]],
                },
            },
            {
                "id": "pub",
                "type": "publish",
                "publish_table_id": publish_table_id,
                "publish_table_name": "Append Test",
                "publish_mode": "append",
            },
        ],
        "edges": [{"source": "src", "target": "pub"}],
    })
    assert resp.status_code == 200
    assert resp.json()["results"]["pub"]["ok"]
    assert "total: 5" in resp.json()["results"]["pub"]["logs"].lower()

    # Verify 5 rows total
    asset2 = client.get(f"/api/assets/{publish_table_id}").json()
    assert asset2["row_count"] == 5


def test_old_data_tables_api_creates_asset_with_slug():
    """Upload via legacy /api/data/tables → visible in /api/assets with a slug."""
    resp = client.post("/api/data/tables", json={
        "name": f"Legacy Upload {_uid()}",
        "source": "csv",
        "columns": [{"key": "a", "label": "A", "type": "number"}],
        "rows": [[10], [20]],
    })
    assert resp.status_code == 201
    table = resp.json()
    table_id = table["id"]

    # Should appear in assets list
    assets = client.get("/api/assets").json()
    match = [a for a in assets if a["id"] == table_id]
    assert len(match) == 1
    asset = match[0]
    assert asset["slug"] is not None
    assert asset["kind"] == "table"

    # Slug endpoint works
    slug_resp = client.get(f"/api/assets/by-slug/{asset['slug']}")
    assert slug_resp.status_code == 200
    assert slug_resp.json()["id"] == table_id

    # Data endpoint works
    data_resp = client.get(f"/api/assets/by-slug/{asset['slug']}/data")
    assert data_resp.status_code == 200
    assert len(data_resp.json()["rows"]) == 2

    # Old GET endpoint still works
    old_resp = client.get(f"/api/data/tables/{table_id}")
    assert old_resp.status_code == 200
    assert old_resp.json()["name"] == table["name"]


def test_delete_asset_cascades_versions_and_slug():
    """Deleting an asset removes all versions and the slug returns 404."""
    pipe_id = f"pipe_{_uid()}"
    pub_id = f"dt_del_{_uid()}"

    # Create initial asset via pipeline
    client.post("/api/analysis/execute", json={
        "pipeline_id": pipe_id,
        "nodes": [
            {"id": "src", "type": "data_source", "data_table": {
                "columns": [{"key": "x", "label": "X", "type": "number"}],
                "rows": [[1]],
            }},
            {"id": "pub", "type": "publish", "publish_table_id": pub_id,
             "publish_table_name": "To Delete", "publish_mode": "overwrite"},
        ],
        "edges": [{"source": "src", "target": "pub"}],
    })

    # Publish v2
    asset = client.get(f"/api/assets/{pub_id}").json()
    slug = asset["slug"]
    client.post(f"/api/assets/{pub_id}/publish", json={
        "rows": [[99]],
    })

    # Verify 2 versions exist
    versions = client.get(f"/api/assets/{pub_id}/versions").json()
    assert len(versions) == 2

    # Delete
    del_resp = client.delete(f"/api/assets/{pub_id}")
    assert del_resp.status_code == 204

    # Asset gone
    assert client.get(f"/api/assets/{pub_id}").status_code == 404

    # Slug gone
    assert client.get(f"/api/assets/by-slug/{slug}").status_code == 404

    # Versions gone
    assert client.get(f"/api/assets/{pub_id}/versions").status_code == 404


def test_slug_stable_across_versions():
    """Slug stays the same after publishing new versions."""
    pub_id = f"dt_stable_{_uid()}"
    pipe_id = f"pipe_{_uid()}"

    # Create
    client.post("/api/analysis/execute", json={
        "pipeline_id": pipe_id,
        "nodes": [
            {"id": "src", "type": "data_source", "data_table": {
                "columns": [{"key": "x", "label": "X", "type": "number"}],
                "rows": [[1]],
            }},
            {"id": "pub", "type": "publish", "publish_table_id": pub_id,
             "publish_table_name": "Stable Slug", "publish_mode": "overwrite"},
        ],
        "edges": [{"source": "src", "target": "pub"}],
    })

    asset_v1 = client.get(f"/api/assets/{pub_id}").json()
    slug = asset_v1["slug"]

    # Publish v2 and v3
    for i in range(2):
        client.post(f"/api/assets/{pub_id}/publish", json={"rows": [[i + 10]]})

    # Same slug still works and returns v3
    latest = client.get(f"/api/assets/by-slug/{slug}").json()
    assert latest["version"] == 3
    assert latest["slug"] == slug


def test_pipeline_publish_new_asset_without_id():
    """Pipeline publish without a pre-set table_id creates a new asset."""
    pipe_id = f"pipe_{_uid()}"

    resp = client.post("/api/analysis/execute", json={
        "pipeline_id": pipe_id,
        "nodes": [
            {
                "id": "src",
                "type": "data_source",
                "data_table": {
                    "columns": [{"key": "v", "label": "Value", "type": "number"}],
                    "rows": [[42]],
                },
            },
            {
                "id": "pub",
                "type": "publish",
                "publish_table_name": "Auto Created",
            },
        ],
        "edges": [{"source": "src", "target": "pub"}],
    })
    assert resp.status_code == 200
    result = resp.json()["results"]["pub"]
    assert result["ok"]

    # The asset should appear in the assets list
    assets = client.get("/api/assets", params={"source": "pipeline"}).json()
    names = [a["name"] for a in assets]
    assert "Auto Created" in names

    # Find it and check it has a slug
    created = next(a for a in assets if a["name"] == "Auto Created")
    assert created["slug"] is not None
    assert created["kind"] == "table"
