from __future__ import annotations

from collections import Counter

from app.schemas.model import ModelDocument, ValidationIssue


VARIABLE_NODE_TYPES = {"stock", "aux", "flow", "lookup"}



def validate_structure(model: ModelDocument) -> tuple[list[ValidationIssue], list[ValidationIssue]]:
    errors: list[ValidationIssue] = []
    warnings: list[ValidationIssue] = []

    node_ids = [node.id for node in model.nodes]
    dup_node_ids = [node_id for node_id, count in Counter(node_ids).items() if count > 1]
    for node_id in dup_node_ids:
        errors.append(
            ValidationIssue(
                code="DUPLICATE_NODE_ID",
                message=f"Duplicate node id '{node_id}'",
                severity="error",
                node_id=node_id,
            )
        )

    edge_ids = [edge.id for edge in model.edges]
    dup_edge_ids = [edge_id for edge_id, count in Counter(edge_ids).items() if count > 1]
    for edge_id in dup_edge_ids:
        errors.append(
            ValidationIssue(
                code="DUPLICATE_EDGE_ID",
                message=f"Duplicate edge id '{edge_id}'",
                severity="error",
                edge_id=edge_id,
            )
        )

    node_index = {node.id: node for node in model.nodes}
    for edge in model.edges:
        if edge.source not in node_index:
            errors.append(
                ValidationIssue(
                    code="UNKNOWN_EDGE_SOURCE",
                    message=f"Edge source '{edge.source}' not found",
                    severity="error",
                    edge_id=edge.id,
                )
            )
        if edge.target not in node_index:
            errors.append(
                ValidationIssue(
                    code="UNKNOWN_EDGE_TARGET",
                    message=f"Edge target '{edge.target}' not found",
                    severity="error",
                    edge_id=edge.id,
                )
            )

    variable_names = {node.name for node in model.nodes if hasattr(node, "name")}
    for output in model.outputs:
        if output not in variable_names:
            warnings.append(
                ValidationIssue(
                    code="UNKNOWN_OUTPUT_VARIABLE",
                    message=f"Requested output '{output}' does not match any node name",
                    severity="warning",
                    field="outputs",
                    symbol=output,
                )
            )

    return errors, warnings
