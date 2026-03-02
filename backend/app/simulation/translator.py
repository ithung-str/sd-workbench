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



def _derive_stock_equations(model: ModelDocument) -> dict[str, str]:
    """Derive stock derivative equations from flow_link edges: sum(inflows) - sum(outflows)."""
    node_by_id: dict[str, object] = {}
    flow_ids: set[str] = set()
    for node in model.nodes:
        node_by_id[node.id] = node
        if isinstance(node, FlowNode):
            flow_ids.add(node.id)

    stock_eq: dict[str, str] = {}  # stock_id → equation
    inflows: dict[str, list[str]] = {}
    outflows: dict[str, list[str]] = {}

    for edge in model.edges:
        if edge.type != "flow_link":
            continue
        src = node_by_id.get(edge.source)
        tgt = node_by_id.get(edge.target)
        if src is None or tgt is None:
            continue
        # flow → stock: inflow to the stock
        if isinstance(src, FlowNode) and isinstance(tgt, StockNode):
            inflows.setdefault(tgt.id, []).append(src.name)
        # stock → flow: outflow from the stock
        if isinstance(src, StockNode) and isinstance(tgt, FlowNode):
            outflows.setdefault(src.id, []).append(tgt.name)

    for node in model.nodes:
        if not isinstance(node, StockNode):
            continue
        inf = inflows.get(node.id, [])
        outf = outflows.get(node.id, [])
        if not inf and not outf:
            # No flows connected — keep existing equation (e.g. '0')
            continue
        terms: list[str] = []
        for f in inf:
            terms.append(f)
        for f in outf:
            terms.append(f"-{f}")
        eq = terms[0]
        for t in terms[1:]:
            eq += f" {t}" if t.startswith("-") else f" + {t}"
        stock_eq[node.id] = eq

    return stock_eq


def translate_model(model: ModelDocument) -> ExecutableModel:
    # Auto-derive stock equations from flow_link edges
    derived_equations = _derive_stock_equations(model)

    stock_nodes: list[StockNode] = []
    aux_nodes: list[AuxNode] = []
    flow_nodes: list[FlowNode] = []
    lookup_nodes: list[LookupNode] = []
    node_by_name: dict[str, object] = {}
    for node in model.nodes:
        if isinstance(node, StockNode):
            if node.id in derived_equations:
                node = node.model_copy(update={"equation": derived_equations[node.id]})
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
