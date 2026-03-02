"""Tests for CSV and Excel spreadsheet import."""

from __future__ import annotations

import io
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app


SAMPLE_CSV = """type,name,equation,initial_value,units,description
stock,Population,0,1000,people,Total population
stock,Resources,,500,units,Available resources
flow,Birth Rate,population * 0.03,,people/year,Annual births
flow,Death Rate,population * 0.01,,people/year,Annual deaths
aux,Growth Rate,birth_rate - death_rate,,people/year,Net growth
"""

SAMPLE_CSV_ALIASES = """kind,variable,formula,init,unit,note
stock,Water Level,,100,liters,Tank level
flow,Inflow,5,,liters/sec,Constant inflow
flow,Outflow,water_level * 0.1,,liters/sec,Proportional drain
"""


# ---------------------------------------------------------------------------
# Basic CSV import
# ---------------------------------------------------------------------------


def test_csv_import_returns_model_with_nodes() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/spreadsheet",
        files={"file": ("model.csv", SAMPLE_CSV.encode("utf-8"), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["node_count"] == 5

    model = body["model"]
    assert model["name"] == "model.csv"
    assert model["version"] == 1

    nodes = model["nodes"]
    types = {n["name"]: n["type"] for n in nodes}
    assert types["population"] == "stock"
    assert types["resources"] == "stock"
    assert types["birth_rate"] == "flow"
    assert types["death_rate"] == "flow"
    assert types["growth_rate"] == "aux"


def test_csv_stock_has_initial_value() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/spreadsheet",
        files={"file": ("m.csv", SAMPLE_CSV.encode("utf-8"), "text/csv")},
    )
    nodes = resp.json()["model"]["nodes"]
    pop = next(n for n in nodes if n["name"] == "population")
    assert pop["initial_value"] == "1000"


def test_csv_flow_has_equation() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/spreadsheet",
        files={"file": ("m.csv", SAMPLE_CSV.encode("utf-8"), "text/csv")},
    )
    nodes = resp.json()["model"]["nodes"]
    birth = next(n for n in nodes if n["name"] == "birth_rate")
    assert birth["equation"] == "population * 0.03"


def test_csv_nodes_have_positions() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/spreadsheet",
        files={"file": ("m.csv", SAMPLE_CSV.encode("utf-8"), "text/csv")},
    )
    nodes = resp.json()["model"]["nodes"]
    for node in nodes:
        assert "position" in node
        assert "x" in node["position"]
        assert "y" in node["position"]


def test_csv_preserves_units_and_labels() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/spreadsheet",
        files={"file": ("m.csv", SAMPLE_CSV.encode("utf-8"), "text/csv")},
    )
    nodes = resp.json()["model"]["nodes"]
    pop = next(n for n in nodes if n["name"] == "population")
    assert pop["label"] == "Population"
    assert pop["units"] == "people"


def test_csv_outputs_contain_stocks_and_flows() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/spreadsheet",
        files={"file": ("m.csv", SAMPLE_CSV.encode("utf-8"), "text/csv")},
    )
    outputs = resp.json()["model"]["outputs"]
    assert "population" in outputs
    assert "birth_rate" in outputs


# ---------------------------------------------------------------------------
# Column alias support
# ---------------------------------------------------------------------------


def test_csv_accepts_column_aliases() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/spreadsheet",
        files={"file": ("alias.csv", SAMPLE_CSV_ALIASES.encode("utf-8"), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["node_count"] == 3

    nodes = body["model"]["nodes"]
    names = {n["name"] for n in nodes}
    assert "water_level" in names
    assert "inflow" in names
    assert "outflow" in names


# ---------------------------------------------------------------------------
# Error handling
# ---------------------------------------------------------------------------


def test_spreadsheet_rejects_missing_file() -> None:
    client = TestClient(app)
    resp = client.post("/api/imports/spreadsheet")
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["errors"][0]["code"] == "SS_FILE_REQUIRED"


def test_spreadsheet_rejects_unsupported_extension() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/spreadsheet",
        files={"file": ("data.txt", b"hello", "text/plain")},
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["errors"][0]["code"] == "SS_UNSUPPORTED_FILE"


def test_csv_rejects_empty_file() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/spreadsheet",
        files={"file": ("empty.csv", b"", "text/csv")},
    )
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["errors"][0]["code"] == "SS_PARSE_ERROR"


def test_csv_rejects_missing_type_column() -> None:
    csv_data = "name,equation\nFoo,1\n"
    client = TestClient(app)
    resp = client.post(
        "/api/imports/spreadsheet",
        files={"file": ("bad.csv", csv_data.encode("utf-8"), "text/csv")},
    )
    assert resp.status_code == 422


def test_csv_warns_on_unknown_type() -> None:
    csv_data = "type,name,equation,initial_value\nstock,A,,10\nwidget,B,1,\n"
    client = TestClient(app)
    resp = client.post(
        "/api/imports/spreadsheet",
        files={"file": ("warn.csv", csv_data.encode("utf-8"), "text/csv")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["node_count"] == 1  # Only the stock
    assert any("unknown type" in w["message"] for w in body["warnings"])


def test_csv_skips_comment_rows() -> None:
    csv_data = "type,name,equation,initial_value\n#comment,ignore,,\nstock,Level,,50\n"
    client = TestClient(app)
    resp = client.post(
        "/api/imports/spreadsheet",
        files={"file": ("skip.csv", csv_data.encode("utf-8"), "text/csv")},
    )
    assert resp.status_code == 200
    assert resp.json()["node_count"] == 1


# ---------------------------------------------------------------------------
# Excel import
# ---------------------------------------------------------------------------


def test_xlsx_import_basic() -> None:
    """Create a minimal xlsx in memory and import it."""
    try:
        from openpyxl import Workbook
    except ImportError:
        return  # Skip if openpyxl not available

    wb = Workbook()
    ws = wb.active
    ws.append(["type", "name", "equation", "initial_value", "units"])
    ws.append(["stock", "Tank", "", "100", "liters"])
    ws.append(["flow", "Drain", "tank * 0.05", "", "liters/sec"])

    buf = io.BytesIO()
    wb.save(buf)
    buf.seek(0)

    client = TestClient(app)
    resp = client.post(
        "/api/imports/spreadsheet",
        files={"file": ("test.xlsx", buf.read(), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["node_count"] == 2

    nodes = body["model"]["nodes"]
    names = {n["name"] for n in nodes}
    assert "tank" in names
    assert "drain" in names

    tank = next(n for n in nodes if n["name"] == "tank")
    assert tank["type"] == "stock"
    assert tank["initial_value"] == "100"


# ---------------------------------------------------------------------------
# Duplicate name handling
# ---------------------------------------------------------------------------


def test_csv_deduplicates_names() -> None:
    csv_data = "type,name,equation,initial_value\nstock,Level,,10\nstock,Level,,20\n"
    client = TestClient(app)
    resp = client.post(
        "/api/imports/spreadsheet",
        files={"file": ("dup.csv", csv_data.encode("utf-8"), "text/csv")},
    )
    assert resp.status_code == 200
    nodes = resp.json()["model"]["nodes"]
    names = [n["name"] for n in nodes]
    assert len(names) == 2
    assert len(set(names)) == 2  # No duplicates
