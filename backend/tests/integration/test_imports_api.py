from __future__ import annotations

from pathlib import Path
import xml.etree.ElementTree as ET

from fastapi.testclient import TestClient

from app.main import app


SAMPLE_IM = """<InsightMakerModel>
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <Setting id="2" TimeStart="0" TimeLength="10" TimeStep="1" TimeUnits="Days">
      <mxCell parent="1" vertex="1" visible="0"><mxGeometry x="0" y="0" width="80" height="40" as="geometry" /></mxCell>
    </Setting>
    <Stock id="4" name="Population" InitialValue="100" Units="people">
      <mxCell style="stock;fillColor=#FFFFFF" parent="1" vertex="1"><mxGeometry x="100" y="100" width="120" height="50" as="geometry" /></mxCell>
    </Stock>
    <Variable id="5" name="Growth" Equation="5" Units="people/day">
      <mxCell style="variable;fillColor=#C0C0C0" parent="1" vertex="1"><mxGeometry x="320" y="100" width="120" height="50" as="geometry" /></mxCell>
    </Variable>
    <Flow id="6" name="Inflow" FlowRate="[Growth]" Units="people/day">
      <mxCell source="4" target="4" parent="1"><mxGeometry x="220" y="120" width="80" height="36" as="geometry" /></mxCell>
    </Flow>
    <Text id="7" Text="Model note"><mxCell parent="1" vertex="1"><mxGeometry x="50" y="20" width="180" height="40" as="geometry" /></mxCell></Text>
    <Link id="8" name="influence_link" BiDirectional="false">
      <mxCell source="5" target="6" parent="1" edge="1"><mxGeometry x="0" y="0" width="100" height="100" as="geometry" /></mxCell>
    </Link>
  </root>
</InsightMakerModel>"""


SAMPLE_IM_WITH_CONVERTER = """<InsightMakerModel>
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <Setting id="2" TimeStart="5" TimeLength="50" TimeStep="0.5" TimeUnits="Years">
      <mxCell parent="1" vertex="1" visible="0"><mxGeometry x="0" y="0" width="80" height="40" as="geometry" /></mxCell>
    </Setting>
    <Stock id="10" name="Inventory" InitialValue="200" Units="units">
      <mxCell parent="1" vertex="1"><mxGeometry x="100" y="100" width="120" height="50" as="geometry" /></mxCell>
    </Stock>
    <Variable id="11" name="Order Rate" Equation="Pulse(10, 5, 1)" Units="units/year">
      <mxCell parent="1" vertex="1"><mxGeometry x="300" y="100" width="120" height="50" as="geometry" /></mxCell>
    </Variable>
    <Converter id="12" name="Effect of Inventory" Source="[Inventory]" Data="(0,2); (100,1.5); (200,1); (300,0.5); (400,0.2)">
      <mxCell parent="1" vertex="1"><mxGeometry x="300" y="200" width="120" height="50" as="geometry" /></mxCell>
    </Converter>
    <Flow id="13" name="Shipments" FlowRate="[Order Rate]*[Effect of Inventory]" Units="units/year">
      <mxCell source="10" target="10" parent="1" edge="1"><mxGeometry x="200" y="120" width="80" height="36" as="geometry" /></mxCell>
    </Flow>
    <Link id="14" name="link1" BiDirectional="false">
      <mxCell source="11" target="13" parent="1" edge="1"><mxGeometry x="0" y="0" width="100" height="100" as="geometry" /></mxCell>
    </Link>
    <Link id="15" name="link2" BiDirectional="false">
      <mxCell source="12" target="13" parent="1" edge="1"><mxGeometry x="0" y="0" width="100" height="100" as="geometry" /></mxCell>
    </Link>
  </root>
</InsightMakerModel>"""


SAMPLE_IM_MINIMAL = """<InsightMakerModel>
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <Stock id="3" name="Level" InitialValue="50">
      <mxCell parent="1" vertex="1"><mxGeometry x="100" y="100" width="120" height="50" as="geometry" /></mxCell>
    </Stock>
  </root>
</InsightMakerModel>"""


# ---------------------------------------------------------------------------
# Basic import + response structure
# ---------------------------------------------------------------------------

def test_imports_accept_insightmaker_extension_and_exports_xml() -> None:
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("demo.InsightMaker", SAMPLE_IM.encode("utf-8"), "application/xml")})
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["source"]["format"] == "insightmaker-xml"
    assert body["import_id"]

    import_id = body["import_id"]
    diagnostics = client.get(f"/api/imports/{import_id}/diagnostics")
    assert diagnostics.status_code == 200

    readiness = client.get(f"/api/imports/{import_id}/readiness")
    assert readiness.status_code == 200

    exported = client.get(f"/api/imports/{import_id}/insightmaker-xml")
    assert exported.status_code == 200
    assert "<InsightMakerModel>" in exported.json()["xml"]


def test_imports_rejects_non_xml_non_insightmaker_extension() -> None:
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("demo.txt", b"hi", "text/plain")})
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["errors"][0]["code"] == "IM_UNSUPPORTED_FILE"


# ---------------------------------------------------------------------------
# Response schema completeness
# ---------------------------------------------------------------------------

def test_response_contains_all_required_fields() -> None:
    """Every top-level key the frontend relies on must be present."""
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("test.InsightMaker", SAMPLE_IM.encode("utf-8"), "application/xml")})
    body = resp.json()
    assert resp.status_code == 200

    # Top-level
    for key in ("ok", "import_id", "source", "capabilities", "warnings", "errors", "model_view"):
        assert key in body, f"Missing top-level key: {key}"

    # Source
    assert body["source"]["filename"] == "test.InsightMaker"
    assert body["source"]["format"] == "insightmaker-xml"

    # Capabilities
    caps = body["capabilities"]
    for key in ("tier", "supported", "partial", "unsupported", "detected_functions", "details", "families"):
        assert key in caps, f"Missing capabilities key: {key}"
    assert caps["tier"] in ("T0", "T1", "T2", "T3", "T4")

    # Model view
    mv = body["model_view"]
    for key in ("canonical", "variables", "time_settings", "dependency_graph", "import_gaps", "visual_summary"):
        assert key in mv, f"Missing model_view key: {key}"


# ---------------------------------------------------------------------------
# Parsed nodes and edges
# ---------------------------------------------------------------------------

def test_nodes_parsed_correctly_from_sample() -> None:
    """Stocks, flows, aux, text, and links are extracted into the right node types."""
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("model.InsightMaker", SAMPLE_IM.encode("utf-8"), "application/xml")})
    body = resp.json()
    nodes = body["model_view"]["canonical"]["nodes"]
    edges = body["model_view"]["canonical"]["edges"]

    node_types = {n["id"]: n["type"] for n in nodes}
    node_names = {n["id"]: n.get("name", "") for n in nodes}

    # Stock
    stock_nodes = [n for n in nodes if n["type"] == "stock"]
    assert len(stock_nodes) == 1
    pop = stock_nodes[0]
    assert pop["name"] == "population"
    assert pop["label"] == "Population"
    assert pop["initial_value"] == "100"
    assert pop["units"] == "people"

    # Aux / Variable
    aux_nodes = [n for n in nodes if n["type"] == "aux"]
    assert len(aux_nodes) == 1
    assert aux_nodes[0]["name"] == "growth"
    assert aux_nodes[0]["equation"] == "5"

    # Flow
    flow_nodes = [n for n in nodes if n["type"] == "flow"]
    assert len(flow_nodes) == 1
    assert flow_nodes[0]["name"] == "inflow"
    assert flow_nodes[0]["equation"] == "growth"

    # Text
    text_nodes = [n for n in nodes if n["type"] == "text"]
    assert len(text_nodes) == 1
    assert "Model note" in text_nodes[0]["text"]

    # Influence edges
    influence_edges = [e for e in edges if e["type"] == "influence"]
    assert len(influence_edges) == 1
    assert influence_edges[0]["source"] == "im_5"  # Growth
    assert influence_edges[0]["target"] == "im_6"  # Inflow


def test_converter_parsed_as_lookup_with_points() -> None:
    """Converter elements become lookup nodes with (x,y) data points."""
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("cvt.InsightMaker", SAMPLE_IM_WITH_CONVERTER.encode("utf-8"), "application/xml")})
    body = resp.json()
    nodes = body["model_view"]["canonical"]["nodes"]
    lookups = [n for n in nodes if n["type"] == "lookup"]
    assert len(lookups) == 1
    lookup = lookups[0]
    assert lookup["name"] == "effect_of_inventory"
    assert lookup["equation"] == "inventory"
    assert len(lookup["points"]) == 5
    assert lookup["points"][0] == {"x": 0, "y": 2}
    assert lookup["points"][-1] == {"x": 400, "y": 0.2}


# ---------------------------------------------------------------------------
# Time settings
# ---------------------------------------------------------------------------

def test_time_settings_extracted() -> None:
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("ts.InsightMaker", SAMPLE_IM.encode("utf-8"), "application/xml")})
    ts = resp.json()["model_view"]["time_settings"]
    assert ts["initial_time"] == 0.0
    assert ts["final_time"] == 10.0  # TimeStart + TimeLength
    assert ts["time_step"] == 1.0
    assert ts["saveper"] == 1.0


def test_time_settings_with_different_values() -> None:
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("ts2.InsightMaker", SAMPLE_IM_WITH_CONVERTER.encode("utf-8"), "application/xml")})
    ts = resp.json()["model_view"]["time_settings"]
    assert ts["initial_time"] == 5.0
    assert ts["final_time"] == 55.0  # 5 + 50
    assert ts["time_step"] == 0.5
    assert ts["saveper"] == 0.5


def test_time_settings_defaults_when_missing() -> None:
    """When no <Setting> element, time defaults are applied."""
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("min.InsightMaker", SAMPLE_IM_MINIMAL.encode("utf-8"), "application/xml")})
    ts = resp.json()["model_view"]["time_settings"]
    assert ts["initial_time"] == 0
    assert ts["final_time"] == 100
    assert ts["time_step"] == 1
    assert ts["saveper"] == 1


# ---------------------------------------------------------------------------
# Import gaps and warnings
# ---------------------------------------------------------------------------

def test_clean_model_has_no_variable_or_edge_warnings() -> None:
    """A simple model should have no dropped variables or edges."""
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("clean.InsightMaker", SAMPLE_IM_MINIMAL.encode("utf-8"), "application/xml")})
    body = resp.json()
    gaps = body["model_view"]["import_gaps"]
    assert gaps["dropped_variables"] == 0
    assert gaps["dropped_edges"] == 0
    assert gaps["unparsed_equations"] == 0
    # mxCell root items are tracked as unsupported but that's expected
    warning_messages = [w["message"] for w in body["warnings"]]
    assert not any("variable" in m for m in warning_messages)
    assert not any("edge" in m for m in warning_messages)


def test_dropped_edge_generates_warning() -> None:
    """A Link whose source/target cannot be mapped generates a warning."""
    xml = """<InsightMakerModel>
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <Stock id="3" name="A" InitialValue="0">
      <mxCell parent="1" vertex="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry" /></mxCell>
    </Stock>
    <Link id="4" name="broken">
      <mxCell source="3" target="999" parent="1" edge="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry" /></mxCell>
    </Link>
  </root>
</InsightMakerModel>"""
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("gaps.InsightMaker", xml.encode(), "application/xml")})
    body = resp.json()
    assert body["ok"] is True
    gaps = body["model_view"]["import_gaps"]
    assert gaps["dropped_edges"] == 1
    assert any("edge(s) were dropped" in w["message"] for w in body["warnings"])


def test_unsupported_tag_tracked_in_gaps() -> None:
    """Unknown XML tags are tracked as unsupported constructs."""
    xml = """<InsightMakerModel>
  <root>
    <mxCell id="0" />
    <mxCell id="1" parent="0" />
    <Stock id="3" name="X" InitialValue="0">
      <mxCell parent="1" vertex="1"><mxGeometry x="0" y="0" width="80" height="40" as="geometry" /></mxCell>
    </Stock>
    <CustomWidget id="99" name="widget" />
  </root>
</InsightMakerModel>"""
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("unk.InsightMaker", xml.encode(), "application/xml")})
    body = resp.json()
    gaps = body["model_view"]["import_gaps"]
    assert "CustomWidget" in gaps["unsupported_constructs"]
    assert any("unsupported construct" in w["message"] for w in body["warnings"])


# ---------------------------------------------------------------------------
# Capability detection
# ---------------------------------------------------------------------------

def test_capability_tier_t1_for_simple_model() -> None:
    """A model with no special functions should be T1."""
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("t1.InsightMaker", SAMPLE_IM_MINIMAL.encode("utf-8"), "application/xml")})
    caps = resp.json()["capabilities"]
    assert caps["tier"] in ("T1", "T2")  # T1 if no functions at all detected


def test_capability_detects_pulse_function() -> None:
    """The Pulse() function in equations should be detected and flagged."""
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("fn.InsightMaker", SAMPLE_IM_WITH_CONVERTER.encode("utf-8"), "application/xml")})
    caps = resp.json()["capabilities"]
    detected = [f.upper() for f in caps["detected_functions"]]
    assert "PULSE" in detected
    assert caps["tier"] == "T2"  # Pulse is a native_fallback function


# ---------------------------------------------------------------------------
# Variables summary
# ---------------------------------------------------------------------------

def test_variables_summary_matches_nodes() -> None:
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("v.InsightMaker", SAMPLE_IM.encode("utf-8"), "application/xml")})
    body = resp.json()
    variables = body["model_view"]["variables"]
    var_names = [v["name"] for v in variables]
    assert "Population" in var_names
    assert "Growth" in var_names
    assert "Inflow" in var_names

    pop = next(v for v in variables if v["name"] == "Population")
    assert pop["kind"] == "stock"
    assert pop["equation"] == "0"  # Stock equation defaults

    growth = next(v for v in variables if v["name"] == "Growth")
    assert growth["kind"] == "aux"
    assert growth["equation"] == "5"


# ---------------------------------------------------------------------------
# Dependency graph
# ---------------------------------------------------------------------------

def test_dependency_graph_edges() -> None:
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("g.InsightMaker", SAMPLE_IM.encode("utf-8"), "application/xml")})
    graph = resp.json()["model_view"]["dependency_graph"]
    edges = graph["edges"]
    # Should contain influence edge (Growth -> Inflow) and flow_link edges
    assert len(edges) >= 1
    src_tgt_pairs = [(e[0], e[1]) for e in edges]
    assert ("im_5", "im_6") in src_tgt_pairs  # Growth -> Inflow


# ---------------------------------------------------------------------------
# Visual summary
# ---------------------------------------------------------------------------

def test_visual_summary_counts() -> None:
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("vs.InsightMaker", SAMPLE_IM.encode("utf-8"), "application/xml")})
    vs = resp.json()["model_view"]["visual_summary"]
    assert vs["text_nodes"] == 1
    assert vs["styled_nodes"] >= 2  # Stock and Variable have styles


# ---------------------------------------------------------------------------
# Position / layout round-trip
# ---------------------------------------------------------------------------

def test_node_positions_preserved() -> None:
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("pos.InsightMaker", SAMPLE_IM.encode("utf-8"), "application/xml")})
    nodes = resp.json()["model_view"]["canonical"]["nodes"]
    pop = next(n for n in nodes if n.get("name") == "population")
    assert pop["position"]["x"] == 100.0
    assert pop["position"]["y"] == 100.0
    growth = next(n for n in nodes if n.get("name") == "growth")
    assert growth["position"]["x"] == 320.0
    assert growth["position"]["y"] == 100.0


# ---------------------------------------------------------------------------
# Error cases
# ---------------------------------------------------------------------------

def test_rejects_missing_file() -> None:
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker")
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["errors"][0]["code"] == "IM_FILE_REQUIRED"


def test_rejects_malformed_xml() -> None:
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("bad.xml", b"<not>valid<xml", "application/xml")})
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["errors"][0]["code"] == "IM_PARSE_ERROR"


def test_rejects_wrong_root_element() -> None:
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("wrong.xml", b"<SomeOtherRoot><child/></SomeOtherRoot>", "application/xml")})
    assert resp.status_code == 422
    detail = resp.json()["detail"]
    assert detail["errors"][0]["code"] == "IM_PARSE_ERROR"


def test_diagnostics_404_for_unknown_id() -> None:
    client = TestClient(app)
    resp = client.get("/api/imports/im_nonexistent/diagnostics")
    assert resp.status_code == 404


def test_readiness_404_for_unknown_id() -> None:
    client = TestClient(app)
    resp = client.get("/api/imports/im_nonexistent/readiness")
    assert resp.status_code == 404


def test_export_404_for_unknown_id() -> None:
    client = TestClient(app)
    resp = client.get("/api/imports/im_nonexistent/insightmaker-xml")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Diagnostics and readiness endpoints
# ---------------------------------------------------------------------------

def test_diagnostics_returns_capabilities_and_gaps() -> None:
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("d.InsightMaker", SAMPLE_IM.encode("utf-8"), "application/xml")})
    import_id = resp.json()["import_id"]

    diag = client.get(f"/api/imports/{import_id}/diagnostics").json()
    assert diag["ok"] is True
    assert diag["import_id"] == import_id
    assert "capabilities" in diag
    assert "import_gaps" in diag
    assert "warnings" in diag


def test_readiness_returns_status() -> None:
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("r.InsightMaker", SAMPLE_IM_MINIMAL.encode("utf-8"), "application/xml")})
    import_id = resp.json()["import_id"]

    ready = client.get(f"/api/imports/{import_id}/readiness").json()
    assert ready["ok"] is True
    assert ready["readiness"] in ("green", "yellow", "red")


# ---------------------------------------------------------------------------
# Round-trip export
# ---------------------------------------------------------------------------

def test_export_roundtrip_preserves_structure() -> None:
    """Import -> export should produce valid InsightMaker XML with same elements."""
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("rt.InsightMaker", SAMPLE_IM.encode("utf-8"), "application/xml")})
    import_id = resp.json()["import_id"]

    exported = client.get(f"/api/imports/{import_id}/insightmaker-xml").json()
    xml_str = exported["xml"]
    root = ET.fromstring(xml_str)
    assert root.tag == "InsightMakerModel"
    root_node = root.find("root")
    assert root_node is not None

    tags = [child.tag for child in root_node]
    assert "Stock" in tags
    assert "Variable" in tags
    assert "Flow" in tags
    assert "Text" in tags
    assert "Link" in tags


# ---------------------------------------------------------------------------
# Simulation of imported model
# ---------------------------------------------------------------------------

def test_simulate_imported_model() -> None:
    """After importing, the model should be simulatable via the imported endpoint."""
    client = TestClient(app)
    resp = client.post("/api/imports/insightmaker", files={"file": ("sim.InsightMaker", SAMPLE_IM_MINIMAL.encode("utf-8"), "application/xml")})
    body = resp.json()
    import_id = body["import_id"]

    sim_resp = client.post("/api/imports/simulate", json={
        "import_id": import_id,
        "sim_config": {"start": 0, "stop": 10, "dt": 1},
        "outputs": [],
        "params": {},
    })
    assert sim_resp.status_code == 200
    sim_body = sim_resp.json()
    assert sim_body["ok"] is True
    assert "series" in sim_body
    assert "Time" in sim_body["series"] or "time" in sim_body["series"]


# ---------------------------------------------------------------------------
# Frontend model files integration
# ---------------------------------------------------------------------------

def test_imports_frontend_model_files_export_and_warning_feedback() -> None:
    client = TestClient(app)
    models_dir = Path(__file__).resolve().parents[3] / "frontend" / "models"
    files = sorted(models_dir.rglob("*.InsightMaker"))
    assert files, "Expected at least one .InsightMaker file in frontend/models"

    for model_path in files:
        payload = model_path.read_bytes()
        response = client.post(
            "/api/imports/insightmaker",
            files={"file": (model_path.name, payload, "application/xml")},
        )
        assert response.status_code == 200, model_path.name
        body = response.json()
        assert body["ok"] is True
        assert body["import_id"]
        assert body["source"]["filename"] == model_path.name
        assert body["source"]["format"] == "insightmaker-xml"

        # Verify canonical model has nodes
        canonical = body["model_view"]["canonical"]
        assert len(canonical["nodes"]) > 0, f"{model_path.name}: no nodes parsed"
        assert canonical["id"], f"{model_path.name}: no model id"
        assert canonical["name"] == model_path.name

        gaps = body["model_view"]["import_gaps"]
        expected_warnings: list[str] = []
        if gaps.get("dropped_variables", 0) > 0:
            expected_warnings.append(f"{gaps['dropped_variables']} variable(s) were dropped during import")
        if gaps.get("dropped_edges", 0) > 0:
            expected_warnings.append(f"{gaps['dropped_edges']} edge(s) were dropped during import")
        if gaps.get("unparsed_equations", 0) > 0:
            expected_warnings.append(f"{gaps['unparsed_equations']} equation(s) could not be parsed exactly")
        unsupported_constructs = gaps.get("unsupported_constructs", [])
        if unsupported_constructs:
            expected_warnings.append(f"{len(unsupported_constructs)} unsupported construct(s) were preserved as raw fragments")
        warnings = body["warnings"]
        assert [warning["message"] for warning in warnings] == expected_warnings
        assert all(warning["code"] == "IM_IMPORT_WARNING" for warning in warnings)
        assert all(warning["severity"] == "warning" for warning in warnings)

        import_id = body["import_id"]
        exported = client.get(f"/api/imports/{import_id}/insightmaker-xml")
        assert exported.status_code == 200, model_path.name
        exported_xml = exported.json()["xml"]
        root = ET.fromstring(exported_xml)
        assert root.tag == "InsightMakerModel"
        assert root.find("root") is not None


def test_frontend_models_import_and_session_is_usable() -> None:
    """Every InsightMaker file from frontend/models should import and have usable sessions."""
    client = TestClient(app)
    models_dir = Path(__file__).resolve().parents[3] / "frontend" / "models"
    files = sorted(models_dir.rglob("*.InsightMaker"))
    assert files, "Expected at least one .InsightMaker file in frontend/models"

    for model_path in files:
        payload = model_path.read_bytes()
        resp = client.post("/api/imports/insightmaker", files={"file": (model_path.name, payload, "application/xml")})
        assert resp.status_code == 200, f"Import failed for {model_path.name}"
        body = resp.json()
        import_id = body["import_id"]

        # Verify canonical model is present and well-formed
        canonical = body["model_view"]["canonical"]
        assert canonical is not None, f"{model_path.name}: no canonical model"
        assert len(canonical["nodes"]) > 0, f"{model_path.name}: no nodes"

        # Verify session is accessible for diagnostics and readiness
        diag = client.get(f"/api/imports/{import_id}/diagnostics")
        assert diag.status_code == 200, f"{model_path.name}: diagnostics failed"

        ready = client.get(f"/api/imports/{import_id}/readiness")
        assert ready.status_code == 200, f"{model_path.name}: readiness failed"

        # Verify export round-trip
        exported = client.get(f"/api/imports/{import_id}/insightmaker-xml")
        assert exported.status_code == 200, f"{model_path.name}: export failed"
