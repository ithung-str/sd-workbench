"""Tests for array-aware Euler integration."""
import numpy as np
import pytest
from app.schemas.model import (
    AuxNode, DimensionDefinition, FlowNode, FlowLinkEdge, InfluenceEdge,
    ModelDocument, Position, StockNode,
)
from app.simulation.translator import translate_model
from app.simulation.integrator import simulate_euler


def _population_model():
    """Simple subscripted model: Population[Region] with constant inflow."""
    return ModelDocument(
        id="m1", name="Test", version=1,
        dimensions=[
            DimensionDefinition(id="d1", name="Region", elements=["North", "South"]),
        ],
        nodes=[
            StockNode(
                id="s1", type="stock", name="Population", label="Population",
                equation="growth", initial_value=100,
                position=Position(x=0, y=0),
                dimensions=["Region"],
            ),
            FlowNode(
                id="f1", type="flow", name="growth", label="Growth",
                equation="rate * Population",
                position=Position(x=100, y=0),
                dimensions=["Region"],
            ),
            AuxNode(
                id="a1", type="aux", name="rate", label="Rate",
                equation="0.1",
                position=Position(x=200, y=0),
            ),
        ],
        edges=[
            FlowLinkEdge(id="e1", type="flow_link", source="f1", target="s1"),
            InfluenceEdge(id="e2", type="influence", source="a1", target="f1"),
            InfluenceEdge(id="e3", type="influence", source="s1", target="f1"),
        ],
        outputs=["Population"],
    )


class TestArrayIntegration:
    def test_subscripted_output_keys(self):
        model = _population_model()
        exe = translate_model(model)
        series = simulate_euler(exe, start=0, stop=1, dt=0.5)
        assert "Population[North]" in series
        assert "Population[South]" in series
        assert "time" in series

    def test_subscripted_initial_values_broadcast(self):
        model = _population_model()
        exe = translate_model(model)
        series = simulate_euler(exe, start=0, stop=0, dt=1)
        assert series["Population[North]"][0] == 100.0
        assert series["Population[South]"][0] == 100.0

    def test_subscripted_stocks_grow(self):
        model = _population_model()
        exe = translate_model(model)
        series = simulate_euler(exe, start=0, stop=2, dt=1)
        # Both regions start at 100, grow at 10% per step
        # t=0: 100, t=1: 100+10=110, t=2: 110+11=121
        assert series["Population[North]"][-1] == pytest.approx(121.0, rel=1e-6)
        assert series["Population[South]"][-1] == pytest.approx(121.0, rel=1e-6)

    def test_scalar_model_still_works(self):
        """Scalar models must not break."""
        model = ModelDocument(
            id="m1", name="Test", version=1,
            nodes=[
                StockNode(id="s1", type="stock", name="x", label="X",
                          equation="1", initial_value=0,
                          position=Position(x=0, y=0)),
            ],
            outputs=["x"],
        )
        exe = translate_model(model)
        series = simulate_euler(exe, start=0, stop=2, dt=1)
        assert series["x"] == [0.0, 1.0, 2.0]


class TestEquationOverrides:
    def test_per_element_override(self):
        model = ModelDocument(
            id="m1", name="Test", version=1,
            dimensions=[
                DimensionDefinition(id="d1", name="Region", elements=["North", "South"]),
            ],
            nodes=[
                StockNode(
                    id="s1", type="stock", name="Population", label="Population",
                    equation="growth", initial_value=100,
                    position=Position(x=0, y=0),
                    dimensions=["Region"],
                ),
                FlowNode(
                    id="f1", type="flow", name="growth", label="Growth",
                    equation="10",
                    position=Position(x=100, y=0),
                    dimensions=["Region"],
                    equation_overrides={"South": "20"},
                ),
            ],
            edges=[
                FlowLinkEdge(id="e1", type="flow_link", source="f1", target="s1"),
            ],
            outputs=["Population"],
        )
        exe = translate_model(model)
        series = simulate_euler(exe, start=0, stop=1, dt=1)
        assert series["Population[North]"][-1] == 110.0  # 100 + 10
        assert series["Population[South]"][-1] == 120.0  # 100 + 20


class TestCrossElementReference:
    def test_reference_specific_element(self):
        """An equation can reference Population[North] explicitly."""
        model = ModelDocument(
            id="m1", name="Test", version=1,
            dimensions=[
                DimensionDefinition(id="d1", name="Region", elements=["North", "South"]),
            ],
            nodes=[
                AuxNode(
                    id="a1", type="aux", name="Population", label="Pop",
                    equation="100",
                    position=Position(x=0, y=0),
                    dimensions=["Region"],
                ),
                AuxNode(
                    id="a2", type="aux", name="north_pop", label="North Pop",
                    equation="Population[North]",
                    position=Position(x=100, y=0),
                ),
            ],
            edges=[
                InfluenceEdge(id="e1", type="influence", source="a1", target="a2"),
            ],
            outputs=["north_pop"],
        )
        exe = translate_model(model)
        series = simulate_euler(exe, start=0, stop=0, dt=1)
        assert series["north_pop"][0] == 100.0
