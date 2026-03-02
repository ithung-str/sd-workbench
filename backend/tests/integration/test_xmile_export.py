"""Tests for XMILE export."""

from __future__ import annotations

import xml.etree.ElementTree as ET

from fastapi.testclient import TestClient

from app.main import app


SAMPLE_MODEL = {
    "id": "test_model",
    "name": "Test Model",
    "version": 1,
    "metadata": None,
    "nodes": [
        {
            "id": "s1",
            "type": "stock",
            "name": "population",
            "label": "Population",
            "equation": "0",
            "initial_value": 1000,
            "units": "people",
            "position": {"x": 100, "y": 100},
        },
        {
            "id": "f1",
            "type": "flow",
            "name": "birth_rate",
            "label": "Birth Rate",
            "equation": "population * 0.03",
            "units": "people/year",
            "position": {"x": 300, "y": 100},
            "source_stock_id": None,
            "target_stock_id": "s1",
        },
        {
            "id": "a1",
            "type": "aux",
            "name": "growth_factor",
            "label": "Growth Factor",
            "equation": "0.03",
            "units": "1/year",
            "position": {"x": 300, "y": 250},
        },
    ],
    "edges": [
        {
            "id": "e1",
            "type": "influence",
            "source": "a1",
            "target": "f1",
        },
        {
            "id": "e2",
            "type": "flow_link",
            "source": "f1",
            "target": "s1",
        },
    ],
    "outputs": ["population", "birth_rate"],
}


# ---------------------------------------------------------------------------
# Basic export
# ---------------------------------------------------------------------------


def test_xmile_export_produces_valid_xml() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/export/xmile",
        json={"model": SAMPLE_MODEL, "sim_config": None},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    xml = body["xml"]

    # Should parse as valid XML
    root = ET.fromstring(xml)
    assert root.tag == "{http://docs.oasis-open.org/xmile/ns/XMILE/v1.0}xmile"
    assert root.attrib["version"] == "1.0"


def test_xmile_export_contains_header() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/export/xmile",
        json={"model": SAMPLE_MODEL, "sim_config": None},
    )
    xml = resp.json()["xml"]
    root = ET.fromstring(xml)
    ns = {"x": "http://docs.oasis-open.org/xmile/ns/XMILE/v1.0"}

    header = root.find("x:header", ns)
    assert header is not None
    assert header.find("x:vendor", ns).text == "SD Workbench"
    assert header.find("x:name", ns).text == "Test Model"


def test_xmile_export_contains_sim_specs() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/export/xmile",
        json={
            "model": SAMPLE_MODEL,
            "sim_config": {"start": 0, "stop": 50, "dt": 0.5, "method": "euler"},
        },
    )
    xml = resp.json()["xml"]
    root = ET.fromstring(xml)
    ns = {"x": "http://docs.oasis-open.org/xmile/ns/XMILE/v1.0"}

    sim_specs = root.find("x:sim_specs", ns)
    assert sim_specs is not None
    assert float(sim_specs.find("x:start", ns).text) == 0
    assert float(sim_specs.find("x:stop", ns).text) == 50
    assert float(sim_specs.find("x:dt", ns).text) == 0.5


def test_xmile_export_defaults_sim_specs_without_config() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/export/xmile",
        json={"model": SAMPLE_MODEL, "sim_config": None},
    )
    xml = resp.json()["xml"]
    root = ET.fromstring(xml)
    ns = {"x": "http://docs.oasis-open.org/xmile/ns/XMILE/v1.0"}

    sim_specs = root.find("x:sim_specs", ns)
    assert sim_specs.find("x:start", ns).text == "0.0"
    assert sim_specs.find("x:stop", ns).text == "100.0"
    assert sim_specs.find("x:dt", ns).text == "1.0"


# ---------------------------------------------------------------------------
# Variables
# ---------------------------------------------------------------------------


def test_xmile_export_contains_stock() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/export/xmile",
        json={"model": SAMPLE_MODEL, "sim_config": None},
    )
    xml = resp.json()["xml"]
    root = ET.fromstring(xml)
    ns = {"x": "http://docs.oasis-open.org/xmile/ns/XMILE/v1.0"}

    model = root.find("x:model", ns)
    variables = model.find("x:variables", ns)
    stocks = variables.findall("x:stock", ns)
    assert len(stocks) == 1
    stock = stocks[0]
    assert stock.attrib["name"] == "Population"
    assert float(stock.find("x:eqn", ns).text) == 1000
    assert stock.find("x:units", ns).text == "people"


def test_xmile_export_contains_flow() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/export/xmile",
        json={"model": SAMPLE_MODEL, "sim_config": None},
    )
    xml = resp.json()["xml"]
    root = ET.fromstring(xml)
    ns = {"x": "http://docs.oasis-open.org/xmile/ns/XMILE/v1.0"}

    model = root.find("x:model", ns)
    variables = model.find("x:variables", ns)
    flows = variables.findall("x:flow", ns)
    assert len(flows) == 1
    flow = flows[0]
    assert flow.attrib["name"] == "Birth Rate"
    assert flow.find("x:eqn", ns).text == "population * 0.03"


def test_xmile_export_contains_aux() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/export/xmile",
        json={"model": SAMPLE_MODEL, "sim_config": None},
    )
    xml = resp.json()["xml"]
    root = ET.fromstring(xml)
    ns = {"x": "http://docs.oasis-open.org/xmile/ns/XMILE/v1.0"}

    model = root.find("x:model", ns)
    variables = model.find("x:variables", ns)
    auxes = variables.findall("x:aux", ns)
    assert len(auxes) == 1
    aux = auxes[0]
    assert aux.attrib["name"] == "Growth Factor"
    assert aux.find("x:eqn", ns).text == "0.03"


def test_xmile_export_stock_has_inflow() -> None:
    """Birth Rate flows into Population (target_stock_id=s1)."""
    client = TestClient(app)
    resp = client.post(
        "/api/imports/export/xmile",
        json={"model": SAMPLE_MODEL, "sim_config": None},
    )
    xml = resp.json()["xml"]
    root = ET.fromstring(xml)
    ns = {"x": "http://docs.oasis-open.org/xmile/ns/XMILE/v1.0"}

    model = root.find("x:model", ns)
    variables = model.find("x:variables", ns)
    stock = variables.find("x:stock", ns)
    inflows = stock.findall("x:inflow", ns)
    assert len(inflows) >= 1
    inflow_names = [inf.text for inf in inflows]
    assert "birth_rate" in inflow_names


# ---------------------------------------------------------------------------
# Display / view with canvas positions
# ---------------------------------------------------------------------------


def test_xmile_export_contains_view_with_positions() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/export/xmile",
        json={"model": SAMPLE_MODEL, "sim_config": None},
    )
    xml = resp.json()["xml"]
    root = ET.fromstring(xml)
    ns = {"x": "http://docs.oasis-open.org/xmile/ns/XMILE/v1.0"}

    model = root.find("x:model", ns)
    views = model.find("x:views", ns)
    assert views is not None

    view = views.find("x:view", ns)
    assert view is not None
    assert view.attrib.get("type") == "stock_flow"

    # Stock in view with position
    view_stocks = view.findall("x:stock", ns)
    assert len(view_stocks) == 1
    assert float(view_stocks[0].attrib["x"]) == 100
    assert float(view_stocks[0].attrib["y"]) == 100

    # Flow in view with position
    view_flows = view.findall("x:flow", ns)
    assert len(view_flows) == 1
    assert float(view_flows[0].attrib["x"]) == 300
    assert float(view_flows[0].attrib["y"]) == 100

    # Aux in view with position
    view_auxes = view.findall("x:aux", ns)
    assert len(view_auxes) == 1
    assert float(view_auxes[0].attrib["x"]) == 300
    assert float(view_auxes[0].attrib["y"]) == 250


def test_xmile_export_contains_connector_for_influence() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/export/xmile",
        json={"model": SAMPLE_MODEL, "sim_config": None},
    )
    xml = resp.json()["xml"]
    root = ET.fromstring(xml)
    ns = {"x": "http://docs.oasis-open.org/xmile/ns/XMILE/v1.0"}

    model = root.find("x:model", ns)
    views = model.find("x:views", ns)
    view = views.find("x:view", ns)

    connectors = view.findall("x:connector", ns)
    assert len(connectors) == 1
    conn = connectors[0]
    assert conn.find("x:from", ns).text == "Growth Factor"
    assert conn.find("x:to", ns).text == "Birth Rate"


# ---------------------------------------------------------------------------
# Styled model export
# ---------------------------------------------------------------------------


def test_xmile_export_preserves_style() -> None:
    styled_model = {
        **SAMPLE_MODEL,
        "nodes": [
            {
                "id": "s1",
                "type": "stock",
                "name": "population",
                "label": "Population",
                "equation": "0",
                "initial_value": 1000,
                "position": {"x": 100, "y": 100},
                "style": {"fill": "#FF0000", "text_color": "#FFFFFF", "font_size": 14},
            },
        ],
        "edges": [],
    }

    client = TestClient(app)
    resp = client.post(
        "/api/imports/export/xmile",
        json={"model": styled_model, "sim_config": None},
    )
    assert resp.status_code == 200
    xml = resp.json()["xml"]
    root = ET.fromstring(xml)
    ns = {"x": "http://docs.oasis-open.org/xmile/ns/XMILE/v1.0"}

    model = root.find("x:model", ns)
    views = model.find("x:views", ns)
    view = views.find("x:view", ns)
    view_stock = view.find("x:stock", ns)

    # Style attributes should be present
    assert view_stock.attrib.get("background") == "#FF0000"
    assert view_stock.attrib.get("font_color") == "#FFFFFF"
    assert view_stock.attrib.get("font_size") == "14"


# ---------------------------------------------------------------------------
# Lookup export
# ---------------------------------------------------------------------------


def test_xmile_export_lookup_as_gf() -> None:
    lookup_model = {
        "id": "lk_model",
        "name": "Lookup Model",
        "version": 1,
        "metadata": None,
        "nodes": [
            {
                "id": "lk1",
                "type": "lookup",
                "name": "effect",
                "label": "Effect",
                "equation": "input_var",
                "points": [{"x": 0, "y": 0}, {"x": 50, "y": 1}, {"x": 100, "y": 0.5}],
                "interpolation": "linear",
                "position": {"x": 200, "y": 200},
            },
        ],
        "edges": [],
        "outputs": [],
    }

    client = TestClient(app)
    resp = client.post(
        "/api/imports/export/xmile",
        json={"model": lookup_model, "sim_config": None},
    )
    assert resp.status_code == 200
    xml = resp.json()["xml"]
    root = ET.fromstring(xml)
    ns = {"x": "http://docs.oasis-open.org/xmile/ns/XMILE/v1.0"}

    model = root.find("x:model", ns)
    variables = model.find("x:variables", ns)
    aux = variables.find("x:aux", ns)
    assert aux.attrib["name"] == "Effect"

    gf = aux.find("x:gf", ns)
    assert gf is not None
    ypts = gf.find("x:ypts", ns)
    yvals = [float(v) for v in ypts.text.split(",")]
    assert yvals == [0, 1, 0.5]

    xscale = gf.find("x:xscale", ns)
    assert float(xscale.attrib["min"]) == 0
    assert float(xscale.attrib["max"]) == 100


# ---------------------------------------------------------------------------
# XML declaration
# ---------------------------------------------------------------------------


def test_xmile_export_has_xml_declaration() -> None:
    client = TestClient(app)
    resp = client.post(
        "/api/imports/export/xmile",
        json={"model": SAMPLE_MODEL, "sim_config": None},
    )
    xml = resp.json()["xml"]
    assert xml.startswith('<?xml version="1.0" encoding="UTF-8"?>')
