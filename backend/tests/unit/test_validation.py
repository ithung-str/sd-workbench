from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.schemas.model import ModelDocument
from app.validation.schema import validate_structure
from app.validation.semantic import validate_semantics


BASE_MODEL = {
    "id": "m1",
    "name": "Test",
    "version": 1,
    "nodes": [
        {
            "id": "s1",
            "type": "stock",
            "name": "stock",
            "label": "Stock",
            "equation": "flow",
            "initial_value": 10,
            "position": {"x": 0, "y": 0}
        },
        {
            "id": "f1",
            "type": "flow",
            "name": "flow",
            "label": "Flow",
            "equation": "1",
            "position": {"x": 1, "y": 1}
        }
    ],
    "edges": [
        {"id": "e1", "type": "flow_link", "source": "s1", "target": "f1"}
    ],
    "outputs": ["stock"]
}


def _model(data):
    return ModelDocument.model_validate(data)



def test_pydantic_rejects_missing_required_fields():
    bad = {"id": "x", "name": "x", "version": 1, "nodes": [{}], "edges": [], "outputs": []}
    with pytest.raises(ValidationError):
        ModelDocument.model_validate(bad)



def test_rejects_duplicate_node_ids():
    data = dict(BASE_MODEL)
    data["nodes"] = [dict(BASE_MODEL["nodes"][0]), dict(BASE_MODEL["nodes"][1])]
    data["nodes"][1]["id"] = "s1"
    model = _model(data)
    errors, _ = validate_structure(model)
    assert any(e.code == "DUPLICATE_NODE_ID" for e in errors)



def test_rejects_duplicate_variable_names():
    data = dict(BASE_MODEL)
    data["nodes"] = [dict(BASE_MODEL["nodes"][0]), dict(BASE_MODEL["nodes"][1])]
    data["nodes"][1]["name"] = "stock"
    model = _model(data)
    errors, _ = validate_semantics(model)
    assert any(e.code == "DUPLICATE_VARIABLE_NAME" for e in errors)



def test_rejects_unknown_equation_symbol():
    data = dict(BASE_MODEL)
    data["nodes"] = [dict(BASE_MODEL["nodes"][0]), dict(BASE_MODEL["nodes"][1])]
    data["nodes"][1]["equation"] = "missing_symbol"
    model = _model(data)
    errors, _ = validate_semantics(model)
    assert any(e.code == "UNKNOWN_SYMBOL" for e in errors)



def test_rejects_illegal_edge_connection():
    data = dict(BASE_MODEL)
    data["nodes"] = [
        {
            "id": "a1",
            "type": "aux",
            "name": "a1",
            "label": "A1",
            "equation": "1",
            "position": {"x": 0, "y": 0}
        },
        {
            "id": "a2",
            "type": "aux",
            "name": "a2",
            "label": "A2",
            "equation": "2",
            "position": {"x": 1, "y": 1}
        }
    ]
    data["edges"] = [{"id": "e1", "type": "flow_link", "source": "a1", "target": "a2"}]
    model = _model(data)
    errors, _ = validate_semantics(model)
    assert any(e.code == "ILLEGAL_CONNECTION" for e in errors)



def test_requires_stock_initial_value():
    data = dict(BASE_MODEL)
    data["nodes"] = [dict(BASE_MODEL["nodes"][0]), dict(BASE_MODEL["nodes"][1])]
    data["nodes"][0]["initial_value"] = ""
    model = _model(data)
    errors, _ = validate_semantics(model)
    assert any(e.code == "MISSING_INITIAL_VALUE" for e in errors)



def test_rejects_unsupported_ast_nodes():
    data = dict(BASE_MODEL)
    data["nodes"] = [dict(BASE_MODEL["nodes"][0]), dict(BASE_MODEL["nodes"][1])]
    data["nodes"][1]["equation"] = "1 if 1 else 0"
    model = _model(data)
    errors, _ = validate_semantics(model)
    assert any(e.code == "UNSUPPORTED_EXPRESSION_FEATURE" for e in errors)
