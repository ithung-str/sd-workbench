"""Tests for dimension-aware model translation."""
import pytest
from app.schemas.model import (
    AuxNode, DimensionDefinition, ModelDocument, Position, StockNode, FlowNode,
    FlowLinkEdge, InfluenceEdge,
)
from app.simulation.translator import translate_model


def _minimal_model_with_dims():
    return ModelDocument(
        id="m1", name="Test", version=1,
        dimensions=[
            DimensionDefinition(id="d1", name="Region", elements=["North", "South", "East"]),
        ],
        nodes=[
            StockNode(
                id="s1", type="stock", name="Population", label="Population",
                equation="inflow", initial_value=100,
                position=Position(x=0, y=0),
                dimensions=["Region"],
            ),
            AuxNode(
                id="a1", type="aux", name="inflow", label="Inflow",
                equation="0.1 * Population",
                position=Position(x=100, y=0),
                dimensions=["Region"],
            ),
        ],
        edges=[
            InfluenceEdge(id="e1", type="influence", source="a1", target="s1"),
        ],
        outputs=["Population"],
    )


class TestDimensionContext:
    def test_translate_builds_dimension_context(self):
        model = _minimal_model_with_dims()
        exe = translate_model(model)
        assert exe.dimension_context is not None
        assert "Region" in exe.dimension_context.dimensions
        assert exe.dimension_context.dimensions["Region"] == ["North", "South", "East"]

    def test_node_dimensions_populated(self):
        model = _minimal_model_with_dims()
        exe = translate_model(model)
        assert "Population" in exe.dimension_context.node_dimensions
        assert exe.dimension_context.node_dimensions["Population"] == ["Region"]
        assert "inflow" in exe.dimension_context.node_dimensions

    def test_scalar_model_has_empty_dimension_context(self):
        model = ModelDocument(
            id="m1", name="Test", version=1,
            nodes=[
                AuxNode(id="a1", type="aux", name="x", label="X",
                        equation="1", position=Position(x=0, y=0)),
            ],
            outputs=["x"],
        )
        exe = translate_model(model)
        assert exe.dimension_context.dimensions == {}
        assert exe.dimension_context.node_dimensions == {}
