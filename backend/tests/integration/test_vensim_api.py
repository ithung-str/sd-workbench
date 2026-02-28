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
