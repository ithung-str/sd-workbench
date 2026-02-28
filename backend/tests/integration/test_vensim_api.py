from __future__ import annotations

from io import BytesIO
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.main import app


class _FakeSeries(list):
    def tolist(self):
        return list(self)


class _FakeIndex(_FakeSeries):
    pass


class _FakeDataFrame:
    def __init__(self):
        self.index = _FakeIndex([0.0, 1.0, 2.0])
        self.columns = ["x", "y"]
        self._data = {
            "x": _FakeSeries([1.0, 2.0, 3.0]),
            "y": _FakeSeries([10.0, 20.0, 30.0]),
        }

    def __getitem__(self, key):
        return self._data[key]

    def to_dict(self, orient="records"):
        if orient != "records":
            raise ValueError
        return [
            {"Real Name": "x", "Py Name": "x", "Type": "Aux", "Units": "", "Comment": ""},
            {"Real Name": "y", "Py Name": "y", "Type": "Aux", "Units": "", "Comment": ""},
        ]


class _FakeModelHandle:
    def __init__(self):
        self.last_run_kwargs = None
        self.components = SimpleNamespace(
            initial_time=lambda: 0,
            final_time=lambda: 2,
            time_step=lambda: 1,
            saveper=lambda: 1,
        )

    def doc(self):
        return _FakeDataFrame()

    def run(self, **kwargs):
        self.last_run_kwargs = kwargs
        return _FakeDataFrame()


class _FakeStockFlowDataFrame:
    def __init__(self):
        self.index = _FakeIndex([0.0, 1.0, 2.0])
        self.columns = ["inventory", "inflow", "outflow"]
        self._data = {
            "inventory": _FakeSeries([100.0, 105.0, 110.0]),
            "inflow": _FakeSeries([10.0, 10.0, 10.0]),
            "outflow": _FakeSeries([5.0, 5.0, 5.0]),
        }

    def __getitem__(self, key):
        return self._data[key]

    def to_dict(self, orient="records"):
        if orient != "records":
            raise ValueError
        return [
            {
                "Real Name": "Inventory",
                "Py Name": "inventory",
                "Type": "Stock",
                "Equation": "INTEG( Inflow - Outflow, 100 )",
                "Units": "",
                "Comment": "",
            },
            {
                "Real Name": "Inflow",
                "Py Name": "inflow",
                "Type": "Aux",
                "Equation": "10",
                "Units": "",
                "Comment": "",
            },
            {
                "Real Name": "Outflow",
                "Py Name": "outflow",
                "Type": "Aux",
                "Equation": "5",
                "Units": "",
                "Comment": "",
            },
        ]


class _FakeStockFlowModelHandle(_FakeModelHandle):
    def doc(self):
        return _FakeStockFlowDataFrame()


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture(autouse=True)
def patch_pysd(monkeypatch):
    from app.vensim import importer

    handles = []

    def _loader(mdl_path):
        handle = _FakeModelHandle()
        handles.append(handle)
        return handle

    monkeypatch.setattr(importer, "_load_with_pysd", _loader)
    monkeypatch.setattr(importer, "_test_handles", handles, raising=False)
    yield



def test_vensim_import_rejects_non_mdl(client: TestClient):
    resp = client.post(
        "/api/vensim/import",
        files={"file": ("bad.txt", b"not mdl", "text/plain")},
    )
    assert resp.status_code == 400
    detail = resp.json()["detail"]
    assert detail["errors"][0]["code"] == "VENSIM_UNSUPPORTED_FILE"



def test_vensim_import_returns_session_and_capabilities(client: TestClient):
    mdl = b"INITIAL TIME = 0\nFINAL TIME = 10\nTIME STEP = 1\nx = STEP(1,2)\n"
    resp = client.post(
        "/api/vensim/import",
        files={"file": ("demo.mdl", mdl, "text/plain")},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["ok"] is True
    assert body["source"]["format"] == "vensim-mdl"
    assert body["import_id"]
    assert "STEP" in body["capabilities"]["supported"]
    assert "STEP" in body["capabilities"]["detected_functions"]
    assert len(body["model_view"]["variables"]) >= 1


def test_vensim_import_infers_stock_flow_links_from_integ_formula(client: TestClient, monkeypatch):
    from app.vensim import importer

    def _loader(_mdl_path):
        return _FakeStockFlowModelHandle()

    monkeypatch.setattr(importer, "_load_with_pysd", _loader)

    mdl = b"Inventory = INTEG( Inflow - Outflow, 100 )\nInflow = 10\nOutflow = 5\n"
    resp = client.post("/api/vensim/import", files={"file": ("stock_flow.mdl", mdl, "text/plain")})
    assert resp.status_code == 200
    body = resp.json()
    canonical = body["model_view"]["canonical"]
    assert canonical is not None
    nodes = canonical["nodes"]
    edges = canonical["edges"]

    stock = next(node for node in nodes if node["name"] == "Inventory")
    inflow = next(node for node in nodes if node["name"] == "Inflow")
    outflow = next(node for node in nodes if node["name"] == "Outflow")
    assert stock["type"] == "stock"
    assert inflow["type"] == "flow"
    assert outflow["type"] == "flow"
    assert inflow["target_stock_id"] == stock["id"]
    assert outflow["source_stock_id"] == stock["id"]
    assert any(edge["type"] == "flow_link" and edge["source"] == inflow["id"] and edge["target"] == stock["id"] for edge in edges)
    assert any(edge["type"] == "flow_link" and edge["source"] == stock["id"] and edge["target"] == outflow["id"] for edge in edges)



def test_vensim_simulate_with_import_id(client: TestClient):
    mdl = b"INITIAL TIME = 0\nFINAL TIME = 2\nTIME STEP = 1\nx = 1\n"
    import_resp = client.post(
        "/api/vensim/import",
        files={"file": ("demo.mdl", mdl, "text/plain")},
    )
    import_id = import_resp.json()["import_id"]

    sim_resp = client.post(
        "/api/vensim/simulate",
        json={"import_id": import_id, "outputs": ["x"]},
    )
    assert sim_resp.status_code == 200
    body = sim_resp.json()
    assert body["ok"] is True
    assert body["metadata"]["engine"] == "pysd"
    assert body["metadata"]["source_format"] == "vensim-mdl"
    assert body["series"]["time"] == [0.0, 1.0, 2.0]
    assert "x" in body["series"]



def test_vensim_simulate_missing_session(client: TestClient):
    resp = client.post("/api/vensim/simulate", json={"import_id": "missing"})
    assert resp.status_code == 404
    assert resp.json()["detail"]["errors"][0]["code"] == "VENSIM_IMPORT_EXPIRED"


def test_vensim_simulate_uses_saveper_for_output_grid(client: TestClient):
    from app.vensim import importer

    mdl = b"INITIAL TIME = 0\nFINAL TIME = 2\nTIME STEP = 1\nSAVEPER = 1\nx = 1\n"
    import_resp = client.post(
        "/api/vensim/import",
        files={"file": ("demo.mdl", mdl, "text/plain")},
    )
    import_id = import_resp.json()["import_id"]

    sim_resp = client.post(
        "/api/vensim/simulate",
        json={"import_id": import_id, "sim_config": {"start": 0, "stop": 2, "dt": 1, "saveper": 0.5}, "outputs": ["x"]},
    )
    assert sim_resp.status_code == 200
    body = sim_resp.json()
    # Fake dataframe index is fixed, but metadata time should reflect requested output grid.
    assert body["metadata"]["time"]["saveper"] == 0.5
    handle = importer._test_handles[-1]
    assert handle.last_run_kwargs["return_timestamps"] == [0.0, 0.5, 1.0, 1.5, 2.0]


def test_vensim_batch_simulate_runs_baseline_and_policy(client: TestClient):
    mdl = b"INITIAL TIME = 0\nFINAL TIME = 2\nTIME STEP = 1\nx = 1\n"
    import_resp = client.post("/api/vensim/import", files={"file": ("demo.mdl", mdl, "text/plain")})
    import_id = import_resp.json()["import_id"]

    batch_resp = client.post(
        "/api/vensim/scenarios/simulate-batch",
        json={
            "import_id": import_id,
            "scenarios": [
                {
                    "id": "s1",
                    "name": "Policy",
                    "status": "policy",
                    "overrides": {"params": {"x": 2}},
                }
            ],
            "outputs": ["x"],
            "include_baseline": True,
        },
    )
    assert batch_resp.status_code == 200
    body = batch_resp.json()
    assert body["ok"] is True
    assert len(body["runs"]) == 2
    assert {run["scenario_id"] for run in body["runs"]} == {"baseline", "s1"}


def test_vensim_oat_sensitivity_endpoint(client: TestClient):
    mdl = b"INITIAL TIME = 0\nFINAL TIME = 2\nTIME STEP = 1\nx = 1\n"
    import_resp = client.post("/api/vensim/import", files={"file": ("demo.mdl", mdl, "text/plain")})
    import_id = import_resp.json()["import_id"]

    oat_resp = client.post(
        "/api/vensim/sensitivity/oat",
        json={
            "import_id": import_id,
            "output": "x",
            "metric": "final",
            "parameters": [{"name": "x", "low": 1, "high": 3, "steps": 3}],
        },
    )
    assert oat_resp.status_code == 200
    body = oat_resp.json()
    assert body["ok"] is True
    assert len(body["items"]) == 1
    assert len(body["items"][0]["points"]) == 3


def test_vensim_monte_carlo_is_seeded(client: TestClient):
    mdl = b"INITIAL TIME = 0\nFINAL TIME = 2\nTIME STEP = 1\nx = 1\n"
    import_resp = client.post("/api/vensim/import", files={"file": ("demo.mdl", mdl, "text/plain")})
    import_id = import_resp.json()["import_id"]
    payload = {
        "import_id": import_id,
        "output": "x",
        "metric": "final",
        "runs": 10,
        "seed": 7,
        "parameters": [{"name": "x", "distribution": "uniform", "min": 1, "max": 4}],
    }
    mc1 = client.post("/api/vensim/sensitivity/monte-carlo", json=payload)
    mc2 = client.post("/api/vensim/sensitivity/monte-carlo", json=payload)
    assert mc1.status_code == 200
    assert mc2.status_code == 200
    assert mc1.json()["quantiles"] == mc2.json()["quantiles"]


def test_vensim_diagnostics_and_parity_readiness_endpoints(client: TestClient):
    mdl = b"INITIAL TIME = 0\nFINAL TIME = 2\nTIME STEP = 1\nx = RANDOM NORMAL(0,1)\n"
    import_resp = client.post("/api/vensim/import", files={"file": ("demo.mdl", mdl, "text/plain")})
    import_id = import_resp.json()["import_id"]

    diag = client.get(f"/api/vensim/import/{import_id}/diagnostics")
    assert diag.status_code == 200
    body = diag.json()
    assert body["ok"] is True
    assert any(detail["function"] == "RANDOM NORMAL" for detail in body["capabilities"]["details"])

    readiness = client.get(f"/api/vensim/import/{import_id}/parity-readiness")
    assert readiness.status_code == 200
    rbody = readiness.json()
    assert rbody["ok"] is True
    assert rbody["readiness"] in {"yellow", "red", "green"}


def test_vensim_execution_mode_mixed_when_fallback_family_detected(client: TestClient):
    mdl = b"INITIAL TIME = 0\nFINAL TIME = 2\nTIME STEP = 1\nx = RANDOM NORMAL(0,1)\n"
    import_resp = client.post("/api/vensim/import", files={"file": ("demo.mdl", mdl, "text/plain")})
    import_id = import_resp.json()["import_id"]

    sim_resp = client.post("/api/vensim/simulate", json={"import_id": import_id, "outputs": ["x"]})
    assert sim_resp.status_code == 200
    body = sim_resp.json()
    assert body["metadata"]["execution_mode"] == "mixed"
    assert "RANDOM NORMAL" in body["metadata"]["fallback_activations"]


def test_vensim_execution_blocks_unsupported_without_fallback(client: TestClient):
    mdl = b"INITIAL TIME = 0\nFINAL TIME = 2\nTIME STEP = 1\nx = ALLOCATE AVAILABLE(1,2)\n"
    import_resp = client.post("/api/vensim/import", files={"file": ("demo.mdl", mdl, "text/plain")})
    import_id = import_resp.json()["import_id"]

    sim_resp = client.post("/api/vensim/simulate", json={"import_id": import_id, "outputs": ["x"]})
    assert sim_resp.status_code == 422
    detail = sim_resp.json()["detail"]
    assert detail["errors"][0]["code"] == "VENSIM_UNSUPPORTED_FEATURE"
