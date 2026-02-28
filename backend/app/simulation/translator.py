from __future__ import annotations

from dataclasses import dataclass

from app.equations.parser import parse_equation
from app.schemas.model import AuxNode, FlowNode, LookupNode, ModelDocument, StockNode
from app.validation.semantic import topological_order_for_transients


@dataclass(frozen=True)
class ExecutableNode:
    name: str
    node_type: str
    equation: str
    parsed_symbols: set[str]
    node_id: str


@dataclass(frozen=True)
class ExecutableModel:
    stock_nodes: list[StockNode]
    aux_nodes: list[AuxNode]
    flow_nodes: list[FlowNode]
    lookup_nodes: list[LookupNode]
    node_by_name: dict[str, object]
    transient_order: list[str]
    outputs: list[str]



def translate_model(model: ModelDocument) -> ExecutableModel:
    stock_nodes: list[StockNode] = []
    aux_nodes: list[AuxNode] = []
    flow_nodes: list[FlowNode] = []
    lookup_nodes: list[LookupNode] = []
    node_by_name: dict[str, object] = {}
    for node in model.nodes:
        if isinstance(node, StockNode):
            node_by_name[node.name] = node
            stock_nodes.append(node)
        elif isinstance(node, AuxNode):
            node_by_name[node.name] = node
            aux_nodes.append(node)
        elif isinstance(node, FlowNode):
            node_by_name[node.name] = node
            flow_nodes.append(node)
        elif isinstance(node, LookupNode):
            node_by_name[node.name] = node
            lookup_nodes.append(node)

    transient_order = topological_order_for_transients(model)
    outputs = model.outputs or [n.name for n in stock_nodes]
    return ExecutableModel(
        stock_nodes=stock_nodes,
        aux_nodes=aux_nodes,
        flow_nodes=flow_nodes,
        lookup_nodes=lookup_nodes,
        node_by_name=node_by_name,
        transient_order=transient_order,
        outputs=outputs,
    )
