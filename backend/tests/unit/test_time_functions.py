"""Integration tests for time-input functions, if_then_else, comparisons, and delay_fixed in simulation."""
from __future__ import annotations

from app.schemas.model import ModelDocument
from app.simulation.integrator import simulate_euler
from app.simulation.translator import translate_model


def _make_model(nodes, edges=None, outputs=None):
    data = {
        "id": "m", "name": "M", "version": 1,
        "nodes": nodes,
        "edges": edges or [],
        "outputs": outputs or [],
    }
    return ModelDocument.model_validate(data)


def test_step_in_flow():
    """Stock should be flat until step_time, then ramp up."""
    model = _make_model(
        nodes=[
            {"id": "s", "type": "stock", "name": "level", "label": "Level", "equation": "0", "initial_value": "0", "position": {"x": 0, "y": 0}},
            {"id": "f", "type": "flow", "name": "inflow", "label": "Inflow", "equation": "step(10, 5)", "position": {"x": 0, "y": 0}},
        ],
        edges=[
            {"id": "e1", "type": "flow_link", "source": "f", "target": "s"},
        ],
        outputs=["level", "inflow"],
    )
    exe = translate_model(model)
    result = simulate_euler(exe, start=0, stop=10, dt=1)
    # Before t=5: inflow=0, at t=5: inflow=10
    assert result["inflow"][0] == 0.0   # t=0
    assert result["inflow"][4] == 0.0   # t=4
    assert result["inflow"][5] == 10.0  # t=5
    # level at t=5 should still be 0 (step just activated)
    assert result["level"][5] == 0.0
    # level at t=10 should be 50 (5 steps of inflow=10)
    assert result["level"][10] == 50.0


def test_if_then_else_in_simulation():
    """if_then_else switches flow based on stock value."""
    model = _make_model(
        nodes=[
            {"id": "s", "type": "stock", "name": "pop", "label": "Pop", "equation": "0", "initial_value": "10", "position": {"x": 0, "y": 0}},
            {"id": "f", "type": "flow", "name": "growth", "label": "Growth", "equation": "if_then_else(pop > 50, 0, 5)", "position": {"x": 0, "y": 0}},
        ],
        edges=[
            {"id": "e1", "type": "flow_link", "source": "f", "target": "s"},
        ],
        outputs=["pop", "growth"],
    )
    exe = translate_model(model)
    result = simulate_euler(exe, start=0, stop=20, dt=1)
    # pop grows by 5/step until >50, then growth=0
    # At t=9: pop=10+45=55 (but growth switched to 0 at the step where pop>50)
    # Growth should be 0 once pop exceeds 50
    final_pop = result["pop"][-1]
    assert final_pop >= 50
    assert final_pop <= 60  # Should cap around 55


def test_time_variable_in_equation():
    """TIME should be accessible in equations."""
    model = _make_model(
        nodes=[
            {"id": "a", "type": "aux", "name": "ramp_val", "label": "Ramp", "equation": "TIME * 2", "position": {"x": 0, "y": 0}},
        ],
        outputs=["ramp_val"],
    )
    exe = translate_model(model)
    result = simulate_euler(exe, start=0, stop=5, dt=1)
    assert result["ramp_val"] == [0.0, 2.0, 4.0, 6.0, 8.0, 10.0]


def test_pulse_train_in_simulation():
    """pulse_train should produce periodic spikes."""
    model = _make_model(
        nodes=[
            {"id": "s", "type": "stock", "name": "acc", "label": "Acc", "equation": "0", "initial_value": "0", "position": {"x": 0, "y": 0}},
            {"id": "f", "type": "flow", "name": "input", "label": "Input", "equation": "pulse_train(100, 0, 5, 100)", "position": {"x": 0, "y": 0}},
        ],
        edges=[
            {"id": "e1", "type": "flow_link", "source": "f", "target": "s"},
        ],
        outputs=["acc", "input"],
    )
    exe = translate_model(model)
    result = simulate_euler(exe, start=0, stop=15, dt=1)
    # Pulses at t=0, 5, 10, 15
    assert result["input"][0] == 100.0   # t=0
    assert result["input"][1] == 0.0     # t=1
    assert result["input"][5] == 100.0   # t=5
    assert result["input"][10] == 100.0  # t=10


def test_smooth_simulation():
    """smooth(input, T) should behave like delay1 — converge to input at steady state."""
    model = _make_model(
        nodes=[
            {"id": "a", "type": "aux", "name": "input", "label": "Input", "equation": "10", "position": {"x": 0, "y": 0}},
            {"id": "d", "type": "aux", "name": "smoothed", "label": "Smoothed", "equation": "smooth(input, 5)", "position": {"x": 0, "y": 0}},
        ],
        outputs=["smoothed"],
    )
    exe = translate_model(model)
    result = simulate_euler(exe, start=0, stop=100, dt=0.25)
    assert abs(result["smoothed"][-1] - 10.0) < 0.01


def test_smooth3_simulation():
    """smooth3(input, T) should behave like delay3 — converge to input at steady state."""
    model = _make_model(
        nodes=[
            {"id": "a", "type": "aux", "name": "input", "label": "Input", "equation": "10", "position": {"x": 0, "y": 0}},
            {"id": "d", "type": "aux", "name": "smoothed", "label": "Smoothed", "equation": "smooth3(input, 5)", "position": {"x": 0, "y": 0}},
        ],
        outputs=["smoothed"],
    )
    exe = translate_model(model)
    result = simulate_euler(exe, start=0, stop=100, dt=0.25)
    assert abs(result["smoothed"][-1] - 10.0) < 0.01


def test_delay_fixed_simulation():
    """delay_fixed should shift input by exactly delay_time."""
    model = _make_model(
        nodes=[
            {"id": "a", "type": "aux", "name": "input", "label": "Input", "equation": "step(10, 5)", "position": {"x": 0, "y": 0}},
            {"id": "d", "type": "aux", "name": "delayed", "label": "Delayed", "equation": "delay_fixed(input, 3, 0)", "position": {"x": 0, "y": 0}},
        ],
        outputs=["input", "delayed"],
    )
    exe = translate_model(model)
    result = simulate_euler(exe, start=0, stop=15, dt=1)
    # Input steps to 10 at t=5
    # Delayed should step to 10 at t=8 (3 time units later)
    assert result["delayed"][7] == 0.0   # t=7: still 0
    assert result["delayed"][8] == 10.0  # t=8: delayed output arrives


def test_ramp_in_simulation():
    """ramp function should produce linearly increasing values."""
    model = _make_model(
        nodes=[
            {"id": "a", "type": "aux", "name": "val", "label": "Val", "equation": "ramp(2, 3, 8)", "position": {"x": 0, "y": 0}},
        ],
        outputs=["val"],
    )
    exe = translate_model(model)
    result = simulate_euler(exe, start=0, stop=10, dt=1)
    # t=0,1,2: 0 (before start)
    assert result["val"][0] == 0.0
    assert result["val"][2] == 0.0
    # t=3: ramp starts, val = 2*(3-3) = 0
    assert result["val"][3] == 0.0
    # t=5: val = 2*(5-3) = 4
    assert result["val"][5] == 4.0
    # t=8: val = 2*(8-3) = 10 (end of ramp)
    assert result["val"][8] == 10.0
    # t=10: val stays at 10 (clamped at end)
    assert result["val"][10] == 10.0


def test_combined_if_then_else_step_time():
    """Complex expression combining if_then_else, step, and TIME."""
    model = _make_model(
        nodes=[
            {"id": "a", "type": "aux", "name": "policy", "label": "Policy",
             "equation": "if_then_else(TIME >= 10, step(50, 10), 0)", "position": {"x": 0, "y": 0}},
        ],
        outputs=["policy"],
    )
    exe = translate_model(model)
    result = simulate_euler(exe, start=0, stop=15, dt=1)
    assert result["policy"][5] == 0.0    # t=5: before
    assert result["policy"][10] == 50.0  # t=10: policy active


def test_time_not_flagged_as_unknown_symbol():
    """TIME should not produce an UNKNOWN_SYMBOL validation error."""
    from app.validation.semantic import validate_semantics
    model = _make_model(
        nodes=[
            {"id": "a", "type": "aux", "name": "val", "label": "Val", "equation": "TIME * 2", "position": {"x": 0, "y": 0}},
        ],
    )
    errors, warnings = validate_semantics(model)
    error_codes = [e.code for e in errors]
    assert "UNKNOWN_SYMBOL" not in error_codes
