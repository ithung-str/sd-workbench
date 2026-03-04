from __future__ import annotations

from collections import Counter, defaultdict, deque
from typing import Iterable

from app.equations.parser import EquationSyntaxError, UnsupportedExpressionError, parse_equation
from app.schemas.model import AuxNode, FlowNode, LookupNode, ModelDocument, StockNode, ValidationIssue


VARIABLE_NODE_TYPES = {"stock", "aux", "flow", "lookup"}
BUILTIN_SYMBOLS = {"TIME"}



def _node_type(node) -> str:
    return getattr(node, "type")


def _is_variable_node(node) -> bool:
    return isinstance(node, (StockNode, AuxNode, FlowNode, LookupNode))



def _allowed_edge(edge_type: str, source_type: str, target_type: str) -> bool:
    if edge_type == "influence":
        # Stocks cannot be influence targets — they only accumulate through flows
        if target_type == "stock":
            return False
        return source_type in VARIABLE_NODE_TYPES and target_type in VARIABLE_NODE_TYPES
    if edge_type == "flow_link":
        # flow_link connects flow↔stock or flow↔cloud
        pair = {source_type, target_type}
        return pair == {"stock", "flow"} or pair == {"cloud", "flow"}
    return False



def _derive_stock_equations(model: ModelDocument) -> dict[str, str]:
    """Derive stock derivative equations from flow_link edges: sum(inflows) - sum(outflows)."""
    node_by_id: dict[str, object] = {}
    flow_ids: set[str] = set()
    for node in model.nodes:
        node_by_id[node.id] = node
        if isinstance(node, FlowNode):
            flow_ids.add(node.id)

    stock_eq: dict[str, str] = {}
    inflows: dict[str, list[str]] = {}
    outflows: dict[str, list[str]] = {}

    for edge in model.edges:
        if edge.type != "flow_link":
            continue
        src = node_by_id.get(edge.source)
        tgt = node_by_id.get(edge.target)
        if src is None or tgt is None:
            continue
        if isinstance(src, FlowNode) and isinstance(tgt, StockNode):
            inflows.setdefault(tgt.id, []).append(src.name)
        if isinstance(src, StockNode) and isinstance(tgt, FlowNode):
            outflows.setdefault(src.id, []).append(tgt.name)

    for node in model.nodes:
        if not isinstance(node, StockNode):
            continue
        inf = inflows.get(node.id, [])
        outf = outflows.get(node.id, [])
        if not inf and not outf:
            continue
        terms: list[str] = []
        for f in inf:
            terms.append(f)
        for f in outf:
            terms.append(f"-{f}")
        eq = terms[0]
        for t in terms[1:]:
            eq += f" - {t[1:]}" if t.startswith("-") else f" + {t}"
        stock_eq[node.id] = eq

    return stock_eq


def _topo_sort_dependencies(dependencies: dict[str, set[str]]) -> tuple[list[str], set[str]]:
    indegree = {name: 0 for name in dependencies}
    reverse = defaultdict(set)
    for name, deps in dependencies.items():
        for dep in deps:
            if dep in indegree:
                indegree[name] += 1
                reverse[dep].add(name)
    q = deque(sorted([name for name, deg in indegree.items() if deg == 0]))
    out: list[str] = []
    while q:
        name = q.popleft()
        out.append(name)
        for child in sorted(reverse[name]):
            indegree[child] -= 1
            if indegree[child] == 0:
                q.append(child)
    if len(out) == len(indegree):
        return out, set()
    cycle = {name for name, deg in indegree.items() if deg > 0}
    return out, cycle



def validate_semantics(model: ModelDocument) -> tuple[list[ValidationIssue], list[ValidationIssue]]:
    errors: list[ValidationIssue] = []
    warnings: list[ValidationIssue] = []

    node_by_id = {node.id: node for node in model.nodes}
    variable_nodes = [node for node in model.nodes if _is_variable_node(node)]
    name_counts = Counter(node.name for node in variable_nodes)
    for node in variable_nodes:
        if name_counts[node.name] > 1:
            errors.append(
                ValidationIssue(
                    code="DUPLICATE_VARIABLE_NAME",
                    message=f"Duplicate variable name '{node.name}'",
                    severity="error",
                    node_id=node.id,
                    field="name",
                    symbol=node.name,
                )
            )
        if isinstance(node, StockNode) and node.initial_value == "":
            errors.append(
                ValidationIssue(
                    code="MISSING_INITIAL_VALUE",
                    message="Stock requires an initial_value",
                    severity="error",
                    node_id=node.id,
                    field="initial_value",
                )
            )

    name_index = {node.name: node for node in variable_nodes}

    # Edge legality
    for edge in model.edges:
        if edge.source not in node_by_id or edge.target not in node_by_id:
            continue
        source_type = _node_type(node_by_id[edge.source])
        target_type = _node_type(node_by_id[edge.target])
        if not _allowed_edge(edge.type, source_type, target_type):
            errors.append(
                ValidationIssue(
                    code="ILLEGAL_CONNECTION",
                    message=f"Illegal {edge.type} connection: {source_type} -> {target_type}",
                    severity="error",
                    edge_id=edge.id,
                )
            )
        if edge.type == "flow_link":
            source_node = node_by_id[edge.source]
            target_node = node_by_id[edge.target]
            stock_node = source_node if isinstance(source_node, StockNode) else (target_node if isinstance(target_node, StockNode) else None)
            flow_node = source_node if isinstance(source_node, FlowNode) else (target_node if isinstance(target_node, FlowNode) else None)
            if stock_node and flow_node:
                stock_units = (stock_node.units or "").strip()
                flow_units = (flow_node.units or "").strip()
                if stock_units and flow_units and stock_units != flow_units:
                    warnings.append(
                        ValidationIssue(
                            code="UNIT_MISMATCH_FLOW_STOCK",
                            message=f"Flow '{flow_node.name}' units '{flow_units}' differ from linked stock '{stock_node.name}' units '{stock_units}'",
                            severity="warning",
                            node_id=flow_node.id,
                            edge_id=edge.id,
                        )
                    )
                elif stock_units and not flow_units:
                    warnings.append(
                        ValidationIssue(
                            code="UNIT_MISSING_FLOW",
                            message=f"Flow '{flow_node.name}' is linked to stock '{stock_node.name}' ({stock_units}) but has no units",
                            severity="warning",
                            node_id=flow_node.id,
                            field="units",
                        )
                    )
                elif flow_units and not stock_units:
                    warnings.append(
                        ValidationIssue(
                            code="UNIT_MISSING_STOCK",
                            message=f"Stock '{stock_node.name}' is linked to flow '{flow_node.name}' ({flow_units}) but has no units",
                            severity="warning",
                            node_id=stock_node.id,
                            field="units",
                        )
                    )

    # ── Dimension validation ──
    defined_dim_names = {d.name for d in model.dimensions}
    dim_elements: dict[str, set[str]] = {
        d.name: set(d.elements) for d in model.dimensions
    }
    for node in variable_nodes:
        if not hasattr(node, 'dimensions'):
            continue
        for dim_name in node.dimensions:
            if dim_name not in defined_dim_names:
                errors.append(
                    ValidationIssue(
                        code="UNKNOWN_DIMENSION",
                        message=f"Node '{node.name}' references undefined dimension '{dim_name}'",
                        severity="error",
                        node_id=node.id,
                    )
                )
        if hasattr(node, 'equation_overrides'):
            all_elements: set[str] = set()
            for dim_name in node.dimensions:
                all_elements |= dim_elements.get(dim_name, set())
            for elem, override_eq in node.equation_overrides.items():
                if elem not in all_elements:
                    errors.append(
                        ValidationIssue(
                            code="INVALID_OVERRIDE_ELEMENT",
                            message=f"Override element '{elem}' is not in dimensions of node '{node.name}'",
                            severity="error",
                            node_id=node.id,
                        )
                    )
                else:
                    try:
                        parse_equation(override_eq)
                    except (EquationSyntaxError, UnsupportedExpressionError) as exc:
                        errors.append(
                            ValidationIssue(
                                code="INVALID_OVERRIDE_SYNTAX",
                                message=f"Override equation for '{elem}' on '{node.name}': {exc}",
                                severity="error",
                                node_id=node.id,
                            )
                        )

    # Derive stock equations from flow_link edges so stocks with connected flows
    # are validated against the derived equation rather than their stored equation
    # (which may be empty or stale).
    derived_stock_eqs = _derive_stock_equations(model)

    dependencies: dict[str, set[str]] = {}
    for node in variable_nodes:
        equation = node.equation
        if isinstance(node, StockNode) and node.id in derived_stock_eqs:
            equation = derived_stock_eqs[node.id]
        try:
            parsed = parse_equation(equation)
        except EquationSyntaxError as exc:
            errors.append(
                ValidationIssue(
                    code="INVALID_EQUATION_SYNTAX",
                    message=str(exc),
                    severity="error",
                    node_id=node.id,
                    field="equation",
                )
            )
            continue
        except UnsupportedExpressionError as exc:
            errors.append(
                ValidationIssue(
                    code="UNSUPPORTED_EXPRESSION_FEATURE",
                    message=str(exc),
                    severity="error",
                    node_id=node.id,
                    field="equation",
                )
            )
            continue

        refs = set(parsed.symbols)
        refs.discard(node.name)
        dependencies[node.name] = refs
        for symbol in sorted(refs):
            if symbol in BUILTIN_SYMBOLS:
                continue
            if symbol not in name_index:
                errors.append(
                    ValidationIssue(
                        code="UNKNOWN_SYMBOL",
                        message=f"Unknown symbol '{symbol}' in equation",
                        severity="error",
                        node_id=node.id,
                        field="equation",
                        symbol=symbol,
                    )
                )

    # Detect dependency cycles among aux/flow; allow self-reference only for stocks via current state semantics
    transient_names = {n.name for n in variable_nodes if isinstance(n, (AuxNode, FlowNode, LookupNode))}
    transient_deps = {
        name: {dep for dep in deps if dep in transient_names}
        for name, deps in dependencies.items()
        if name in transient_names
    }
    _, cycle = _topo_sort_dependencies(transient_deps)
    if cycle:
        errors.append(
            ValidationIssue(
                code="DEPENDENCY_CYCLE",
                message=f"Dependency cycle detected among: {', '.join(sorted(cycle))}",
                severity="error",
            )
        )

    return errors, warnings



def topological_order_for_transients(model: ModelDocument) -> list[str]:
    deps: dict[str, set[str]] = {}
    for node in model.nodes:
        if isinstance(node, (AuxNode, FlowNode, LookupNode)):
            refs = parse_equation(node.equation).symbols - {node.name}
            deps[node.name] = {ref for ref in refs}
    transient_names = set(deps.keys())
    filtered = {name: {dep for dep in refs if dep in transient_names} for name, refs in deps.items()}
    order, cycle = _topo_sort_dependencies(filtered)
    if cycle:
        raise ValueError(f"Cycle in transient dependencies: {sorted(cycle)}")
    return order
