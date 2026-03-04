from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_execute_simple_pipeline():
    resp = client.post("/api/analysis/execute", json={
        "pipeline_id": "test_pipe",
        "nodes": [
            {
                "id": "n1",
                "type": "data_source",
                "data_table": {
                    "columns": [{"key": "x", "label": "X", "type": "number"}],
                    "rows": [[1], [2], [3]],
                },
            },
            {"id": "n2", "type": "code", "code": "df['y'] = df['x'] * 10"},
            {"id": "n3", "type": "output"},
        ],
        "edges": [
            {"source": "n1", "target": "n2"},
            {"source": "n2", "target": "n3"},
        ],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["results"]["n1"]["ok"]
    assert data["results"]["n2"]["ok"]
    assert data["results"]["n3"]["ok"]


def test_execute_error_propagation():
    resp = client.post("/api/analysis/execute", json={
        "pipeline_id": "test_err",
        "nodes": [
            {
                "id": "n1",
                "type": "data_source",
                "data_table": {
                    "columns": [{"key": "x", "label": "X", "type": "number"}],
                    "rows": [[1]],
                },
            },
            {"id": "n2", "type": "code", "code": "raise ValueError('boom')"},
            {"id": "n3", "type": "output"},
        ],
        "edges": [
            {"source": "n1", "target": "n2"},
            {"source": "n2", "target": "n3"},
        ],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["results"]["n1"]["ok"]
    assert not data["results"]["n2"]["ok"]
    assert not data["results"]["n3"]["ok"]
    assert "upstream" in data["results"]["n3"]["error"].lower()
