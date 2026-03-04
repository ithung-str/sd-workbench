from __future__ import annotations

import asyncio
import json
import logging
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
    "dimensions", "equation_overrides",
}

ALLOWED_FIELDS: dict[str, set[str]] = {
    "stock": _BASE_VARIABLE_FIELDS | {"initial_value", "min_value", "max_value", "non_negative", "longitude", "latitude"},
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
        # Also handles concatenated duplicate JSON (e.g. from SSE streaming issues).
        decoder = json.JSONDecoder()
        idx = stripped.find("{")
        if idx == -1:
            raise ValueError("No JSON object found in model output")
        obj, end = decoder.raw_decode(stripped, idx)
        trailing = stripped[end:].strip()
        if trailing:
            _log.warning("Extracted JSON with %d trailing chars (ignored): %.200s…", len(trailing), trailing)
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


PATCHABLE_FIELDS = {"equation", "initial_value", "units", "label", "name", "non_negative", "min_value", "max_value", "longitude", "latitude", "dimensions", "equation_overrides"}


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
        "   Patchable fields: equation, initial_value, units, label, name, non_negative, min_value, max_value, longitude, latitude, dimensions, equation_overrides.\n"
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
        "    Simulation card types: kpi, line, table, sparkline, comparison, heatmap, map\n"
        "    Data table card types: data_bar, data_stacked_bar, data_area, data_pie, data_table, data_pivot\n"
        "    For data cards, use: {type, title, variable: '', data_table_id, x_column?, y_columns?, group_column?, value_column?, aggregate_fn?}\n"
        "  delete_dashboard_card — params: {dashboard_name, card_title}\n"
        "  update_default_style — params: {node_type, style: {fill?, stroke?, ...}}\n"
        "  run_simulate — runs current simulation\n"
        "  run_validate — validates model\n"
        "  run_scenario_batch — runs all scenarios\n"
        "  run_sensitivity — runs active sensitivity config\n"
        "  navigate — params: {page: 'canvas'|'formulas'|'dashboard'|'scenarios'|'sensitivity'}\n"
        "\n"
        "--- Scenarios vs Sensitivity Analysis ---\n"
        "\n"
        "SCENARIOS are discrete 'what if' comparisons. Each scenario overrides specific\n"
        "parameters to fixed values, representing a distinct policy or assumption.\n"
        "Use scenarios when the spec describes named alternatives, e.g. 'free trade vs protectionism',\n"
        "'optimistic vs pessimistic', or 'immediate vs gradual implementation'.\n"
        "\n"
        "Example create_scenario action:\n"
        '  {"type": "create_scenario", "params": {\n'
        '    "name": "High Tariff",\n'
        '    "description": "50% tariff on imports",\n'
        '    "overrides": {"params": {"tariff_rate": 0.5, "import_quota": 1000}}\n'
        "  }}\n"
        "\n"
        "SENSITIVITY ANALYSIS systematically sweeps a parameter across a continuous range\n"
        "to see how it affects an output variable. Use sensitivity when the spec says\n"
        "'vary X from A to B', 'test range A–B', or 'explore the effect of X'.\n"
        "\n"
        "Example create_sensitivity_config action:\n"
        '  {"type": "create_sensitivity_config", "params": {\n'
        '    "name": "Tariff Rate Sensitivity",\n'
        '    "type": "oat",\n'
        '    "output": "gdp",\n'
        '    "metric": "final",\n'
        '    "parameters": [{"name": "tariff_rate", "low": 0.0, "high": 1.0, "steps": 5}]\n'
        "  }}\n"
        "\n"
        "Interpretation rules:\n"
        "- 'Vary X: A–B' or 'range A to B' → sensitivity with low=A, high=B\n"
        "- 'Test A vs B' or named alternatives → scenarios with discrete overrides\n"
        "- Default sensitivity type: 'oat' (one-at-a-time), default metric: 'final', default steps: 5\n"
        "- Pick the most relevant stock as the sensitivity 'output' variable\n"
        "- Each sensitivity parameter needs: name, low, high, steps\n"
        "- Each scenario needs: name and overrides.params dict mapping variable names to values\n"
        "\n"
        "--- When to ask for clarification ---\n"
        "\n"
        "Use the clarification response format when the user's request is ambiguous.\n"
        "Ask BEFORE guessing — especially for scenarios and sensitivity analysis:\n"
        "- Scenarios requested but no concrete parameter values given → ask which variables to override and what values\n"
        "- Sensitivity requested but no range/output specified → ask which parameter to sweep and over what range\n"
        "- Unclear whether the user wants scenarios vs sensitivity → ask with examples of each\n"
        "- Vague instructions like 'test different values' or 'explore the model' → ask what specifically to explore\n"
        "- Missing info like which output variable to track → suggest the most relevant stocks and ask\n"
        "Keep clarification questions short and always include 2-4 concrete suggestions the user can pick from.\n"
        "\n"
        "All entities are referenced by NAME (not id).\n"
        "\n"
        "IMPORTANT — JSON structure for nodes (used in full-model responses). Follow these examples EXACTLY:\n"
        "\n"
        f"Stock node (required fields: id, type, name, label, equation, initial_value, position; optional: longitude, latitude for geographic visualization):\n{_example_json(PROMPT_STOCK_EXAMPLE)}\n"
        "\n"
        "Dimensions: Define dimensions on the model document, then reference them on nodes.\n"
        "  Model-level: {\"dimensions\": [{\"id\": \"dim_1\", \"name\": \"Region\", \"elements\": [\"North\", \"South\"]}]}\n"
        "  Node-level: {\"dimensions\": [\"Region\"]} on any stock/aux/flow/lookup node.\n"
        "  Per-element overrides: {\"equation_overrides\": {\"North\": \"custom_equation\"}}\n"
        "  Subscript access in equations: Population[North] references a specific element.\n"
        "  Aggregate functions: SUM(variable), MEAN(variable) — sum/average across all elements.\n"
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
        "Math functions: min, max, abs, exp, log, sin, cos.\n"
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
        "\n"
        "When building a COMPLETE model from a specification or description:\n"
        "1. Return a full model JSON with ALL nodes, edges, and outputs.\n"
        "2. Include actions to set simulation config: update_sim_config with start, stop, dt from the spec.\n"
        "3. Layout nodes in a readable grid pattern:\n"
        "   - Place stocks in a horizontal row with ~250px x-spacing, starting at y=100.\n"
        "   - Place each flow between its source and target stock (or between a cloud and a stock).\n"
        "   - For each stock-flow chain: Cloud(x,y) → Flow(x+200,y) → Stock(x+400,y) → Flow(x+600,y) → Cloud(x+800,y)\n"
        "   - Place aux/parameter nodes in rows below (y+200, y+350) aligned to the flows they influence.\n"
        "   - Place lookup nodes at y+300, spaced across.\n"
        "   - Use x-spacing of ~200px between nodes in the same row.\n"
        "4. Always create flow_link edges connecting stocks↔flows and clouds↔flows.\n"
        "5. Always create influence edges from every aux/parameter to the flows whose equations reference them.\n"
        "6. Set outputs to include ALL stock and flow variable names.\n"
        "7. If the spec defines scenarios, also emit create_scenario actions with parameter overrides.\n"
        "8. If the spec defines sensitivity ranges, also emit create_sensitivity_config actions.\n"
        "9. After building the model, emit a run_simulate action so results appear immediately.\n"
        "10. Do NOT invent additional variables beyond what the spec defines.\n"
    )


def _preprocess_spec_prompt(prompt: str) -> str:
    """Detect spec-style prompts and append structured extraction hints.

    If the prompt contains markdown tables with Stock/Flow/Parameter headers,
    extract a structured summary to reduce ambiguity for the LLM.
    """
    # Quick heuristic: does this look like a spec?
    lower = prompt.lower()
    has_stocks_table = "| stock" in lower or "## stocks" in lower or "## key stocks" in lower
    has_flows_table = "| flow" in lower or "## flows" in lower
    has_sim_period = "simulation period" in lower or "time step" in lower

    if not (has_stocks_table or has_flows_table):
        return prompt

    hints: list[str] = []
    hints.append("\n\n--- STRUCTURED EXTRACTION HINTS ---")
    hints.append("This prompt contains a model specification. Follow these rules strictly:")
    hints.append("- Create EXACTLY the stocks, flows, and parameters listed in the tables.")
    hints.append("- Use the variable names from the tables (snake_case, no spaces).")
    hints.append("- Use the initial values from the tables for stock initial_value fields.")
    hints.append("- Use the equations from the tables for flow/aux equation fields.")
    hints.append("- If a parameter has a constant value, create it as an aux node with that constant as its equation.")
    hints.append("- Connect every flow to its source/target stock via flow_link edges.")
    hints.append("- Add cloud nodes at chain endpoints (flows without a second stock connection).")
    hints.append("- Create influence edges from every variable referenced in an equation to the node using it.")

    if has_sim_period:
        hints.append("- Extract simulation period and time step from the metadata and emit an update_sim_config action.")

    if "## sensitivity" in lower or "sensitivity analysis" in lower:
        hints.append("- SENSITIVITY ANALYSIS: Parse lines like 'Vary X: A–B' or 'X range: A to B'.")
        hints.append("  For each parameter range, emit a create_sensitivity_config action with:")
        hints.append('  {"type": "create_sensitivity_config", "params": {')
        hints.append('    "name": "<descriptive name>",')
        hints.append('    "type": "oat",')
        hints.append('    "output": "<most relevant stock variable name>",')
        hints.append('    "metric": "final",')
        hints.append('    "parameters": [{"name": "<var_name>", "low": <A>, "high": <B>, "steps": 5}]')
        hints.append("  }}")
        hints.append("  You can group related parameters into one config or create separate configs.")

    if "## scenario" in lower or "scenario" in lower:
        hints.append("- SCENARIOS: Look for named alternatives like 'Free Trade vs Protectionism'.")
        hints.append("  For each distinct alternative, emit a create_scenario action with:")
        hints.append('  {"type": "create_scenario", "params": {')
        hints.append('    "name": "<scenario name>",')
        hints.append('    "description": "<brief description>",')
        hints.append('    "overrides": {"params": {"<var_name>": <value>, ...}}')
        hints.append("  }}")
        hints.append("  Map qualitative descriptions to concrete parameter values.")
        hints.append("  'Immediate' → step changes at time 0; 'Gradual' → ramp or later step times.")

    if "## lookup" in lower or "lookup table" in lower:
        hints.append("- Create lookup nodes with the (x, y) points from the spec tables.")

    hints.append("- Emit a run_simulate action at the end.")
    hints.append("--- END HINTS ---")

    return prompt + "\n".join(hints)


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
    _log.debug("Gemini response (%d chars):\n%s", len(text), text)
    try:
        return _extract_json(text)
    except Exception as exc:
        raise HTTPException(status_code=502, detail={"ok": False, "errors": [{"code": "AI_BAD_RESPONSE", "message": f"Gemini did not return valid JSON: {exc}", "severity": "error"}]}) from exc


# ---------------------------------------------------------------------------
# Async streaming Gemini helpers
# ---------------------------------------------------------------------------

_log = logging.getLogger(__name__)


def _gemini_stream_endpoint(model_name: str) -> str:
    """Return the Gemini streaming API URL for the given model."""
    api_version = "v1alpha" if "3.1-pro" in model_name else "v1beta"
    return f"https://generativelanguage.googleapis.com/{api_version}/models/{model_name}:streamGenerateContent"


async def _send_gemini_request_stream(
    url: str,
    params: dict,
    payload: dict,
    on_progress: asyncio.Queue | None = None,
) -> tuple[dict[str, Any], str]:
    """Stream response from Gemini SSE endpoint, concatenating text chunks.

    Uses per-chunk read timeout (30s) instead of a total timeout, so large
    responses that arrive in chunks won't time out.
    Pushes character-count progress messages to *on_progress* queue if given.

    Returns (parsed_json, raw_text) so callers can access the raw response.
    """
    timeout = httpx.Timeout(connect=30.0, read=60.0, write=30.0, pool=30.0)
    full_text = ""
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            # alt=sse tells Gemini to stream server-sent events
            stream_params = {**params, "alt": "sse"}
            async with client.stream("POST", url, params=stream_params, json=payload) as response:
                if response.status_code >= 400:
                    body = await response.aread()
                    raise HTTPException(
                        status_code=502,
                        detail={"ok": False, "errors": [{"code": "AI_UPSTREAM_ERROR", "message": f"Gemini returned {response.status_code}: {body.decode(errors='replace')}", "severity": "error"}]},
                    )
                async for line in response.aiter_lines():
                    # SSE format: "data: {json}" lines
                    if not line.startswith("data: "):
                        continue
                    chunk_json = line[6:]  # strip "data: " prefix
                    try:
                        chunk = json.loads(chunk_json)
                    except json.JSONDecodeError:
                        _log.debug("Skipping non-JSON SSE chunk: %s", chunk_json[:200])
                        continue
                    # Extract text from chunk
                    try:
                        text_part = chunk["candidates"][0]["content"]["parts"][0]["text"]
                        full_text += text_part
                        if on_progress is not None:
                            await on_progress.put(text_part)
                    except (KeyError, IndexError):
                        # Non-text chunk (e.g. usage metadata), skip
                        pass
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"ok": False, "errors": [{"code": "AI_UPSTREAM_ERROR", "message": f"Gemini streaming call failed: {exc}", "severity": "error"}]},
        ) from exc

    if not full_text:
        raise HTTPException(
            status_code=502,
            detail={"ok": False, "errors": [{"code": "AI_BAD_RESPONSE", "message": "Gemini streaming returned no text", "severity": "error"}]},
        )

    _log.debug("Gemini streamed response (%d chars):\n%s", len(full_text), full_text)

    try:
        return _extract_json(full_text), full_text
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail={"ok": False, "errors": [{"code": "AI_BAD_RESPONSE", "message": f"Gemini did not return valid JSON: {exc}", "severity": "error"}], "debug_raw_response": full_text},
        ) from exc


async def _call_gemini_stream(
    prompt: str,
    model: ModelDocument,
    history: list[AIChatMessage] | None = None,
    sim_config: dict[str, Any] | None = None,
    on_progress: asyncio.Queue | None = None,
) -> tuple[dict[str, Any], str]:
    key = _gemini_key()
    gemini_model = _gemini_model()
    url = _gemini_stream_endpoint(gemini_model)
    params = {"key": key}
    payload = _gemini_request_body(prompt, model, history, sim_config)
    # Remove responseMimeType for streaming — it conflicts with SSE and causes
    # Gemini to emit the full JSON in every SSE event, resulting in duplicated
    # concatenated output.  The system prompt already instructs JSON output.
    if "generationConfig" in payload:
        payload["generationConfig"].pop("responseMimeType", None)
    return await _send_gemini_request_stream(url, params, payload, on_progress)


async def _call_gemini_retry_stream(
    prompt: str,
    model: ModelDocument,
    errors: str,
    history: list[AIChatMessage] | None = None,
    model_name: str | None = None,
    on_progress: asyncio.Queue | None = None,
) -> tuple[dict[str, Any], str]:
    key = _gemini_key()
    name = model_name or _gemini_model()
    url = _gemini_stream_endpoint(name)
    params = {"key": key}
    payload = _retry_request_body(prompt, model, errors, history)
    # Remove responseMimeType for streaming (same reason as _call_gemini_stream)
    if "generationConfig" in payload:
        payload["generationConfig"].pop("responseMimeType", None)
    return await _send_gemini_request_stream(url, params, payload, on_progress)


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
    processed_prompt = _preprocess_spec_prompt(prompt.strip())
    result = _call_gemini(processed_prompt, model, history, sim_config)

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

async def _stream_gemini_with_progress(
    coro_factory,
    progress_queue: asyncio.Queue,
    result_future: asyncio.Future,
):
    """Run a Gemini streaming coroutine and resolve its result into a Future."""
    try:
        result = await coro_factory(progress_queue)
        result_future.set_result(result)
    except Exception as exc:
        result_future.set_exception(exc)


async def execute_ai_command_stream(
    prompt: str,
    model: ModelDocument,
    history: list[AIChatMessage] | None = None,
    sim_config: dict[str, Any] | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """Streaming version of execute_ai_command that yields SSE event dicts.

    Uses true Gemini streaming (streamGenerateContent with SSE) to avoid
    timeouts on large specs. Yields progress events as chunks arrive.
    """
    if not prompt.strip():
        yield {"event": "error", "data": {"message": "Prompt is required"}}
        return

    yield {"event": "status", "data": {"message": "Calling AI..."}}
    processed_prompt = _preprocess_spec_prompt(prompt.strip())

    # --- Stream the initial Gemini call with progress updates ---
    progress_queue: asyncio.Queue[str] = asyncio.Queue()
    result_future: asyncio.Future[tuple[dict[str, Any], str]] = asyncio.get_event_loop().create_future()

    async def _initial_call(q):
        return await _call_gemini_stream(processed_prompt, model, history, sim_config, on_progress=q)

    task = asyncio.create_task(
        _stream_gemini_with_progress(_initial_call, progress_queue, result_future)
    )

    # Yield progress + debug_chunk events while waiting for the result
    streamed_chars = 0
    while not result_future.done():
        try:
            text_chunk = await asyncio.wait_for(progress_queue.get(), timeout=5.0)
            streamed_chars += len(text_chunk)
            yield {"event": "debug_chunk", "data": {"text": text_chunk, "total_chars": streamed_chars}}
            yield {"event": "status", "data": {"message": f"Receiving AI response... ({streamed_chars} chars)"}}
        except asyncio.TimeoutError:
            # Keepalive — no new chunks for 5s
            if not result_future.done():
                msg = f"Waiting for AI response... ({streamed_chars} chars received)" if streamed_chars else "Waiting for AI response..."
                yield {"event": "status", "data": {"message": msg}}

    # Drain any remaining chunks
    while not progress_queue.empty():
        try:
            text_chunk = progress_queue.get_nowait()
            streamed_chars += len(text_chunk)
            yield {"event": "debug_chunk", "data": {"text": text_chunk, "total_chars": streamed_chars}}
        except asyncio.QueueEmpty:
            break

    # Get the result (tuple of parsed JSON + raw text)
    try:
        result, raw_response_text = result_future.result()
    except HTTPException as exc:
        detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
        yield {"event": "error", "data": detail}
        return
    except Exception as exc:
        yield {"event": "error", "data": {"message": f"AI call failed: {exc}"}}
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
            debug_raw_response=raw_response_text,
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
            debug_raw_response=raw_response_text,
        ).model_dump()}
        return

    # --- Actions only ---
    if actions and "model" not in result:
        message = str(result.get("message", "Actions queued."))
        from app.schemas.ai import AIExecuteResponse
        yield {"event": "complete", "data": AIExecuteResponse(
            ok=True, model=None, patches=[], actions=actions, warnings=[],
            assistant_message=message, needs_clarification=False, suggestions=[], retry_log=[],
            debug_raw_response=raw_response_text,
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
                debug_raw_response=raw_response_text,
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
            # Stream retry call with progress
            retry_progress: asyncio.Queue[str] = asyncio.Queue()
            retry_future: asyncio.Future[tuple[dict[str, Any], str]] = asyncio.get_event_loop().create_future()

            async def _retry_call(q, _es=errors_str):
                return await _call_gemini_retry_stream(prompt.strip(), model, _es, history, on_progress=q)

            asyncio.create_task(
                _stream_gemini_with_progress(_retry_call, retry_progress, retry_future)
            )
            retry_chars = 0
            while not retry_future.done():
                try:
                    chunk = await asyncio.wait_for(retry_progress.get(), timeout=5.0)
                    retry_chars += len(chunk)
                    yield {"event": "debug_chunk", "data": {"text": chunk, "total_chars": streamed_chars + retry_chars}}
                    yield {"event": "status", "data": {"message": f"Retrying... ({retry_chars} chars)"}}
                except asyncio.TimeoutError:
                    if not retry_future.done():
                        yield {"event": "status", "data": {"message": "Retrying..."}}
            try:
                retry_result, retry_raw = retry_future.result()
                raw_response_text += "\n--- RETRY ---\n" + retry_raw
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
                yield {"event": "error", "data": detail}
                return
            except Exception as exc:
                yield {"event": "error", "data": {"message": f"Retry call failed: {exc}"}}
                return
        else:
            yield {"event": "status", "data": {"message": f"Escalating to {GEMINI_ESCALATION_MODEL}..."}}
            retry_log.append(RetryLogEntry(
                round=round_num, errors=error_list, action="escalated",
                model_used=fast_model,
            ))
            # Stream escalation call with progress
            esc_progress: asyncio.Queue[str] = asyncio.Queue()
            esc_future: asyncio.Future[tuple[dict[str, Any], str]] = asyncio.get_event_loop().create_future()

            async def _escalation_call(q, _es=errors_str):
                return await _call_gemini_retry_stream(prompt.strip(), model, _es, history, model_name=GEMINI_ESCALATION_MODEL, on_progress=q)

            asyncio.create_task(
                _stream_gemini_with_progress(_escalation_call, esc_progress, esc_future)
            )
            esc_chars = 0
            while not esc_future.done():
                try:
                    chunk = await asyncio.wait_for(esc_progress.get(), timeout=5.0)
                    esc_chars += len(chunk)
                    yield {"event": "debug_chunk", "data": {"text": chunk, "total_chars": streamed_chars + esc_chars}}
                    yield {"event": "status", "data": {"message": f"Escalating... ({esc_chars} chars)"}}
                except asyncio.TimeoutError:
                    if not esc_future.done():
                        yield {"event": "status", "data": {"message": f"Escalating to {GEMINI_ESCALATION_MODEL}..."}}
            try:
                retry_result, esc_raw = esc_future.result()
                raw_response_text += "\n--- ESCALATION ---\n" + esc_raw
            except HTTPException as exc:
                detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
                yield {"event": "error", "data": detail}
                return
            except Exception as exc:
                yield {"event": "error", "data": {"message": f"Escalation call failed: {exc}"}}
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


# ---------------------------------------------------------------------------
# Phase 2: JSONL system prompt
# ---------------------------------------------------------------------------

def _system_instructions_jsonl() -> str:
    """System instructions for JSONL output format.

    Reuses all existing rules but changes the output format to JSONL
    (one JSON object per line).
    """
    return (
        "You are an SD-model editor engine. You MUST return ONLY JSON and no prose.\n"
        "\n"
        "Output format: Emit one JSON object per line (JSONL). Each line must be self-contained valid JSON.\n"
        "\n"
        "For STRUCTURAL changes (building/replacing a model), emit lines in this order:\n"
        "\n"
        "1. Nodes first (one per line):\n"
        '   {"type":"node","data":{"id":"s1","type":"stock","name":"population","label":"Population","equation":"births - deaths","initial_value":"1000","position":{"x":250,"y":100}}}\n'
        "\n"
        "2. Edges after all nodes:\n"
        '   {"type":"edge","data":{"id":"e1","type":"flow_link","source":"c1","target":"f1"}}\n'
        "\n"
        "3. Actions (optional):\n"
        '   {"type":"action","data":{"type":"update_sim_config","params":{"start":0,"stop":100,"dt":0.25}}}\n'
        "\n"
        "4. Final message (always last line):\n"
        '   {"type":"message","data":{"text":"Created a population model...","suggestions":["Run simulation","Add death rate"]}}\n'
        "\n"
        "For PARAMETER-ONLY patches (unchanged — single JSON object, not JSONL):\n"
        '   {"patches": [...], "message": "..."}\n'
        "\n"
        "For clarification (unchanged — single JSON object):\n"
        '   {"clarification": "...", "suggestions": [...]}\n'
        "\n"
        "IMPORTANT: Use patches whenever possible — they are faster and safer.\n"
        "Only use the JSONL node/edge format when adding or removing nodes/edges.\n"
        "NEVER mix patches and JSONL model output in the same response.\n"
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
        "    Simulation card types: kpi, line, table, sparkline, comparison, heatmap, map\n"
        "    Data table card types: data_bar, data_stacked_bar, data_area, data_pie, data_table, data_pivot\n"
        "    For data cards, use: {type, title, variable: '', data_table_id, x_column?, y_columns?, group_column?, value_column?, aggregate_fn?}\n"
        "  delete_dashboard_card — params: {dashboard_name, card_title}\n"
        "  update_default_style — params: {node_type, style: {fill?, stroke?, ...}}\n"
        "  run_simulate — runs current simulation\n"
        "  run_validate — validates model\n"
        "  run_scenario_batch — runs all scenarios\n"
        "  run_sensitivity — runs active sensitivity config\n"
        "  navigate — params: {page: 'canvas'|'formulas'|'dashboard'|'scenarios'|'sensitivity'}\n"
        "\n"
        "--- Scenarios vs Sensitivity Analysis ---\n"
        "\n"
        "SCENARIOS are discrete 'what if' comparisons. Each scenario overrides specific\n"
        "parameters to fixed values, representing a distinct policy or assumption.\n"
        "Use scenarios when the spec describes named alternatives, e.g. 'free trade vs protectionism',\n"
        "'optimistic vs pessimistic', or 'immediate vs gradual implementation'.\n"
        "\n"
        "Example create_scenario action:\n"
        '  {"type":"action","data":{"type": "create_scenario", "params": {\n'
        '    "name": "High Tariff",\n'
        '    "description": "50% tariff on imports",\n'
        '    "overrides": {"params": {"tariff_rate": 0.5, "import_quota": 1000}}\n'
        "  }}}\n"
        "\n"
        "SENSITIVITY ANALYSIS systematically sweeps a parameter across a continuous range\n"
        "to see how it affects an output variable. Use sensitivity when the spec says\n"
        "'vary X from A to B', 'test range A–B', or 'explore the effect of X'.\n"
        "\n"
        "Example create_sensitivity_config action:\n"
        '  {"type":"action","data":{"type": "create_sensitivity_config", "params": {\n'
        '    "name": "Tariff Rate Sensitivity",\n'
        '    "type": "oat",\n'
        '    "output": "gdp",\n'
        '    "metric": "final",\n'
        '    "parameters": [{"name": "tariff_rate", "low": 0.0, "high": 1.0, "steps": 5}]\n'
        "  }}}\n"
        "\n"
        "Interpretation rules:\n"
        "- 'Vary X: A–B' or 'range A to B' → sensitivity with low=A, high=B\n"
        "- 'Test A vs B' or named alternatives → scenarios with discrete overrides\n"
        "- Default sensitivity type: 'oat' (one-at-a-time), default metric: 'final', default steps: 5\n"
        "- Pick the most relevant stock as the sensitivity 'output' variable\n"
        "- Each sensitivity parameter needs: name, low, high, steps\n"
        "- Each scenario needs: name and overrides.params dict mapping variable names to values\n"
        "\n"
        "--- When to ask for clarification ---\n"
        "\n"
        "Use the clarification response format (single JSON object) when the user's request is ambiguous.\n"
        "Ask BEFORE guessing — especially for scenarios and sensitivity analysis:\n"
        "- Scenarios requested but no concrete parameter values given → ask which variables to override and what values\n"
        "- Sensitivity requested but no range/output specified → ask which parameter to sweep and over what range\n"
        "- Unclear whether the user wants scenarios vs sensitivity → ask with examples of each\n"
        "- Vague instructions like 'test different values' or 'explore the model' → ask what specifically to explore\n"
        "- Missing info like which output variable to track → suggest the most relevant stocks and ask\n"
        "Keep clarification questions short and always include 2-4 concrete suggestions the user can pick from.\n"
        "\n"
        "All entities are referenced by NAME (not id).\n"
        "\n"
        "IMPORTANT — JSON structure for nodes (used in JSONL node lines). Follow these examples EXACTLY:\n"
        "\n"
        f"Stock node (required fields: id, type, name, label, equation, initial_value, position; optional: longitude, latitude for geographic visualization):\n{_example_json(PROMPT_STOCK_EXAMPLE)}\n"
        "\n"
        "Dimensions: Define dimensions on the model document, then reference them on nodes.\n"
        "  Model-level: {\"dimensions\": [{\"id\": \"dim_1\", \"name\": \"Region\", \"elements\": [\"North\", \"South\"]}]}\n"
        "  Node-level: {\"dimensions\": [\"Region\"]} on any stock/aux/flow/lookup node.\n"
        "  Per-element overrides: {\"equation_overrides\": {\"North\": \"custom_equation\"}}\n"
        "  Subscript access in equations: Population[North] references a specific element.\n"
        "  Aggregate functions: SUM(variable), MEAN(variable) — sum/average across all elements.\n"
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
        "Math functions: min, max, abs, exp, log, sin, cos.\n"
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
        "- outputs is computed automatically from node names.\n"
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
        "\n"
        "When building a COMPLETE model from a specification or description:\n"
        "1. Emit ALL nodes as JSONL lines, one per line.\n"
        "2. Then emit ALL edges as JSONL lines, one per line.\n"
        "3. Then emit action lines (e.g. update_sim_config with start, stop, dt from the spec).\n"
        "4. Layout nodes in a readable grid pattern:\n"
        "   - Place stocks in a horizontal row with ~250px x-spacing, starting at y=100.\n"
        "   - Place each flow between its source and target stock (or between a cloud and a stock).\n"
        "   - For each stock-flow chain: Cloud(x,y) → Flow(x+200,y) → Stock(x+400,y) → Flow(x+600,y) → Cloud(x+800,y)\n"
        "   - Place aux/parameter nodes in rows below (y+200, y+350) aligned to the flows they influence.\n"
        "   - Place lookup nodes at y+300, spaced across.\n"
        "   - Use x-spacing of ~200px between nodes in the same row.\n"
        "5. Always create flow_link edges connecting stocks↔flows and clouds↔flows.\n"
        "6. Always create influence edges from every aux/parameter to the flows whose equations reference them.\n"
        "7. If the spec defines scenarios, also emit create_scenario actions.\n"
        "8. If the spec defines sensitivity ranges, also emit create_sensitivity_config actions.\n"
        "9. After building the model, emit a run_simulate action so results appear immediately.\n"
        "10. Do NOT invent additional variables beyond what the spec defines.\n"
        "11. End with a message line summarizing what was built.\n"
    )


def _gemini_request_body_jsonl(
    prompt: str,
    model: ModelDocument,
    history: list[AIChatMessage] | None = None,
    sim_config: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Build Gemini request body using JSONL system instructions.

    Same structure as _gemini_request_body() but uses _system_instructions_jsonl().
    Does NOT include responseMimeType since JSONL is not standard.
    """
    contents: list[dict[str, Any]] = []

    system_parts = [
        {"text": _system_instructions_jsonl()},
        {"text": "Current model JSON:"},
        {"text": json.dumps(model.model_dump(), ensure_ascii=True)},
    ]

    if sim_config:
        system_parts.append({"text": f"Current simulation config: {json.dumps(sim_config, ensure_ascii=True)}"})

    if history:
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

        contents.append({
            "role": "user",
            "parts": [{"text": f"User command:\n{prompt}"}],
        })
    else:
        contents.append({
            "role": "user",
            "parts": system_parts + [{"text": f"User command:\n{prompt}"}],
        })

    return {
        "contents": contents,
        "generationConfig": {
            "temperature": 1.0,
            # No responseMimeType — JSONL is not a standard MIME type
        },
    }


def _retry_request_body_jsonl(
    prompt: str,
    model: ModelDocument,
    errors: str,
    history: list[AIChatMessage] | None = None,
) -> dict[str, Any]:
    """Build a retry request using MONOLITHIC format (not JSONL).

    Retries deliberately use the simpler monolithic JSON format because:
    - JSONL is more complex and the initial failure is often format-related
    - Monolithic JSON is more reliable for retries (Gemini handles it better)
    - The retry response is handled through the existing monolithic pipeline
    """
    base = _retry_request_body(prompt, model, errors, history)
    # Remove responseMimeType for streaming
    if "generationConfig" in base:
        base["generationConfig"].pop("responseMimeType", None)
    return base


# ---------------------------------------------------------------------------
# Phase 3: JSONL streaming pipeline
# ---------------------------------------------------------------------------

async def execute_ai_command_stream_jsonl(
    prompt: str,
    model: ModelDocument,
    history: list[AIChatMessage] | None = None,
    sim_config: dict[str, Any] | None = None,
) -> AsyncGenerator[dict[str, Any], None]:
    """JSONL streaming variant of execute_ai_command_stream.

    Yields SSE event dicts including new 'chunk' and 'chunk_update' events.
    Falls back to monolithic JSON handling if Gemini ignores the JSONL format.
    """
    if not prompt.strip():
        yield {"event": "error", "data": {"message": "Prompt is required"}}
        return

    yield {"event": "status", "data": {"message": "Calling AI..."}}
    processed_prompt = _preprocess_spec_prompt(prompt.strip())

    # --- Stream the Gemini call with JSONL request body ---
    from app.services.jsonl_parser import (
        JSONLLineBuffer,
        assemble_model_from_chunks,
        detect_monolithic_response,
        parse_jsonl_line,
        repair_chunk,
        validate_chunk,
    )

    progress_queue: asyncio.Queue[str] = asyncio.Queue()
    result_future: asyncio.Future[tuple[dict[str, Any], str]] = asyncio.get_event_loop().create_future()

    key = _gemini_key()
    gemini_model_name = _gemini_model()
    url = _gemini_stream_endpoint(gemini_model_name)
    params = {"key": key}
    payload = _gemini_request_body_jsonl(processed_prompt, model, history, sim_config)

    async def _stream_call(q):
        return await _send_gemini_request_stream(url, params, payload, on_progress=q)

    task = asyncio.create_task(
        _stream_gemini_with_progress(_stream_call, progress_queue, result_future)
    )

    # Process chunks through JSONL line buffer as they arrive
    line_buffer = JSONLLineBuffer()
    validated_chunks: list[dict[str, Any]] = []  # list of {type, data, status, errors}
    chunk_index = 0
    full_text_parts: list[str] = []

    while not result_future.done():
        try:
            text_chunk = await asyncio.wait_for(progress_queue.get(), timeout=5.0)
            full_text_parts.append(text_chunk)

            # Feed into line buffer and process complete lines
            complete_lines = line_buffer.feed(text_chunk)
            for line in complete_lines:
                parsed = parse_jsonl_line(line)
                if parsed is None:
                    continue

                # Repair and validate the chunk
                repaired = repair_chunk(parsed)
                data, status, errors = validate_chunk(repaired)

                chunk_record = {
                    "type": repaired.get("type", "unknown"),
                    "data": data,
                    "status": status,
                    "errors": errors,
                }
                validated_chunks.append(chunk_record)

                # Yield chunk event to frontend
                yield {"event": "chunk", "data": {**chunk_record, "index": chunk_index}}
                chunk_index += 1

            # Status update
            node_count = sum(1 for c in validated_chunks if c["type"] == "node")
            edge_count = sum(1 for c in validated_chunks if c["type"] == "edge")
            if node_count or edge_count:
                yield {"event": "status", "data": {"message": f"Building model... {node_count} nodes, {edge_count} edges received"}}
            else:
                yield {"event": "status", "data": {"message": f"Receiving AI response... ({sum(len(p) for p in full_text_parts)} chars)"}}

        except asyncio.TimeoutError:
            if not result_future.done():
                total = sum(len(p) for p in full_text_parts)
                msg = f"Waiting for AI response... ({total} chars received)" if total else "Waiting for AI response..."
                yield {"event": "status", "data": {"message": msg}}

    # Drain remaining queue items
    while not progress_queue.empty():
        try:
            text_chunk = progress_queue.get_nowait()
            full_text_parts.append(text_chunk)
            complete_lines = line_buffer.feed(text_chunk)
            for line in complete_lines:
                parsed = parse_jsonl_line(line)
                if parsed is None:
                    continue
                repaired = repair_chunk(parsed)
                data, status, errors = validate_chunk(repaired)
                chunk_record = {"type": repaired.get("type", "unknown"), "data": data, "status": status, "errors": errors}
                validated_chunks.append(chunk_record)
                yield {"event": "chunk", "data": {**chunk_record, "index": chunk_index}}
                chunk_index += 1
        except asyncio.QueueEmpty:
            break

    # Flush any remaining partial line
    remaining = line_buffer.flush()
    if remaining:
        parsed = parse_jsonl_line(remaining)
        if parsed is not None:
            repaired = repair_chunk(parsed)
            data, status, errors = validate_chunk(repaired)
            chunk_record = {"type": repaired.get("type", "unknown"), "data": data, "status": status, "errors": errors}
            validated_chunks.append(chunk_record)
            yield {"event": "chunk", "data": {**chunk_record, "index": chunk_index}}
            chunk_index += 1

    # Get the streaming result (we need it for error handling and raw text)
    full_text = "".join(full_text_parts)
    try:
        gemini_result, raw_response_text = result_future.result()
    except HTTPException as exc:
        # Before giving up, check if we collected JSONL chunks despite the parse error
        if not validated_chunks:
            detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
            if isinstance(detail, dict):
                detail["debug_raw_response"] = full_text or detail.get("debug_raw_response")
            yield {"event": "error", "data": detail}
            return
        # We have chunks — proceed with assembly despite the JSON parse error
        raw_response_text = full_text
    except Exception as exc:
        if not validated_chunks:
            yield {"event": "error", "data": {"message": f"AI call failed: {exc}", "debug_raw_response": full_text}}
            return
        raw_response_text = full_text

    # --- Determine response type ---

    # Check if we got meaningful JSONL chunks (at least one node or edge)
    has_structural_chunks = any(c["type"] in ("node", "edge") for c in validated_chunks)

    if not has_structural_chunks:
        # Fallback: try monolithic JSON detection
        monolithic = detect_monolithic_response(full_text)
        if monolithic is None and not validated_chunks:
            yield {"event": "error", "data": {"ok": False, "errors": [{"code": "AI_BAD_RESPONSE", "message": "AI returned no model elements", "severity": "error"}], "debug_raw_response": full_text}}
            return

        if monolithic is not None:
            # Route through existing monolithic handling
            yield {"event": "status", "data": {"message": "Processing response..."}}
            async for event in _handle_monolithic_response(monolithic, model, prompt, history, raw_response_text, validated_chunks):
                yield event
            return

        # Only action/message chunks — check for actions-only response
        action_chunks = [c for c in validated_chunks if c["type"] == "action"]
        message_chunks = [c for c in validated_chunks if c["type"] == "message"]
        if action_chunks or message_chunks:
            actions: list[AIAction] = []
            for ac in action_chunks:
                try:
                    actions.append(AIAction(type=ac["data"].get("type", ""), params=ac["data"].get("params", {})))
                except Exception:
                    pass
            message = ""
            for mc in message_chunks:
                msg_data = mc["data"]
                message = msg_data.get("text", "") if isinstance(msg_data, dict) else str(msg_data)

            from app.schemas.ai import AIExecuteResponse
            yield {"event": "complete", "data": AIExecuteResponse(
                ok=True, model=None, patches=[], actions=actions, warnings=[],
                assistant_message=message or "Actions queued.",
                needs_clarification=False, suggestions=[], retry_log=[],
                debug_raw_response=raw_response_text,
                chunks=[c for c in validated_chunks],
            ).model_dump()}
            return

    # --- Assemble model from JSONL chunks ---
    yield {"event": "status", "data": {"message": "Validating complete model..."}}

    assembled = assemble_model_from_chunks(validated_chunks, model_name=model.name, model_id=model.id)
    extra_actions = assembled.pop("_actions", [])
    extra_message = assembled.pop("_message", "")

    # Validate the assembled model
    updated_model, error_list = _validate_full(assembled)

    if updated_model is not None:
        # Emit chunk_update events for any chunks that need status changes
        # (cross-reference validation may flag previously-valid chunks)
        validation = validate_model(updated_model)
        message = extra_message or "Model built successfully."

        # Parse actions
        actions = []
        for raw_action in extra_actions:
            try:
                actions.append(AIAction(type=raw_action.get("type", ""), params=raw_action.get("params", {})))
            except Exception:
                pass

        from app.schemas.ai import AIExecuteResponse
        yield {"event": "complete", "data": AIExecuteResponse(
            ok=True, model=updated_model, patches=[], actions=actions,
            warnings=validation.warnings, assistant_message=message,
            needs_clarification=False, suggestions=[], retry_log=[],
            debug_raw_response=raw_response_text,
            chunks=[c for c in validated_chunks],
        ).model_dump()}
        return

    # --- Validation failed — retry loop ---
    retry_log: list[RetryLogEntry] = []
    fast_model = _gemini_model()
    current_raw = assembled

    for round_num in range(1, MAX_RETRY_ROUNDS + 1):
        is_last_round = round_num == MAX_RETRY_ROUNDS
        if is_last_round:
            retry_log.append(RetryLogEntry(round=round_num, errors=error_list, action="gave_up", model_used=GEMINI_ESCALATION_MODEL))
            break

        errors_str = "\n".join(error_list)

        if round_num < MAX_RETRY_ROUNDS - 1:
            yield {"event": "status", "data": {"message": f"Validation failed, retrying (round {round_num + 1}/{MAX_RETRY_ROUNDS})..."}}
            retry_log.append(RetryLogEntry(round=round_num, errors=error_list, action="retrying", model_used=fast_model))

            retry_progress: asyncio.Queue[str] = asyncio.Queue()
            retry_future: asyncio.Future[tuple[dict[str, Any], str]] = asyncio.get_event_loop().create_future()

            retry_payload = _retry_request_body_jsonl(prompt.strip(), model, errors_str, history)
            retry_url = _gemini_stream_endpoint(fast_model)
            retry_params = {"key": key}

            async def _retry_call(q, _p=retry_payload, _u=retry_url, _pp=retry_params):
                return await _send_gemini_request_stream(_u, _pp, _p, on_progress=q)

            asyncio.create_task(_stream_gemini_with_progress(_retry_call, retry_progress, retry_future))
        else:
            yield {"event": "status", "data": {"message": f"Escalating to {GEMINI_ESCALATION_MODEL}..."}}
            retry_log.append(RetryLogEntry(round=round_num, errors=error_list, action="escalated", model_used=fast_model))

            retry_progress = asyncio.Queue()
            retry_future = asyncio.get_event_loop().create_future()

            retry_payload = _retry_request_body_jsonl(prompt.strip(), model, errors_str, history)
            retry_url = _gemini_stream_endpoint(GEMINI_ESCALATION_MODEL)
            retry_params = {"key": key}

            async def _esc_call(q, _p=retry_payload, _u=retry_url, _pp=retry_params):
                return await _send_gemini_request_stream(_u, _pp, _p, on_progress=q)

            asyncio.create_task(_stream_gemini_with_progress(_esc_call, retry_progress, retry_future))

        # Wait for retry result (simplified — no per-chunk streaming for retries)
        retry_chars = 0
        while not retry_future.done():
            try:
                chunk = await asyncio.wait_for(retry_progress.get(), timeout=5.0)
                retry_chars += len(chunk)
                yield {"event": "status", "data": {"message": f"Retrying... ({retry_chars} chars)"}}
            except asyncio.TimeoutError:
                if not retry_future.done():
                    yield {"event": "status", "data": {"message": "Retrying..."}}

        try:
            retry_result, retry_raw = retry_future.result()
            raw_response_text += "\n--- RETRY ---\n" + retry_raw
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
            if isinstance(detail, dict):
                detail["debug_raw_response"] = raw_response_text
            yield {"event": "error", "data": detail}
            return
        except Exception as exc:
            yield {"event": "error", "data": {"message": f"Retry call failed: {exc}", "debug_raw_response": raw_response_text}}
            return

        # The retry may come back as monolithic JSON or JSONL
        # For simplicity, try monolithic first (retries usually use the old format)
        if "model" in retry_result:
            current_raw = retry_result["model"]
            # Re-add version/id/name if missing
            if "version" not in current_raw:
                current_raw["version"] = 1
            if "id" not in current_raw:
                current_raw["id"] = model.id
            if "name" not in current_raw:
                current_raw["name"] = model.name
        else:
            retry_log.append(RetryLogEntry(
                round=round_num + 1, errors=["Retry did not return a model"], action="gave_up",
                model_used=GEMINI_ESCALATION_MODEL if round_num >= MAX_RETRY_ROUNDS - 1 else fast_model,
            ))
            break

        updated_model, error_list = _validate_full(current_raw)
        if updated_model is not None:
            retry_log.append(RetryLogEntry(round=round_num + 1, errors=[], action="success",
                                           model_used=fast_model if round_num < MAX_RETRY_ROUNDS - 1 else GEMINI_ESCALATION_MODEL))
            validation = validate_model(updated_model)
            message = extra_message or "Model built successfully."
            actions = []
            for raw_action in extra_actions:
                try:
                    actions.append(AIAction(type=raw_action.get("type", ""), params=raw_action.get("params", {})))
                except Exception:
                    pass

            from app.schemas.ai import AIExecuteResponse
            yield {"event": "complete", "data": AIExecuteResponse(
                ok=True, model=updated_model, patches=[], actions=actions,
                warnings=validation.warnings, assistant_message=message,
                needs_clarification=False, suggestions=[], retry_log=retry_log,
                debug_raw_response=raw_response_text,
                chunks=[c for c in validated_chunks],
            ).model_dump()}
            return

    # All rounds exhausted
    yield {"event": "error", "data": {
        "ok": False,
        "errors": [{"code": "AI_VALIDATION_FAILED", "message": f"AI output failed validation after {len(retry_log)} rounds: {error_list}", "severity": "error"}],
        "retry_log": [entry.model_dump() for entry in retry_log],
        "debug_raw_response": raw_response_text,
    }}


async def _handle_monolithic_response(
    result: dict[str, Any],
    model: ModelDocument,
    prompt: str,
    history: list[AIChatMessage] | None,
    raw_response_text: str,
    validated_chunks: list[dict[str, Any]],
) -> AsyncGenerator[dict[str, Any], None]:
    """Handle a monolithic JSON response through the existing pipeline.

    This is the fallback when Gemini ignores JSONL and returns a single JSON blob.
    """
    from app.schemas.ai import AIExecuteResponse

    # Check for clarification
    if "clarification" in result and "model" not in result and "patches" not in result:
        raw_suggestions = result.get("suggestions", [])
        if not isinstance(raw_suggestions, list):
            raw_suggestions = []
        suggestions = [str(s) for s in raw_suggestions[:6]]
        yield {"event": "complete", "data": AIExecuteResponse(
            ok=True, model=None, patches=[], actions=[], warnings=[],
            assistant_message=str(result["clarification"]),
            needs_clarification=True, suggestions=suggestions, retry_log=[],
            debug_raw_response=raw_response_text, chunks=validated_chunks,
        ).model_dump()}
        return

    # Extract and validate actions
    actions: list[AIAction] = []
    if "actions" in result and result["actions"]:
        try:
            actions = validate_actions(result["actions"])
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
            yield {"event": "error", "data": detail}
            return

    # Patch mode
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
        yield {"event": "complete", "data": AIExecuteResponse(
            ok=True, model=updated_model, patches=parsed_patches, actions=actions,
            warnings=validation.warnings, assistant_message=message,
            needs_clarification=False, suggestions=[], retry_log=[],
            debug_raw_response=raw_response_text, chunks=validated_chunks,
        ).model_dump()}
        return

    # Actions only
    if actions and "model" not in result:
        message = str(result.get("message", "Actions queued."))
        yield {"event": "complete", "data": AIExecuteResponse(
            ok=True, model=None, patches=[], actions=actions, warnings=[],
            assistant_message=message, needs_clarification=False, suggestions=[], retry_log=[],
            debug_raw_response=raw_response_text, chunks=validated_chunks,
        ).model_dump()}
        return

    # Full model mode
    if "model" not in result:
        yield {"event": "error", "data": {"ok": False, "errors": [{"code": "AI_BAD_RESPONSE", "message": "Missing 'model', 'patches', or 'actions' in AI output", "severity": "error"}]}}
        return

    yield {"event": "status", "data": {"message": "Validating response..."}}

    key = _gemini_key()
    fast_model = _gemini_model()
    current_raw = result["model"]
    retry_log: list[RetryLogEntry] = []

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
            yield {"event": "complete", "data": AIExecuteResponse(
                ok=True, model=updated_model, patches=[], actions=actions,
                warnings=validation.warnings, assistant_message=message,
                needs_clarification=False, suggestions=[], retry_log=retry_log,
                debug_raw_response=raw_response_text, chunks=validated_chunks,
            ).model_dump()}
            return

        is_last_round = round_num == MAX_RETRY_ROUNDS
        if is_last_round:
            retry_log.append(RetryLogEntry(round=round_num, errors=error_list, action="gave_up", model_used=GEMINI_ESCALATION_MODEL))
            break

        errors_str = "\n".join(error_list)
        if round_num < MAX_RETRY_ROUNDS - 1:
            yield {"event": "status", "data": {"message": f"Validation failed, retrying (round {round_num + 1}/{MAX_RETRY_ROUNDS})..."}}
            retry_log.append(RetryLogEntry(round=round_num, errors=error_list, action="retrying", model_used=fast_model))
            retry_model_name = fast_model
        else:
            yield {"event": "status", "data": {"message": f"Escalating to {GEMINI_ESCALATION_MODEL}..."}}
            retry_log.append(RetryLogEntry(round=round_num, errors=error_list, action="escalated", model_used=fast_model))
            retry_model_name = GEMINI_ESCALATION_MODEL

        # Retry using monolithic format (simpler, more reliable)
        retry_progress: asyncio.Queue[str] = asyncio.Queue()
        retry_future: asyncio.Future[tuple[dict[str, Any], str]] = asyncio.get_event_loop().create_future()

        retry_payload = _retry_request_body(prompt.strip(), model, errors_str, history)
        if "generationConfig" in retry_payload:
            retry_payload["generationConfig"].pop("responseMimeType", None)
        retry_url = _gemini_stream_endpoint(retry_model_name)
        retry_params = {"key": key}

        async def _monolithic_retry(q, _p=retry_payload, _u=retry_url, _pp=retry_params):
            return await _send_gemini_request_stream(_u, _pp, _p, on_progress=q)

        asyncio.create_task(_stream_gemini_with_progress(_monolithic_retry, retry_progress, retry_future))

        retry_chars = 0
        while not retry_future.done():
            try:
                chunk = await asyncio.wait_for(retry_progress.get(), timeout=5.0)
                retry_chars += len(chunk)
                yield {"event": "status", "data": {"message": f"Retrying... ({retry_chars} chars)"}}
            except asyncio.TimeoutError:
                if not retry_future.done():
                    yield {"event": "status", "data": {"message": "Retrying..."}}

        try:
            retry_result, retry_raw = retry_future.result()
            raw_response_text += "\n--- RETRY ---\n" + retry_raw
        except HTTPException as exc:
            detail = exc.detail if isinstance(exc.detail, dict) else {"message": str(exc.detail)}
            if isinstance(detail, dict):
                detail["debug_raw_response"] = raw_response_text
            yield {"event": "error", "data": detail}
            return
        except Exception as exc:
            yield {"event": "error", "data": {"message": f"Retry call failed: {exc}", "debug_raw_response": raw_response_text}}
            return

        if "model" in retry_result:
            current_raw = retry_result["model"]
        else:
            retry_log.append(RetryLogEntry(
                round=round_num + 1, errors=["Retry did not return a model"], action="gave_up",
                model_used=retry_model_name,
            ))
            break

    yield {"event": "error", "data": {
        "ok": False,
        "errors": [{"code": "AI_VALIDATION_FAILED", "message": f"AI model validation failed after {len(retry_log)} rounds: {error_list}", "severity": "error"}],
        "retry_log": [entry.model_dump() for entry in retry_log],
        "debug_raw_response": raw_response_text,
    }}
