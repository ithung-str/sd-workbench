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
