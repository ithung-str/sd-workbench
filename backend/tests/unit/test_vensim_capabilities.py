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
    assert report.tier in {"T0", "T1"}
