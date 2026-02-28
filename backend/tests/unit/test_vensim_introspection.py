from __future__ import annotations

from app.schemas.vensim import ImportedVariableSummary
from app.vensim.introspection import build_dependency_graph


def test_build_dependency_graph_from_equations():
    variables = [
        ImportedVariableSummary(name="inflow", equation="3"),
        ImportedVariableSummary(name="outflow", equation="1"),
        ImportedVariableSummary(name="inventory", equation="inflow - outflow"),
        ImportedVariableSummary(name="aux_unused", equation="max(inventory, 0)"),
    ]
    graph = build_dependency_graph(variables)
    edges = set(tuple(e) for e in graph.edges)
    assert ("inflow", "inventory") in edges
    assert ("outflow", "inventory") in edges
    assert ("inventory", "aux_unused") in edges
