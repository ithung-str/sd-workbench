from __future__ import annotations

import pytest

from app.schemas.model import ModelDocument
from app.simulation.translator import translate_model


MODEL = {
    "id": "m",
    "name": "M",
    "version": 1,
    "nodes": [
        {"id": "s", "type": "stock", "name": "x", "label": "X", "equation": "f", "initial_value": 1, "position": {"x": 0, "y": 0}},
        {"id": "a", "type": "aux", "name": "a", "label": "A", "equation": "2", "position": {"x": 0, "y": 0}},
        {"id": "f", "type": "flow", "name": "f", "label": "F", "equation": "a", "position": {"x": 0, "y": 0}}
    ],
    "edges": [],
    "outputs": ["x", "f"]
}


def test_topological_order_for_transients():
    translated = translate_model(ModelDocument.model_validate(MODEL))
    assert translated.transient_order == ["a", "f"]



def test_detects_dependency_cycle():
    data = {**MODEL}
    data["nodes"] = [dict(n) for n in MODEL["nodes"]]
    data["nodes"][1]["equation"] = "f"
    data["nodes"][2]["equation"] = "a"
    with pytest.raises(ValueError):
        translate_model(ModelDocument.model_validate(data))


def test_delay3_expansion():
    """delay3(a, 10) in an aux should produce 3 internal DelayStock entries."""
    data = {
        "id": "m", "name": "M", "version": 1,
        "nodes": [
            {"id": "a", "type": "aux", "name": "a", "label": "A", "equation": "2", "position": {"x": 0, "y": 0}},
            {"id": "d", "type": "aux", "name": "delayed", "label": "D", "equation": "delay3(a, 10)", "position": {"x": 0, "y": 0}},
        ],
        "edges": [],
        "outputs": ["delayed"],
    }
    translated = translate_model(ModelDocument.model_validate(data))
    assert len(translated.delay_stocks) == 3
    # The equation should be rewritten to reference the final delay stock
    delayed_node = translated.node_by_name["delayed"]
    assert "delay3" not in delayed_node.equation
    assert translated.delay_stocks[-1].name in delayed_node.equation


def test_delay1_expansion():
    """delay1(a, 5) should produce 1 internal DelayStock."""
    data = {
        "id": "m", "name": "M", "version": 1,
        "nodes": [
            {"id": "a", "type": "aux", "name": "a", "label": "A", "equation": "2", "position": {"x": 0, "y": 0}},
            {"id": "d", "type": "aux", "name": "delayed", "label": "D", "equation": "delay1(a, 5)", "position": {"x": 0, "y": 0}},
        ],
        "edges": [],
        "outputs": ["delayed"],
    }
    translated = translate_model(ModelDocument.model_validate(data))
    assert len(translated.delay_stocks) == 1
    assert translated.delay_stocks[0].input_expr == "a"


def test_delayn_expansion():
    """delayn(a, 10, 4) should produce 4 internal DelayStocks."""
    data = {
        "id": "m", "name": "M", "version": 1,
        "nodes": [
            {"id": "a", "type": "aux", "name": "a", "label": "A", "equation": "2", "position": {"x": 0, "y": 0}},
            {"id": "d", "type": "aux", "name": "delayed", "label": "D", "equation": "delayn(a, 10, 4)", "position": {"x": 0, "y": 0}},
        ],
        "edges": [],
        "outputs": ["delayed"],
    }
    translated = translate_model(ModelDocument.model_validate(data))
    assert len(translated.delay_stocks) == 4


def test_smooth_expansion():
    """smooth(a, 5) should expand like delay1 → 1 internal DelayStock."""
    data = {
        "id": "m", "name": "M", "version": 1,
        "nodes": [
            {"id": "a", "type": "aux", "name": "a", "label": "A", "equation": "2", "position": {"x": 0, "y": 0}},
            {"id": "d", "type": "aux", "name": "smoothed", "label": "S", "equation": "smooth(a, 5)", "position": {"x": 0, "y": 0}},
        ],
        "edges": [],
        "outputs": ["smoothed"],
    }
    translated = translate_model(ModelDocument.model_validate(data))
    assert len(translated.delay_stocks) == 1
    # Equation rewritten to reference internal delay stock, not smooth() call
    eq = translated.node_by_name["smoothed"].equation
    assert "smooth(" not in eq
    assert eq.startswith("__delay__")


def test_smooth3_expansion():
    """smooth3(a, 10) should expand like delay3 → 3 internal DelayStocks."""
    data = {
        "id": "m", "name": "M", "version": 1,
        "nodes": [
            {"id": "a", "type": "aux", "name": "a", "label": "A", "equation": "2", "position": {"x": 0, "y": 0}},
            {"id": "d", "type": "aux", "name": "smoothed", "label": "S", "equation": "smooth3(a, 10)", "position": {"x": 0, "y": 0}},
        ],
        "edges": [],
        "outputs": ["smoothed"],
    }
    translated = translate_model(ModelDocument.model_validate(data))
    assert len(translated.delay_stocks) == 3
    eq = translated.node_by_name["smoothed"].equation
    assert "smooth3(" not in eq
    assert eq.startswith("__delay__")


def test_delay_fixed_expansion():
    """delay_fixed(a, 10, 0) should produce 1 DelayFixedSpec."""
    data = {
        "id": "m", "name": "M", "version": 1,
        "nodes": [
            {"id": "a", "type": "aux", "name": "a", "label": "A", "equation": "2", "position": {"x": 0, "y": 0}},
            {"id": "d", "type": "aux", "name": "delayed", "label": "D", "equation": "delay_fixed(a, 10, 0)", "position": {"x": 0, "y": 0}},
        ],
        "edges": [],
        "outputs": ["delayed"],
    }
    translated = translate_model(ModelDocument.model_validate(data))
    assert len(translated.delay_fixed_specs) == 1
    assert "delay_fixed" not in translated.node_by_name["delayed"].equation
    assert translated.delay_fixed_specs[0].input_expr == "a"
    assert translated.delay_fixed_specs[0].initial_expr == "0"
