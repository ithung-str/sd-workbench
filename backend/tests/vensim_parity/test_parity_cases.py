from __future__ import annotations

import csv
import json
import math
from pathlib import Path

import pytest

from app.vensim.capabilities import detect_capabilities

CASES_ROOT = Path(__file__).resolve().parent / "cases"


def _cases():
    return sorted([p for p in CASES_ROOT.iterdir() if p.is_dir()])


@pytest.mark.parametrize("case_dir", _cases(), ids=lambda p: p.name)
def test_parity_case_manifests_are_present(case_dir: Path):
    for name in ["model.mdl", "outputs.json", "tolerances.json", "capabilities.json"]:
        assert (case_dir / name).exists(), f"Missing {name} in {case_dir.name}"


@pytest.mark.parametrize("case_dir", _cases(), ids=lambda p: p.name)
def test_parity_case_capability_expectations(case_dir: Path):
    model_text = (case_dir / "model.mdl").read_text()
    expected = json.loads((case_dir / "capabilities.json").read_text())
    report, _warnings = detect_capabilities(model_text)

    for token in expected.get("supported_contains", []):
        assert token in report.supported, f"{case_dir.name}: expected supported {token}"
    for token in expected.get("partial_contains", []):
        assert token in report.partial, f"{case_dir.name}: expected partial {token}"
    for token in expected.get("unsupported_contains", []):
        assert token in report.unsupported, f"{case_dir.name}: expected unsupported {token}"


@pytest.mark.parametrize("case_dir", _cases(), ids=lambda p: p.name)
def test_parity_execution_against_expected(case_dir: Path):
    expected_csv = case_dir / "expected.csv"
    if not expected_csv.exists():
        pytest.skip("No expected.csv baseline for this case yet")

    pytest.importorskip("fastapi")
    pytest.importorskip("httpx")
    try:
        from fastapi.testclient import TestClient
        from app.main import app
    except Exception as exc:  # missing runtime deps / multipart / etc.
        pytest.skip(f"Backend runtime dependencies unavailable: {exc}")

    # Skip if PySD (and its deps) are not available in this environment.
    try:
        from app.vensim import importer as _importer
        _importer._ensure_pysd_importable()
        import pysd  # noqa: F401
    except Exception as exc:
        pytest.skip(f"PySD runtime unavailable: {exc}")

    outputs_cfg = json.loads((case_dir / "outputs.json").read_text())
    tolerances = json.loads((case_dir / "tolerances.json").read_text())
    with expected_csv.open() as f:
        rows = list(csv.DictReader(f))
    expected = {k: [float(r[k]) for r in rows] for k in rows[0].keys()}

    client = TestClient(app)
    import_resp = client.post(
        "/api/vensim/import",
        files={"file": ("model.mdl", (case_dir / "model.mdl").read_bytes(), "text/plain")},
    )
    assert import_resp.status_code == 200, import_resp.text
    import_id = import_resp.json()["import_id"]

    sim_resp = client.post(
        "/api/vensim/simulate",
        json={"import_id": import_id, **outputs_cfg},
    )
    assert sim_resp.status_code == 200, sim_resp.text
    actual = sim_resp.json()["series"]

    default_tol = tolerances.get("default", {"rtol": 1e-4, "atol": 1e-6})
    variables_tol = tolerances.get("variables", {})

    for col, exp_values in expected.items():
        assert col in actual, f"Missing column {col}"
        act_values = actual[col]
        assert len(act_values) == len(exp_values), f"Length mismatch for {col}"
        for i, (exp, act) in enumerate(zip(exp_values, act_values)):
            if col == "time":
                assert math.isclose(exp, act, rel_tol=0, abs_tol=1e-9), f"{case_dir.name}:{col}[{i}]"
            else:
                tol = variables_tol.get(col, default_tol)
                assert math.isclose(exp, act, rel_tol=tol["rtol"], abs_tol=tol["atol"]), (
                    f"{case_dir.name}:{col}[{i}] expected={exp} actual={act}"
                )
