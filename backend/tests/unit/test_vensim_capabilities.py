from __future__ import annotations

from app.vensim.capabilities import detect_capabilities


def test_detects_time_and_delay_step_features():
    text = """
    INITIAL TIME = 0
    FINAL TIME = 100
    TIME STEP = 0.25
    SAVEPER = TIME STEP
    x = STEP(1, 10)
    y = DELAY3(x, 4)
    """
    report, warnings = detect_capabilities(text)
    assert "INITIAL TIME" in report.supported
    assert "STEP" in report.supported
    assert "DELAY3" in report.supported
    assert report.tier in {"T2", "T3"}
    assert len(report.details) >= 2
    assert any(f.family == "dynamic" for f in report.families)
    assert warnings == []


def test_marks_unknown_functions_partial_warning():
    text = "x = MAGIC_ADVANCED_FN(1,2)"
    report, warnings = detect_capabilities(text)
    assert "MAGIC_ADVANCED_FN" in report.partial
    assert any(w.code == "VENSIM_UNKNOWN_FUNCTION" for w in warnings)
