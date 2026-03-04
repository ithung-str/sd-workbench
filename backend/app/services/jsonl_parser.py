"""JSONL streaming parser for AI model responses.

Handles line buffering, per-chunk parsing/repair/validation, and
assembly of individual chunks into a complete model document.
"""

from __future__ import annotations

import json
import logging
import re
import uuid
from typing import Any

from pydantic import ValidationError

from app.schemas.model import (
    AuxNode,
    CloudNode,
    FlowLinkEdge,
    FlowNode,
    InfluenceEdge,
    LookupNode,
    StockNode,
    TextNode,
)
from app.services.ai_model_service import (
    ACTION_REQUIRED_PARAMS,
    ALLOWED_EDGE_FIELDS,
    ALLOWED_FIELDS,
    KNOWN_ACTION_TYPES,
    KNOWN_EDGE_TYPES,
    KNOWN_NODE_TYPES,
    VARIABLE_NODE_TYPES,
)

_log = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1A. JSONLLineBuffer
# ---------------------------------------------------------------------------

class JSONLLineBuffer:
    """Accumulates streamed text and yields complete newline-terminated lines."""

    def __init__(self) -> None:
        self._buffer = ""

    def feed(self, text: str) -> list[str]:
        """Feed new text, return list of complete lines (without newlines)."""
        self._buffer += text
        if "\n" not in self._buffer:
            return []
        parts = self._buffer.split("\n")
        # Last element is incomplete (or empty if text ended with \n)
        self._buffer = parts[-1]
        lines = []
        for line in parts[:-1]:
            stripped = line.strip()
            if stripped:
                lines.append(stripped)
        return lines

    def flush(self) -> str | None:
        """Return any remaining partial content, or None if empty."""
        remaining = self._buffer.strip()
        self._buffer = ""
        return remaining if remaining else None


# ---------------------------------------------------------------------------
# 1B. parse_jsonl_line
# ---------------------------------------------------------------------------

def parse_jsonl_line(line: str) -> dict | None:
    """Parse a single JSONL line into a dict, handling code fences and brace extraction.

    Returns None if the line cannot be parsed as JSON.
    """
    stripped = line.strip()
    if not stripped:
        return None

    # Skip markdown code fence markers
    if stripped.startswith("```"):
        return None

    # Try direct parse first
    try:
        obj = json.loads(stripped)
        if isinstance(obj, dict):
            return obj
        return None
    except json.JSONDecodeError:
        pass

    # Try extracting first JSON object via brace matching
    idx = stripped.find("{")
    if idx == -1:
        return None
    try:
        decoder = json.JSONDecoder()
        obj, _ = decoder.raw_decode(stripped, idx)
        if isinstance(obj, dict):
            return obj
    except (json.JSONDecodeError, ValueError):
        pass

    return None


# ---------------------------------------------------------------------------
# 1C. repair_chunk
# ---------------------------------------------------------------------------

def repair_chunk(chunk: dict) -> dict:
    """Per-chunk repair: normalize position, auto-generate IDs, apply defaults, strip unknown fields.

    Mutates and returns the chunk for convenience.
    """
    chunk_type = chunk.get("type")
    data = chunk.get("data")

    if not isinstance(data, dict):
        return chunk

    if chunk_type == "node":
        _repair_node(data)
    elif chunk_type == "edge":
        _repair_edge(data)
    elif chunk_type == "action":
        # No repair needed for actions beyond what validate does
        pass
    # message / clarification pass through unchanged

    return chunk


def _repair_node(node: dict) -> None:
    """Repair a single node dict in-place."""
    ntype = node.get("type")
    if ntype not in KNOWN_NODE_TYPES:
        return

    # Flat x/y → position
    if "position" not in node and "x" in node and "y" in node:
        node["position"] = {"x": node.pop("x"), "y": node.pop("y")}
    elif "position" not in node:
        node["position"] = {"x": 0, "y": 0}

    # Auto-generate id
    if "id" not in node or not node["id"]:
        node["id"] = str(uuid.uuid4())

    # Variable-node specific defaults
    if ntype in VARIABLE_NODE_TYPES:
        if "label" not in node or not node["label"]:
            node["label"] = node.get("name", ntype)
        if "name" not in node or not node["name"]:
            node["name"] = node.get("label", ntype)
        if "equation" not in node or node["equation"] is None:
            node["equation"] = ""

    # Stock-specific defaults
    if ntype == "stock":
        if "initial_value" not in node or node["initial_value"] is None:
            node["initial_value"] = "0"

    # Strip unknown fields
    allowed = ALLOWED_FIELDS.get(ntype, set())
    if allowed:
        for k in list(node):
            if k not in allowed:
                del node[k]


def _repair_edge(edge: dict) -> None:
    """Repair a single edge dict in-place."""
    etype = edge.get("type")
    if etype not in KNOWN_EDGE_TYPES:
        return

    if "id" not in edge or not edge["id"]:
        edge["id"] = str(uuid.uuid4())

    allowed = ALLOWED_EDGE_FIELDS.get(etype, set())
    if allowed:
        for k in list(edge):
            if k not in allowed:
                del edge[k]


# ---------------------------------------------------------------------------
# 1D. validate_chunk
# ---------------------------------------------------------------------------

# Pydantic model lookup by node type
_NODE_VALIDATORS: dict[str, type] = {
    "stock": StockNode,
    "flow": FlowNode,
    "aux": AuxNode,
    "lookup": LookupNode,
    "cloud": CloudNode,
    "text": TextNode,
}

_EDGE_VALIDATORS: dict[str, type] = {
    "influence": InfluenceEdge,
    "flow_link": FlowLinkEdge,
}


def validate_chunk(chunk: dict) -> tuple[dict, str, list[str]]:
    """Validate a single repaired chunk.

    Returns (repaired_data, status, errors) where status is "valid" | "warning" | "error".
    """
    chunk_type = chunk.get("type")
    data = chunk.get("data", {})

    if chunk_type == "node":
        return _validate_node_chunk(data)
    elif chunk_type == "edge":
        return _validate_edge_chunk(data)
    elif chunk_type == "action":
        return _validate_action_chunk(data)
    elif chunk_type in ("message", "clarification"):
        return data, "valid", []
    else:
        return data, "error", [f"Unknown chunk type: {chunk_type}"]


def _validate_node_chunk(data: dict) -> tuple[dict, str, list[str]]:
    ntype = data.get("type")
    validator = _NODE_VALIDATORS.get(ntype)  # type: ignore[arg-type]
    if not validator:
        return data, "error", [f"Unknown node type: {ntype}"]
    try:
        validator.model_validate(data)
        return data, "valid", []
    except ValidationError as exc:
        errors = [str(e["msg"]) for e in exc.errors()]
        return data, "warning", errors


def _validate_edge_chunk(data: dict) -> tuple[dict, str, list[str]]:
    etype = data.get("type")
    validator = _EDGE_VALIDATORS.get(etype)  # type: ignore[arg-type]
    if not validator:
        return data, "error", [f"Unknown edge type: {etype}"]
    try:
        validator.model_validate(data)
        return data, "valid", []
    except ValidationError as exc:
        errors = [str(e["msg"]) for e in exc.errors()]
        return data, "warning", errors


def _validate_action_chunk(data: dict) -> tuple[dict, str, list[str]]:
    action_type = data.get("type", "")
    if action_type not in KNOWN_ACTION_TYPES:
        return data, "error", [f"Unknown action type: '{action_type}'"]

    params = data.get("params", {})
    required = ACTION_REQUIRED_PARAMS.get(action_type, set())
    missing = required - set(params.keys())
    if missing:
        return data, "warning", [f"Missing required params for '{action_type}': {sorted(missing)}"]

    return data, "valid", []


# ---------------------------------------------------------------------------
# 1E. assemble_model_from_chunks
# ---------------------------------------------------------------------------

def assemble_model_from_chunks(
    chunks: list[dict],
    model_name: str = "AI Generated Model",
    model_id: str | None = None,
) -> dict[str, Any]:
    """Collect node/edge/action chunks into a raw model dict suitable for _validate_full().

    Returns a dict with keys: id, name, version, nodes, edges, outputs, actions, message.
    The actions/message keys are extra (not part of ModelDocument) but useful for the caller.
    """
    nodes: list[dict] = []
    edges: list[dict] = []
    actions: list[dict] = []
    message = ""

    for chunk in chunks:
        ctype = chunk.get("type")
        data = chunk.get("data", {})
        if ctype == "node":
            nodes.append(data)
        elif ctype == "edge":
            edges.append(data)
        elif ctype == "action":
            actions.append(data)
        elif ctype == "message":
            message = data.get("text", "") if isinstance(data, dict) else str(data)

    # Build outputs from variable nodes
    outputs = [
        n.get("name", "")
        for n in nodes
        if n.get("type") in VARIABLE_NODE_TYPES and n.get("name")
    ]

    return {
        "id": model_id or str(uuid.uuid4()),
        "name": model_name,
        "version": 1,
        "nodes": nodes,
        "edges": edges,
        "outputs": outputs,
        # Extra keys for caller (not part of ModelDocument schema)
        "_actions": actions,
        "_message": message,
    }


# ---------------------------------------------------------------------------
# 1F. Monolithic JSON fallback detection
# ---------------------------------------------------------------------------

def detect_monolithic_response(full_text: str) -> dict | None:
    """Detect if the full response is a single monolithic JSON object (not JSONL).

    Returns the parsed dict if it looks like a monolithic response
    (has 'model', 'patches', 'clarification', or 'actions' as a top-level key),
    or None if it doesn't match.
    """
    stripped = full_text.strip()
    if not stripped:
        return None

    # Strip code fences
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)

    # Try to parse as a single JSON object
    try:
        obj = json.loads(stripped)
    except json.JSONDecodeError:
        # Try extracting first JSON object
        idx = stripped.find("{")
        if idx == -1:
            return None
        try:
            decoder = json.JSONDecoder()
            obj, _ = decoder.raw_decode(stripped, idx)
        except (json.JSONDecodeError, ValueError):
            return None

    if not isinstance(obj, dict):
        return None

    # Check if it looks like a monolithic response
    monolithic_keys = {"model", "patches", "clarification", "actions"}
    if monolithic_keys & set(obj.keys()):
        return obj

    return None
