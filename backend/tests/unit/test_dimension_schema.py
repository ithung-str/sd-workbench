"""Tests for dimension-related schema additions."""
import pytest
from app.schemas.model import (
    DimensionDefinition,
    ModelDocument,
    StockNode,
    AuxNode,
    Position,
)


class TestDimensionDefinition:
    def test_basic_dimension(self):
        dim = DimensionDefinition(id="dim_1", name="Region", elements=["North", "South", "East"])
        assert dim.name == "Region"
        assert dim.elements == ["North", "South", "East"]

    def test_rejects_extra_fields(self):
        with pytest.raises(Exception):
            DimensionDefinition(id="dim_1", name="Region", elements=["N"], bogus="x")

    def test_empty_elements_allowed(self):
        dim = DimensionDefinition(id="dim_1", name="Empty", elements=[])
        assert dim.elements == []


class TestNodeDimensionFields:
    def test_stock_with_dimensions(self):
        node = StockNode(
            id="s1", type="stock", name="pop", label="Population",
            equation="inflow", initial_value=100,
            position=Position(x=0, y=0),
            dimensions=["Region"],
        )
        assert node.dimensions == ["Region"]
        assert node.equation_overrides == {}

    def test_stock_with_overrides(self):
        node = StockNode(
            id="s1", type="stock", name="pop", label="Population",
            equation="inflow", initial_value=100,
            position=Position(x=0, y=0),
            dimensions=["Region"],
            equation_overrides={"North": "special_inflow"},
        )
        assert node.equation_overrides == {"North": "special_inflow"}

    def test_aux_with_dimensions(self):
        node = AuxNode(
            id="a1", type="aux", name="rate", label="Rate",
            equation="0.1", position=Position(x=0, y=0),
            dimensions=["Region"],
        )
        assert node.dimensions == ["Region"]

    def test_scalar_node_has_empty_dimensions(self):
        node = AuxNode(
            id="a1", type="aux", name="rate", label="Rate",
            equation="0.1", position=Position(x=0, y=0),
        )
        assert node.dimensions == []
        assert node.equation_overrides == {}


class TestModelDocumentDimensions:
    def test_model_with_dimensions(self):
        doc = ModelDocument(
            id="m1", name="Test", version=1,
            dimensions=[
                DimensionDefinition(id="d1", name="Region", elements=["North", "South"]),
            ],
            nodes=[
                AuxNode(id="a1", type="aux", name="x", label="X",
                        equation="1", position=Position(x=0, y=0)),
            ],
        )
        assert len(doc.dimensions) == 1
        assert doc.dimensions[0].name == "Region"

    def test_model_without_dimensions(self):
        doc = ModelDocument(
            id="m1", name="Test", version=1,
            nodes=[
                AuxNode(id="a1", type="aux", name="x", label="X",
                        equation="1", position=Position(x=0, y=0)),
            ],
        )
        assert doc.dimensions == []
