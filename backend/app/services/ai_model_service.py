from __future__ import annotations

import json
import os
import re
import uuid
from collections.abc import AsyncGenerator
from typing import Any

import httpx
from fastapi import HTTPException
from pydantic import ValidationError

from app.schemas.ai import AIAction, AIChatMessage, AIPatch, RetryLogEntry
from app.schemas.model import (
    AuxNode,
    CloudNode,
    FlowLinkEdge,
    FlowNode,
    InfluenceEdge,
    LookupNode,
    LookupPoint,
    ModelDocument,
    Position,
    StockNode,
    TextNode,
)
from app.services.model_service import validate_model

GEMINI_ESCALATION_MODEL = os.getenv("GEMINI_ESCALATION_MODEL", "gemini-3.1-pro-preview")
MAX_RETRY_ROUNDS = 3


def _gemini_endpoint(model_name: str) -> str:
    """Return the correct Gemini API URL for the given model."""
    api_version = "v1alpha" if "3.1-pro" in model_name else "v1beta"
    return f"https://generativelanguage.googleapis.com/{api_version}/models/{model_name}:generateContent"

# ---------------------------------------------------------------------------
# Prompt examples — constructed from Pydantic models so schema drift
# causes an immediate import-time error.
# ---------------------------------------------------------------------------

PROMPT_STOCK_EXAMPLE = StockNode(
    id="s1", type="stock", name="Population", label="Population",
    equation="birth_rate - death_rate", initial_value="1000",
    position=Position(x=200, y=100),
)
PROMPT_FLOW_EXAMPLE = FlowNode(
    id="f1", type="flow", name="birth_rate", label="birth_rate",
    equation="Population * 0.03", position=Position(x=100, y=100),
)
PROMPT_AUX_EXAMPLE = AuxNode(
    id="a1", type="aux", name="growth_fraction", label="growth_fraction",
    equation="0.03", position=Position(x=200, y=250),
)
PROMPT_LOOKUP_EXAMPLE = LookupNode(
    id="lk1", type="lookup", name="effect_curve", label="effect_curve",
    equation="", points=[LookupPoint(x=0, y=0), LookupPoint(x=1, y=1)],
    position=Position(x=300, y=200),
)
PROMPT_CLOUD_EXAMPLE = CloudNode(
    id="c1", type="cloud", position=Position(x=50, y=100),
)
PROMPT_TEXT_EXAMPLE = TextNode(
    id="t1", type="text", text="Note here", position=Position(x=400, y=50),
)
PROMPT_INFLUENCE_EXAMPLE = InfluenceEdge(
    id="e1", type="influence", source="a1", target="f1",
)
PROMPT_FLOW_LINK_EXAMPLE = FlowLinkEdge(
    id="e2", type="flow_link", source="s1", target="f1",
)

# Compact JSON for prompt embedding (exclude None/unset optional fields)
def _example_json(obj) -> str:
    return json.dumps(obj.model_dump(exclude_none=True), indent=2)


# ---------------------------------------------------------------------------
# Allowed fields per node/edge type — derived from Pydantic schemas
# ---------------------------------------------------------------------------

_BASE_VARIABLE_FIELDS = {
    "id", "type", "name", "label", "equation", "units",
    "position", "style", "layout", "annotation", "source_id",
}

ALLOWED_FIELDS: dict[str, set[str]] = {
    "stock": _BASE_VARIABLE_FIELDS | {"initial_value", "min_value", "max_value", "non_negative"},
    "flow": _BASE_VARIABLE_FIELDS | {"source_stock_id", "target_stock_id", "min_value", "max_value", "non_negative"},
    "aux": _BASE_VARIABLE_FIELDS,
    "lookup": _BASE_VARIABLE_FIELDS | {"points", "interpolation"},
    "text": {"id", "type", "text", "position", "style", "layout", "annotation", "source_id"},
    "cloud": {"id", "type", "position"},
}

ALLOWED_EDGE_FIELDS: dict[str, set[str]] = {
    "influence": {"id", "type", "source", "target", "source_handle", "target_handle", "style", "layout", "source_id"},
    "flow_link": {"id", "type", "source", "target", "source_handle", "target_handle", "style", "layout"},
}

VARIABLE_NODE_TYPES = {"stock", "flow", "aux", "lookup"}
KNOWN_NODE_TYPES = {"stock", "flow", "aux", "lookup", "text", "cloud"}
KNOWN_EDGE_TYPES = {"influence", "flow_link"}

# ---------------------------------------------------------------------------
# AI Action types and validation
# ---------------------------------------------------------------------------

KNOWN_ACTION_TYPES = {
    "update_sim_config",
    "create_scenario", "update_scenario", "delete_scenario",
    "create_sensitivity_config", "update_sensitivity_config", "delete_sensitivity_config",
    "create_dashboard", "update_dashboard", "delete_dashboard",
    "add_dashboard_card", "delete_dashboard_card",
    "update_default_style",
    "run_simulate", "run_validate", "run_scenario_batch", "run_sensitivity",
    "navigate",
}

ACTION_REQUIRED_PARAMS: dict[str, set[str]] = {
    "create_scenario": {"name"},
    "update_scenario": {"scenario_name"},
    "delete_scenario": {"scenario_name"},
    "create_sensitivity_config": {"name", "type", "output", "metric"},
    "update_sensitivity_config": {"config_name"},
    "delete_sensitivity_config": {"config_name"},
    "create_dashboard": {"name"},
    "update_dashboard": {"dashboard_name"},
    "delete_dashboard": {"dashboard_name"},
    "add_dashboard_card": {"dashboard_name", "card"},
    "delete_dashboard_card": {"dashboard_name", "card_title"},
    "update_default_style": {"node_type", "style"},
    "navigate": {"page"},
}


def validate_actions(raw_actions: list[dict[str, Any]]) -> list[AIAction]:
    """Validate and parse raw action dicts from LLM output.

    Raises HTTPException on unknown types or missing required params.
    """
    parsed: list[AIAction] = []
    for raw in raw_actions:
        action_type = raw.get("type", "")
        if action_type not in KNOWN_ACTION_TYPES:
            raise HTTPException(
                status_code=422,
                detail={"ok": False, "errors": [{"code": "AI_UNKNOWN_ACTION", "message": f"Unknown action type: '{action_type}'", "severity": "error"}]},
            )
        params = raw.get("params", {})
        required = ACTION_REQUIRED_PARAMS.get(action_type, set())
        missing = required - set(params.keys())
        if missing:
            raise HTTPException(
                status_code=422,
                detail={"ok": False, "errors": [{"code": "AI_ACTION_MISSING_PARAMS", "message": f"Action '{action_type}' missing required params: {sorted(missing)}", "severity": "error"}]},
            )
        parsed.append(AIAction(type=action_type, params=params))
    return parsed


# ---------------------------------------------------------------------------
# Repair function
# ---------------------------------------------------------------------------

def repair_ai_model(raw: dict[str, Any]) -> dict[str, Any]:
    """Fix common LLM output issues before Pydantic validation.

    Applied to the raw dict that Gemini returns for the ``model`` key.
    Mutates and returns *raw* for convenience.
    """
    # Force version
    raw["version"] = 1

    # Strip unknown top-level fields (ModelDocument uses extra="forbid")
    _allowed_top = {"id", "name", "version", "metadata", "nodes", "edges", "outputs"}
    for k in list(raw):
        if k not in _allowed_top:
            del raw[k]

    # --- Nodes ---
    repaired_nodes: list[dict[str, Any]] = []
    for node in raw.get("nodes", []):
        ntype = node.get("type")
        if ntype not in KNOWN_NODE_TYPES:
            continue  # drop unknown types

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

        # Strip unknown fields for this node type
        allowed = ALLOWED_FIELDS.get(ntype, set())
        if allowed:
            keys_to_remove = [k for k in node if k not in allowed]
            for k in keys_to_remove:
                del node[k]

        repaired_nodes.append(node)

    raw["nodes"] = repaired_nodes

    # --- Edges ---
    repaired_edges: list[dict[str, Any]] = []
    for edge in raw.get("edges", []):
        etype = edge.get("type")
        if etype not in KNOWN_EDGE_TYPES:
            continue  # drop unknown edge types

        if "id" not in edge or not edge["id"]:
            edge["id"] = str(uuid.uuid4())

        # Strip unknown fields for this edge type
        allowed = ALLOWED_EDGE_FIELDS.get(etype, set())
        if allowed:
            keys_to_remove = [k for k in edge if k not in allowed]
            for k in keys_to_remove:
                del edge[k]

        repaired_edges.append(edge)

    raw["edges"] = repaired_edges

    # --- Metadata ---
    # Strip unknown fields from metadata sub-objects.  Gemini sometimes
    # mis-nests fields (e.g. puts ``imported`` inside ``analysis``).
    meta = raw.get("metadata")
    if isinstance(meta, dict):
        _allowed_metadata = {"description", "author", "created_at", "updated_at",
                             "analysis", "imported", "default_styles"}
        for k in list(meta):
            if k not in _allowed_metadata:
                del meta[k]

        analysis = meta.get("analysis")
        if isinstance(analysis, dict):
            _allowed_analysis = {"scenarios", "dashboards", "sensitivity_configs", "defaults"}
            for k in list(analysis):
                if k not in _allowed_analysis:
                    del analysis[k]

    # --- Outputs ---
    if not raw.get("outputs"):
        names = [
            n.get("name", "")
            for n in raw["nodes"]
            if n.get("type") in VARIABLE_NODE_TYPES and n.get("name")
        ]
        raw["outputs"] = names

    return raw


# ---------------------------------------------------------------------------
# JSON extraction
# ---------------------------------------------------------------------------

def _extract_json(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = re.sub(r"^```(?:json)?\s*", "", stripped, flags=re.IGNORECASE)
        stripped = re.sub(r"\s*```$", "", stripped)
    try:
        return json.loads(stripped)
    except json.JSONDecodeError:
        # fallback: use json.JSONDecoder to extract the first valid JSON object
        # This correctly handles nested braces, strings containing braces, etc.
        decoder = json.JSONDecoder()
        idx = stripped.find("{")
        if idx == -1:
            raise ValueError("No JSON object found in model output")
        obj, _ = decoder.raw_decode(stripped, idx)
        return obj


# ---------------------------------------------------------------------------
# Gemini helpers
# ---------------------------------------------------------------------------

def _gemini_key() -> str:
    key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not key:
        raise HTTPException(status_code=500, detail={"ok": False, "errors": [{"code": "AI_CONFIG_ERROR", "message": "Missing GEMINI_API_KEY/GOOGLE_API_KEY", "severity": "error"}]})
    return key


def _gemini_model() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-3-flash-preview")


PATCHABLE_FIELDS = {"equation", "initial_value", "units", "label", "name", "non_negative", "min_value", "max_value"}


def _system_instructions() -> str:
    return (
        "You are an SD-model editor engine. You MUST return ONLY JSON and no prose.\n"
        "\n"
        "Task: apply the user's command to the provided model JSON.\n"
        "\n"
        "Output format — choose from these shapes (can combine patches + actions):\n"
        "\n"
        "1. For PARAMETER-ONLY edits (changing equations, initial values, units, names, labels, constraints):\n"
        '   {"patches": [{"node_name": "<name>", "field": "<field>", "value": <new_value>}, ...], "message": "<brief summary>"}\n'
        "   Patchable fields: equation, initial_value, units, label, name, non_negative, min_value, max_value.\n"
        "   Use the node's NAME (not id) to identify it.\n"
        "\n"
        "2. For STRUCTURAL changes (adding/removing nodes or edges):\n"
        '   {"model": <full model document>, "message": "<brief summary>"}\n'
        "\n"
        "3. For ACTIONS (config changes, running simulations, navigation):\n"
        '   {"actions": [{"type": "<action_type>", "params": {...}}, ...], "message": "<brief summary>"}\n'
        "\n"
        "4. If you need clarification:\n"
        '   {"clarification": "<your question to the user>", "suggestions": ["option 1", "option 2", "option 3"]}\n'
        "   Include 2-4 concrete, short suggestions (under 60 chars each) the user can choose from.\n"
        "\n"
        "You CAN combine patches + actions in a single response:\n"
        '   {"patches": [...], "actions": [...], "message": "<summary>"}\n'
        "\n"
        "IMPORTANT: Use patches whenever possible — they are faster and safer.\n"
        "Only use the full model format when adding or removing nodes/edges.\n"
        "NEVER mix patches and model in the same response.\n"
        "NEVER mix model and actions in the same response.\n"
        "\n"
        "Available action types:\n"
        "  update_sim_config — params: {start?, stop?, dt?, return_step?}\n"
        "  create_scenario — params: {name, description?, color?, status?, overrides?}\n"
        "  update_scenario — params: {scenario_name, patch: {...}}\n"
        "  delete_scenario — params: {scenario_name}\n"
        "  create_sensitivity_config — params: {name, type, output, metric, parameters?, runs?, seed?}\n"
        "  update_sensitivity_config — params: {config_name, patch: {...}}\n"
        "  delete_sensitivity_config — params: {config_name}\n"
        "  create_dashboard — params: {name, cards?: [{type, title, variable}]}\n"
        "  update_dashboard — params: {dashboard_name, patch: {...}}\n"
        "  delete_dashboard — params: {dashboard_name}\n"
        "  add_dashboard_card — params: {dashboard_name, card: {type, title, variable}}\n"
        "  delete_dashboard_card — params: {dashboard_name, card_title}\n"
        "  update_default_style — params: {node_type, style: {fill?, stroke?, ...}}\n"
        "  run_simulate — runs current simulation\n"
        "  run_validate — validates model\n"
        "  run_scenario_batch — runs all scenarios\n"
        "  run_sensitivity — runs active sensitivity config\n"
        "  navigate — params: {page: 'canvas'|'formulas'|'dashboard'|'scenarios'|'sensitivity'}\n"
        "\n"
        "All entities are referenced by NAME (not id).\n"
        "\n"
        "IMPORTANT — JSON structure for nodes (used in full-model responses). Follow these examples EXACTLY:\n"
        "\n"
        f"Stock node (required fields: id, type, name, label, equation, initial_value, position):\n{_example_json(PROMPT_STOCK_EXAMPLE)}\n"
        "\n"
        f"Flow node (required: id, type, name, label, equation, position):\n{_example_json(PROMPT_FLOW_EXAMPLE)}\n"
        "\n"
        f"Aux node (required: id, type, name, label, equation, position):\n{_example_json(PROMPT_AUX_EXAMPLE)}\n"
        "\n"
        f"Lookup node (required: id, type, name, label, equation, position, points with >=2 sorted unique x):\n{_example_json(PROMPT_LOOKUP_EXAMPLE)}\n"
        "\n"
        f"Cloud node (only: id, type, position):\n{_example_json(PROMPT_CLOUD_EXAMPLE)}\n"
        "\n"
        f"Text node (only: id, type, text, position):\n{_example_json(PROMPT_TEXT_EXAMPLE)}\n"
        "\n"
        "Edge types:\n"
        f"  influence: {_example_json(PROMPT_INFLUENCE_EXAMPLE)}\n"
        f"  flow_link: {_example_json(PROMPT_FLOW_LINK_EXAMPLE)}\n"
        "\n"
        "Supported equation features:\n"
        "\n"
        "Built-in variable: TIME — current simulation time.\n"
        "\n"
        "Comparison operators: >, <, >=, <=, ==, != (return 1.0 for true, 0.0 for false).\n"
        "\n"
        "Math functions: min, max, abs, exp, log.\n"
        "\n"
        "Conditional: if_then_else(condition, true_value, false_value)\n"
        "  Example: if_then_else(Population > 1000, 0.01, 0.03)\n"
        "\n"
        "Time-input functions (use TIME implicitly):\n"
        "  step(height, step_time) — returns height when TIME >= step_time, else 0\n"
        "  ramp(slope, start_time, end_time) — linear ramp from start to end\n"
        "  pulse(height, start_time, width) — returns height during [start, start+width)\n"
        "  pulse_train(height, first_time, interval, last_time) — periodic pulses\n"
        "\n"
        "Delay functions:\n"
        "  delay1(input, delay_time) — first-order (exponential) delay\n"
        "  delay3(input, delay_time) — third-order (S-shaped) delay\n"
        "  delayn(input, delay_time, order) — Nth-order delay\n"
        "  smooth(input, delay_time) — alias for delay1 (exponential smoothing)\n"
        "  smooth3(input, delay_time) — alias for delay3 (third-order smoothing)\n"
        "  delay_fixed(input, delay_time, initial_value) — pipeline delay (exact time shift)\n"
        "Example: Construction = delay3(Desired_Construction, 2) delays the input by 2 time units.\n"
        "Example: effect = if_then_else(TIME > 10, step(100, 10), 0)\n"
        "\n"
        "CRITICAL rules:\n"
        '- position MUST be an object {"x": N, "y": N}, NEVER flat x/y on the node.\n'
        "- label is REQUIRED on stock/flow/aux/lookup (copy from name if unsure).\n"
        '- initial_value is REQUIRED on stocks (use "0" if unknown).\n'
        '- equation is REQUIRED on stock/flow/aux/lookup (use "" if unknown).\n'
        "- version must always be 1.\n"
        "- outputs is a list of variable names to track in simulation.\n"
        "- Do NOT include style, layout, or annotation unless the user explicitly asks.\n"
        "- text nodes are annotations — never appear in equations or outputs.\n"
        "- lookup nodes must include >=2 sorted unique x points.\n"
        "- equations refer to variable names, not ids.\n"
        "- preserve existing unrelated nodes/edges. Keep IDs stable.\n"
        "- flow_link edges MUST connect a stock↔flow or cloud↔flow. Never flow↔flow or stock↔stock.\n"
        "- influence edges MUST NOT target a stock. Stocks only change via flows.\n"
        "- every symbol used in an equation must exist as a variable name in the model.\n"
        "- if adding flow connections, use flow_link edges between stock and flow.\n"
        "- never return commentary outside the JSON structure.\n"
        "- when the user's request is ambiguous, ask a clarification question using the clarification format.\n"
    )


def _gemini_request_body(prompt: str, model: ModelDocument, history: list[AIChatMessage] | None = None, sim_config: dict[str, Any] | None = None) -> dict[str, Any]:
    contents: list[dict[str, Any]] = []

    # System instructions as first user message
    system_parts = [
        {"text": _system_instructions()},
        {"text": "Current model JSON:"},
        {"text": json.dumps(model.model_dump(), ensure_ascii=True)},
    ]

    if sim_config:
        system_parts.append({"text": f"Current simulation config: {json.dumps(sim_config, ensure_ascii=True)}"})

    if history:
        # Multi-turn: replay history
        # First message includes system instructions + first user message
        first_user_sent = False
        for msg in history:
            if msg.role == "user" and not first_user_sent:
                contents.append({
                    "role": "user",
                    "parts": system_parts + [{"text": f"User command:\n{msg.content}"}],
                })
                first_user_sent = True
            elif msg.role == "user":
                contents.append({
                    "role": "user",
                    "parts": [{"text": f"User command:\n{msg.content}"}],
                })
            elif msg.role == "assistant":
                contents.append({
                    "role": "model",
                    "parts": [{"text": msg.content}],
                })

        # Append current prompt as the latest user turn
        contents.append({
            "role": "user",
            "parts": [{"text": f"User command:\n{prompt}"}],
        })
    else:
        # Single-turn (backwards compatible)
        contents.append({
            "role": "user",
            "parts": system_parts + [{"text": f"User command:\n{prompt}"}],
        })

    return {
        "contents": contents,
        "generationConfig": {
            "temperature": 1.0,
            "responseMimeType": "application/json",
        },
    }


def _retry_request_body(prompt: str, model: ModelDocument, errors: str, history: list[AIChatMessage] | None = None) -> dict[str, Any]:
    """Build a retry request with validation errors in context."""
    base = _gemini_request_body(prompt, model, history)
    base["contents"].append({
        "role": "user",
        "parts": [{"text": (
            "Your previous response failed validation with these errors:\n"
            f"{errors}\n\n"
            "Please fix the JSON and return a corrected model. "
            "Remember: position must be {{\"x\": N, \"y\": N}}, "
            "label is required on variable nodes, "
            "initial_value is required on stocks, "
            "do NOT include extra fields, "
            "flow_link edges must connect stock↔flow or cloud↔flow (never flow↔flow), "
            "influence edges must NOT target a stock, "
            "and every symbol in an equation must be a defined variable name."
        )}],
    })
    return base


def _call_gemini(prompt: str, model: ModelDocument, history: list[AIChatMessage] | None = None, sim_config: dict[str, Any] | None = None) -> dict[str, Any]:
    key = _gemini_key()
    gemini_model = _gemini_model()
    url = _gemini_endpoint(gemini_model)
    params = {"key": key}
    payload = _gemini_request_body(prompt, model, history, sim_config)
    return _send_gemini_request(url, params, payload)


def _call_gemini_retry(prompt: str, model: ModelDocument, errors: str, history: list[AIChatMessage] | None = None, model_name: str | None = None) -> dict[str, Any]:
    key = _gemini_key()
    name = model_name or _gemini_model()
    url = _gemini_endpoint(name)
    params = {"key": key}
    payload = _retry_request_body(prompt, model, errors, history)
    return _send_gemini_request(url, params, payload)


def _send_gemini_request(url: str, params: dict, payload: dict) -> dict[str, Any]:
    try:
        with httpx.Client(timeout=120.0) as client:
            res = client.post(url, params=params, json=payload)
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"ok": False, "errors": [{"code": "AI_UPSTREAM_ERROR", "message": f"Gemini call failed: {exc}", "severity": "error"}]}) from exc
    if res.status_code >= 400:
        raise HTTPException(status_code=502, detail={"ok": False, "errors": [{"code": "AI_UPSTREAM_ERROR", "message": f"Gemini returned {res.status_code}: {res.text}", "severity": "error"}]})
    body = res.json()
    try:
        text = body["candidates"][0]["content"]["parts"][0]["text"]
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"ok": False, "errors": [{"code": "AI_BAD_RESPONSE", "message": f"Could not parse Gemini response envelope: {exc}", "severity": "error"}]}) from exc
    try:
        return _extract_json(text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"ok": False, "errors": [{"code": "AI_BAD_RESPONSE", "message": f"Gemini did not return valid JSON: {exc}", "severity": "error"}]}) from exc


# ---------------------------------------------------------------------------
# Validate with repair
# ---------------------------------------------------------------------------

def _try_validate(raw_model: dict[str, Any]) -> tuple[ModelDocument | None, str | None]:
    """Repair and validate. Returns (model, None) on success or (None, errors_str) on failure."""
    repaired = repair_ai_model(raw_model)
    try:
        doc = ModelDocument.model_validate(repaired)
    except ValidationError as exc:
        return None, str(exc)
    return doc, None


def _validate_full(raw_model: dict[str, Any]) -> tuple[ModelDocument | None, list[str]]:
    """Repair → schema validate → semantic validate.

    Returns (model, []) on success or (None, error_strings) on failure.
    """
    doc, schema_err = _try_validate(raw_model)
    if doc is None:
        return None, [schema_err or "Schema validation failed"]

    validation = validate_model(doc)
    if not validation.ok:
        error_msgs = [e.message for e in validation.errors]
        return None, error_msgs

    return doc, []


# ---------------------------------------------------------------------------
# Patch application
# ---------------------------------------------------------------------------

def apply_patches(model: ModelDocument, raw_patches: list[dict[str, Any]]) -> tuple[ModelDocument, list[AIPatch]]:
    """Apply lightweight patches to a model.

    Returns (updated_model, parsed_patches).
    Raises HTTPException on invalid patch targets or fields.
    """
    # Build name → index lookup
    name_to_idx: dict[str, int] = {}
    for i, node in enumerate(model.nodes):
        if hasattr(node, "name"):
            name_to_idx[node.name] = i

    parsed_patches: list[AIPatch] = []
    model_dict = model.model_dump()
    nodes = model_dict["nodes"]

    for raw in raw_patches:
        node_name = raw.get("node_name", "")
        field = raw.get("field", "")
        value = raw.get("value")

        if node_name not in name_to_idx:
            raise HTTPException(
                status_code=422,
                detail={"ok": False, "errors": [{"code": "AI_PATCH_BAD_TARGET", "message": f"No node named '{node_name}' in model", "severity": "error"}]},
            )
        if field not in PATCHABLE_FIELDS:
            raise HTTPException(
                status_code=422,
                detail={"ok": False, "errors": [{"code": "AI_PATCH_BAD_FIELD", "message": f"Field '{field}' is not patchable. Allowed: {sorted(PATCHABLE_FIELDS)}", "severity": "error"}]},
            )

        idx = name_to_idx[node_name]
        nodes[idx][field] = value
        parsed_patches.append(AIPatch(node_name=node_name, field=field, value=value))

    # Re-validate the full model
    try:
        updated = ModelDocument.model_validate(model_dict)
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail={"ok": False, "errors": [{"code": "AI_PATCH_VALIDATION", "message": f"Patched model failed validation: {exc}", "severity": "error"}]},
        ) from exc

    return updated, parsed_patches


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def execute_ai_command(prompt: str, model: ModelDocument, history: list[AIChatMessage] | None = None, sim_config: dict[str, Any] | None = None) -> tuple[ModelDocument | None, list[AIPatch], list[AIAction], list, str, bool, list[str], list[RetryLogEntry]]:
    """Execute an AI command.

    Returns (updated_model_or_None, patches, actions, warnings, assistant_message, needs_clarification, suggestions, retry_log).
    """
    if not prompt.strip():
        raise HTTPException(status_code=400, detail={"ok": False, "errors": [{"code": "AI_PROMPT_REQUIRED", "message": "Prompt is required", "severity": "error"}]})
    result = _call_gemini(prompt.strip(), model, history, sim_config)

    # Check if the AI is asking for clarification
    if "clarification" in result and "model" not in result and "patches" not in result:
        raw_suggestions = result.get("suggestions", [])
        if not isinstance(raw_suggestions, list):
            raw_suggestions = []
        suggestions = [str(s) for s in raw_suggestions[:6]]
        return None, [], [], [], str(result["clarification"]), True, suggestions, []

    # --- Extract and validate actions (can appear alongside patches) ---
    actions: list[AIAction] = []
    if "actions" in result and result["actions"]:
        actions = validate_actions(result["actions"])

    # --- Patch mode (may also have actions) ---
    if "patches" in result and result["patches"]:
        updated_model, parsed_patches = apply_patches(model, result["patches"])
        validation = validate_model(updated_model)
        if not validation.ok:
            raise HTTPException(
                status_code=422,
                detail={
                    "ok": False,
                    "errors": [e.model_dump() for e in validation.errors],
                    "warnings": [w.model_dump() for w in validation.warnings],
                },
            )
        message = str(result.get("message", "Parameters updated successfully."))
        return updated_model, parsed_patches, actions, validation.warnings, message, False, [], []

    # --- Actions only (no model or patches) ---
    if actions and "model" not in result:
        message = str(result.get("message", "Actions queued."))
        return None, [], actions, [], message, False, [], []

    # --- Full model mode ---
    if "model" not in result:
        raise HTTPException(status_code=502, detail={"ok": False, "errors": [{"code": "AI_BAD_RESPONSE", "message": "Missing 'model', 'patches', or 'actions' in Gemini JSON output", "severity": "error"}]})

    # Multi-round validate → retry loop with model escalation
    retry_log: list[RetryLogEntry] = []
    fast_model = _gemini_model()
    current_raw = result["model"]

    for round_num in range(1, MAX_RETRY_ROUNDS + 1):
        updated_model, error_list = _validate_full(current_raw)

        if updated_model is not None:
            # Success
            if retry_log:
                retry_log.append(RetryLogEntry(
                    round=round_num, errors=[], action="success",
                    model_used=fast_model if round_num < MAX_RETRY_ROUNDS else GEMINI_ESCALATION_MODEL,
                ))
            validation = validate_model(updated_model)
            message = str(result.get("message", "Model updated successfully."))
            return updated_model, [], actions, validation.warnings, message, False, [], retry_log

        # Validation failed — log and decide whether to retry or escalate
        is_last_round = round_num == MAX_RETRY_ROUNDS
        if is_last_round:
            retry_log.append(RetryLogEntry(
                round=round_num, errors=error_list, action="gave_up",
                model_used=GEMINI_ESCALATION_MODEL,
            ))
            break

        # Decide model for next round
        errors_str = "\n".join(error_list)
        if round_num < MAX_RETRY_ROUNDS - 1:
            # Retry with fast model
            retry_log.append(RetryLogEntry(
                round=round_num, errors=error_list, action="retrying",
                model_used=fast_model,
            ))
            retry_result = _call_gemini_retry(prompt.strip(), model, errors_str, history)
        else:
            # Escalate to stronger model for next round
            retry_log.append(RetryLogEntry(
                round=round_num, errors=error_list, action="escalated",
                model_used=fast_model,
            ))
            retry_result = _call_gemini_retry(prompt.strip(), model, errors_str, history, model_name=GEMINI_ESCALATION_MODEL)

        if "model" in retry_result:
            current_raw = retry_result["model"]
        else:
            # Retry didn't return a model — give up
            retry_log.append(RetryLogEntry(
                round=round_num + 1, errors=["Retry did not return a model"], action="gave_up",
                model_used=GEMINI_ESCALATION_MODEL if round_num >= MAX_RETRY_ROUNDS - 1 else fast_model,
            ))
            break

    # All rounds exhausted
    raise HTTPException(
        status_code=422,
        detail={
            "ok": False,
            "errors": [{"code": "AI_VALIDATION_FAILED", "message": f"AI output failed validation after {len(retry_log)} rounds: {error_list}", "severity": "error"}],
            "retry_log": [entry.model_dump() for entry in retry_log],
        },
    )


# ---------------------------------------------------------------------------
# SSE streaming variant
# ---------------------------------------------------------------------------

async def execute_ai_command_stream(
    prompt: str,
    model: ModelDocument,
    history: list[AIChatMessage] | None = None,
    sim_config: dict[str, Any] | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """Streaming version of execute_ai_command that yields SSE event dicts."""
    if not prompt.strip():
        yield {"event": "error", "data": {"message": "Prompt is required"}}
        return

    yield {"event": "status", "data": {"message": "Calling AI..."}}

    try:
        result = _call_gemini(prompt.strip(), model, history, sim_config)
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
        yield {"event": "error", "data": detail}
        return

    # Check if the AI is asking for clarification
    if "clarification" in result and "model" not in result and "patches" not in result:
        raw_suggestions = result.get("suggestions", [])
        if not isinstance(raw_suggestions, list):
            raw_suggestions = []
        suggestions = [str(s) for s in raw_suggestions[:6]]
        from app.schemas.ai import AIExecuteResponse
        yield {"event": "complete", "data": AIExecuteResponse(
            ok=True, model=None, patches=[], actions=[], warnings=[],
            assistant_message=str(result["clarification"]),
            needs_clarification=True, suggestions=suggestions, retry_log=[],
        ).model_dump()}
        return

    # --- Extract and validate actions ---
    actions: list[AIAction] = []
    if "actions" in result and result["actions"]:
        try:
            actions = validate_actions(result["actions"])
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
            yield {"event": "error", "data": detail}
            return

    # --- Patch mode ---
    if "patches" in result and result["patches"]:
        yield {"event": "status", "data": {"message": "Applying patches..."}}
        try:
            updated_model, parsed_patches = apply_patches(model, result["patches"])
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
            yield {"event": "error", "data": detail}
            return
        validation = validate_model(updated_model)
        if not validation.ok:
            yield {"event": "error", "data": {
                "ok": False,
                "errors": [e.model_dump() for e in validation.errors],
                "warnings": [w.model_dump() for w in validation.warnings],
            }}
            return
        message = str(result.get("message", "Parameters updated successfully."))
        from app.schemas.ai import AIExecuteResponse
        yield {"event": "complete", "data": AIExecuteResponse(
            ok=True, model=updated_model, patches=parsed_patches, actions=actions,
            warnings=validation.warnings, assistant_message=message,
            needs_clarification=False, suggestions=[], retry_log=[],
        ).model_dump()}
        return

    # --- Actions only ---
    if actions and "model" not in result:
        message = str(result.get("message", "Actions queued."))
        from app.schemas.ai import AIExecuteResponse
        yield {"event": "complete", "data": AIExecuteResponse(
            ok=True, model=None, patches=[], actions=actions, warnings=[],
            assistant_message=message, needs_clarification=False, suggestions=[], retry_log=[],
        ).model_dump()}
        return

    # --- Full model mode ---
    if "model" not in result:
        yield {"event": "error", "data": {"ok": False, "errors": [{"code": "AI_BAD_RESPONSE", "message": "Missing 'model', 'patches', or 'actions' in Gemini JSON output", "severity": "error"}]}}
        return

    yield {"event": "status", "data": {"message": "Validating response..."}}

    retry_log: list[RetryLogEntry] = []
    fast_model = _gemini_model()
    current_raw = result["model"]

    for round_num in range(1, MAX_RETRY_ROUNDS + 1):
        updated_model, error_list = _validate_full(current_raw)

        if updated_model is not None:
            if retry_log:
                retry_log.append(RetryLogEntry(
                    round=round_num, errors=[], action="success",
                    model_used=fast_model if round_num < MAX_RETRY_ROUNDS else GEMINI_ESCALATION_MODEL,
                ))
            validation = validate_model(updated_model)
            message = str(result.get("message", "Model updated successfully."))
            from app.schemas.ai import AIExecuteResponse
            yield {"event": "complete", "data": AIExecuteResponse(
                ok=True, model=updated_model, patches=[], actions=actions,
                warnings=validation.warnings, assistant_message=message,
                needs_clarification=False, suggestions=[], retry_log=retry_log,
            ).model_dump()}
            return

        is_last_round = round_num == MAX_RETRY_ROUNDS
        if is_last_round:
            retry_log.append(RetryLogEntry(
                round=round_num, errors=error_list, action="gave_up",
                model_used=GEMINI_ESCALATION_MODEL,
            ))
            break

        errors_str = "\n".join(error_list)
        if round_num < MAX_RETRY_ROUNDS - 1:
            yield {"event": "status", "data": {"message": f"Validation failed, retrying (round {round_num + 1}/{MAX_RETRY_ROUNDS})..."}}
            retry_log.append(RetryLogEntry(
                round=round_num, errors=error_list, action="retrying",
                model_used=fast_model,
            ))
            try:
                retry_result = _call_gemini_retry(prompt.strip(), model, errors_str, history)
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
                yield {"event": "error", "data": detail}
                return
        else:
            yield {"event": "status", "data": {"message": f"Escalating to {GEMINI_ESCALATION_MODEL}..."}}
            retry_log.append(RetryLogEntry(
                round=round_num, errors=error_list, action="escalated",
                model_used=fast_model,
            ))
            try:
                retry_result = _call_gemini_retry(prompt.strip(), model, errors_str, history, model_name=GEMINI_ESCALATION_MODEL)
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
                yield {"event": "error", "data": detail}
                return

        if "model" in retry_result:
            current_raw = retry_result["model"]
        else:
            retry_log.append(RetryLogEntry(
                round=round_num + 1, errors=["Retry did not return a model"], action="gave_up",
                model_used=GEMINI_ESCALATION_MODEL if round_num >= MAX_RETRY_ROUNDS - 1 else fast_model,
            ))
            break

    yield {"event": "error", "data": {
        "ok": False,
        "errors": [{"code": "AI_VALIDATION_FAILED", "message": f"AI output failed validation after {len(retry_log)} rounds: {error_list}", "severity": "error"}],
        "retry_log": [entry.model_dump() for entry in retry_log],
    }}
