"""Tests for dimension-related validation."""
import pytest
from app.schemas.model import (
    AuxNode, DimensionDefinition, ModelDocument, Position, StockNode,
)
from app.validation.semantic import validate_semantics


def _model(dimensions=None, nodes=None):
    return ModelDocument(
        id="m1", name="Test", version=1,
        dimensions=dimensions or [],
        nodes=nodes or [
            AuxNode(id="a1", type="aux", name="x", label="X",
                    equation="1", position=Position(x=0, y=0)),
        ],
        outputs=["x"],
    )


class TestDimensionValidation:
    def test_valid_dimension_reference(self):
        model = _model(
            dimensions=[DimensionDefinition(id="d1", name="Region", elements=["N", "S"])],
            nodes=[
                AuxNode(id="a1", type="aux", name="x", label="X",
                        equation="1", position=Position(x=0, y=0),
                        dimensions=["Region"]),
            ],
        )
        errors, _ = validate_semantics(model)
        dim_errors = [e for e in errors if e.code == "UNKNOWN_DIMENSION"]
        assert len(dim_errors) == 0

    def test_unknown_dimension_reference(self):
        model = _model(
            nodes=[
                AuxNode(id="a1", type="aux", name="x", label="X",
                        equation="1", position=Position(x=0, y=0),
                        dimensions=["Nonexistent"]),
            ],
        )
        errors, _ = validate_semantics(model)
        dim_errors = [e for e in errors if e.code == "UNKNOWN_DIMENSION"]
        assert len(dim_errors) == 1
        assert "Nonexistent" in dim_errors[0].message

    def test_invalid_override_element(self):
        model = _model(
            dimensions=[DimensionDefinition(id="d1", name="Region", elements=["N", "S"])],
            nodes=[
                AuxNode(id="a1", type="aux", name="x", label="X",
                        equation="1", position=Position(x=0, y=0),
                        dimensions=["Region"],
                        equation_overrides={"BadElement": "2"}),
            ],
        )
        errors, _ = validate_semantics(model)
        override_errors = [e for e in errors if e.code == "INVALID_OVERRIDE_ELEMENT"]
        assert len(override_errors) == 1

    def test_override_equation_must_parse(self):
        model = _model(
            dimensions=[DimensionDefinition(id="d1", name="Region", elements=["N", "S"])],
            nodes=[
                AuxNode(id="a1", type="aux", name="x", label="X",
                        equation="1", position=Position(x=0, y=0),
                        dimensions=["Region"],
                        equation_overrides={"N": "1 +"}),
            ],
        )
        errors, _ = validate_semantics(model)
        syntax_errors = [e for e in errors if e.code == "INVALID_OVERRIDE_SYNTAX"]
        assert len(syntax_errors) == 1
