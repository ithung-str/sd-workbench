from __future__ import annotations

import asyncio
import io
import json
import logging
import re
from typing import Any

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import StreamingResponse

from app.schemas.notebook import (
    NotebookAnalysis,
    NotebookCell,
    NotebookSection,
    ParseNotebookResponse,
    TransformNodeDef,
    TransformEdgeDef,
    TransformNotebookRequest,
    TransformNotebookResponse,
)
from app.services.notebook_planner import analyze_notebook, plan_notebook_sections

router = APIRouter(prefix="/api/notebook", tags=["notebook"])
_log = logging.getLogger(__name__)
_ALLOWED_NOTEBOOK_NODE_TYPES = {
    "data_source",
    "code",
    "sql",
    "output",
    "note",
    "group",
    "sheets_export",
    "publish",
}
_NOTEBOOK_NODE_TYPE_ALIASES = {
    "generic": "output",
    "data_loading": "data_source",
    "load_data": "data_source",
    "display": "output",
    "table": "output",
    "chart": "output",
    "plot": "output",
    "visualization": "output",
    "markdown": "note",
    "text": "note",
    "annotation": "note",
    "python": "code",
    "transform": "code",
    "source": "data_source",
    "data": "data_source",
    "data_input": "data_source",
    "sheet_export": "sheets_export",
    "google_sheets_export": "sheets_export",
    "export": "publish",
    "file_export": "publish",
}
_ALLOWED_OUTPUT_MODES = {"table", "bar", "line", "scatter", "stats"}


# ---------------------------------------------------------------------------
# POST /api/notebook/parse — extract cells from an uploaded .ipynb
# ---------------------------------------------------------------------------

@router.post("/parse", response_model=ParseNotebookResponse)
async def parse_notebook(file: UploadFile = File(...)) -> ParseNotebookResponse:
    """Parse a Jupyter notebook file and return its cell structure."""
    if not file.filename or not file.filename.endswith(".ipynb"):
        return ParseNotebookResponse(ok=False, error="File must be a .ipynb notebook")

    try:
        import nbformat
    except ImportError:
        return ParseNotebookResponse(
            ok=False,
            error="nbformat is not installed. Run: pip install nbformat",
        )

    try:
        raw = await file.read()
        nb = nbformat.read(io.BytesIO(raw), as_version=4)
    except Exception as exc:
        return ParseNotebookResponse(ok=False, error=f"Failed to parse notebook: {exc}")

    name = (file.filename or "notebook").rsplit(".", 1)[0]

    cells: list[NotebookCell] = []
    for i, cell in enumerate(nb.cells):
        source = cell.source.strip()
        if not source:
            continue

        outputs_text = None
        if cell.cell_type == "code" and hasattr(cell, "outputs"):
            text_parts = []
            for out in cell.outputs:
                if hasattr(out, "text"):
                    text_parts.append(out.text[:500])
                elif hasattr(out, "data"):
                    if "text/plain" in out.data:
                        text_parts.append(str(out.data["text/plain"])[:500])
            if text_parts:
                outputs_text = "\n".join(text_parts)[:1000]

        cells.append(NotebookCell(
            index=i,
            cell_type=cell.cell_type,
            source=source,
            outputs_text=outputs_text,
        ))

    return ParseNotebookResponse(ok=True, name=name, cells=cells)


# ---------------------------------------------------------------------------
# POST /api/notebook/transform — AI converts cells to pipeline nodes
# ---------------------------------------------------------------------------

_TRANSFORM_SYSTEM = """\
You are a data pipeline architect. You convert Jupyter notebook cells into a structured analysis pipeline.

The pipeline uses these node types:
- **data_source**: Loads tabular data. Has no code — the user uploads CSV/data manually. Use this when a cell loads data from files (pd.read_csv, pd.read_excel, etc.).
- **code**: Python code node. Receives input as `df_in` (single parent) or `df_in1, df_in2, ...` (multiple parents). Must produce output as `df_out` (DataFrame) or `result` (generic value). The variable `df` is also available as alias for `df_in`.
- **sql**: SQL node. Input tables named `df_in` or `df_in1, df_in2, ...`. Uses DuckDB syntax.
- **output**: Display/visualization node (pass-through from parent). Set output_mode to "table", "bar", "line", "scatter", or "stats".
- **note**: Markdown documentation node.
- **publish**: Publishes the upstream data as a reusable data table. Use this when a cell exports/saves data to a file (df.to_csv, df.to_excel, df.to_parquet, df.to_json, database writes, etc.). Pass-through from parent — no code needed.
- **sheets_export**: Exports upstream data to Google Sheets. Use this when a cell writes to Google Sheets (gspread, sheets API, or to_csv with a Google Sheets URL). Pass-through from parent — no code needed.

CRITICAL CODE REWRITE RULES:
1. Data loading cells (pd.read_csv, open(), requests.get, etc.) → create a `data_source` node (no code) + optionally a `code` node for transforms. The code node should use `df_in` instead of the file loading call.
2. Processing cells → `code` nodes. Replace the original DataFrame variable with `df_in` for input and assign the final result to `df_out`.
3. If a cell only displays/prints data → `output` node.
4. Markdown cells → `note` nodes (put the markdown in the `content` field, NOT `code`).
5. Merge small related cells when they logically belong together. Split cells that do unrelated things.
6. Cells that only do `import` statements should be merged into the first code node that uses them. Don't create standalone import nodes.
7. Available packages in code nodes: pandas (pd), numpy (np), scipy, sklearn, statsmodels, duckdb. Import statements for these can be included in each code node.
8. matplotlib/seaborn/plotly visualization cells → convert to `output` nodes with appropriate output_mode. Drop the plotting code.
   - Simple bar charts (plt.bar, sns.barplot, px.bar) → output_mode "bar"
   - Line charts (plt.plot, sns.lineplot, px.line) → output_mode "line"
   - Scatter plots (plt.scatter, sns.scatterplot, px.scatter) → output_mode "scatter"
   - Statistical summaries (df.describe(), value_counts) → output_mode "stats"
   - Tables, .head(), display() → output_mode "table"
   - Complex visualizations (multi-axis, subplots, heatmaps, custom annotations, geographic maps, 3D plots) → use the closest output_mode AND add a warning like "Cell X had a complex [description] plot that was simplified to a [mode] chart. Review the output node and adjust as needed."
9. Keep the code clean and working. Each code node should be self-contained with its own imports if needed.
10. Data export cells → convert based on destination:
    - df.to_csv(), df.to_excel(), df.to_parquet(), df.to_json(), DB writes → `publish` node. Drop the export code.
    - Google Sheets writes (gspread, sheets API) → `sheets_export` node. Drop the export code.
    - If a cell mixes processing AND export, split into a `code` node (processing) → `publish`/`sheets_export` node (export).

DATA SOURCE HINTS:
For every data_source node, include a `source_hint` object that describes where the data originally came from:
- CSV files (pd.read_csv('file.csv')) → `{"source_type": "csv", "filename": "file.csv"}`
- Excel files (pd.read_excel('file.xlsx')) → `{"source_type": "excel", "filename": "file.xlsx"}`
- Google Sheets (any URL containing docs.google.com/spreadsheets) → `{"source_type": "google_sheets", "url": "the full URL"}`
- Other URLs (requests.get, pd.read_csv('http://...')) → `{"source_type": "url", "url": "the URL"}`
- Unknown/unclear source → `{"source_type": "unknown"}`

EXPORT HINTS:
For every publish or sheets_export node, include an `export_hint` object:
- Google Sheets writes → `{"export_type": "google_sheets", "url": "the spreadsheet URL", "sheet_name": "Sheet1"}`
- File exports (to_csv, to_excel, etc.) → `{"export_type": "file", "filename": "output.csv"}`
- Unknown → `{"export_type": "unknown"}`

Extract the EXACT filenames, URLs, and sheet names from the original code.

Return JSON with this exact structure:
{
  "nodes": [
    {
      "type": "data_source" | "code" | "sql" | "output" | "note" | "publish" | "sheets_export",
      "name": "short descriptive name",
      "description": "one sentence about what this does",
      "code": "python code (for code nodes only, null otherwise)",
      "sql": "sql query (for sql nodes only, null otherwise)",
      "content": "markdown text (for note nodes only, null otherwise)",
      "output_mode": "table" | "bar" | "line" | "scatter" | "stats" (for output nodes only, null otherwise),
      "source_hint": {"source_type": "csv", "filename": "data.csv"} (for data_source nodes only, null otherwise),
      "export_hint": {"export_type": "file", "filename": "output.csv"} (for publish/sheets_export nodes only, null otherwise),
      "original_cells": [0, 1]
    }
  ],
  "edges": [
    {"from_index": 0, "to_index": 1}
  ],
  "warnings": ["any issues or things the user should know"]
}

Edge indices refer to positions in the nodes array (0-based). Data flows from from_index to to_index.
Every code/sql/output/publish/sheets_export node should have at least one incoming edge (except if it's truly standalone).
"""

_SECTION_PLAN_SYSTEM = """\
You are planning a notebook-to-pipeline import.

Return a flat top-level section plan for the notebook.

Use markdown headings as hints, not hard rules. Prefer semantic workflow stages like:
- loading data
- cleaning/preparation
- joins/merges
- modeling/enrichment
- outputs/visualization
- exports/publishing

Return JSON with this shape:
{
  "sections": [
    {
      "id": "sec_ingest",
      "name": "Ingest data",
      "purpose": "Loads source tables and prepares them for downstream processing.",
      "cell_indices": [1, 2, 3]
    }
  ]
}

Rules:
- Flat groups only, no nesting
- Cover the whole notebook without overlapping ownership
- Prefer 4-10 groups, but use fewer for small notebooks
- Keep names short and action-oriented
"""

_STAGE_GENERATION_SYSTEM = """\
You are converting a single notebook stage into local pipeline nodes.

Only generate nodes that belong to this stage.
Do not create cross-stage edges.
Keep stage-local outputs explicit so another pass can connect stages later.

The pipeline uses these node types:
- **data_source**: Loads tabular data. Has no code — the user uploads CSV/data manually. Use this when a cell loads data from files (pd.read_csv, pd.read_excel, etc.).
- **code**: Python code node. Receives input as `df_in` (single parent) or `df_in1, df_in2, ...` (multiple parents). Must produce output as `df_out` (DataFrame) or `result` (generic value). The variable `df` is also available as alias for `df_in`.
- **sql**: SQL node. Input tables named `df_in` or `df_in1, df_in2, ...`. Uses DuckDB syntax.
- **output**: Display/visualization node (pass-through from parent). Set output_mode to "table", "bar", "line", "scatter", or "stats".
- **note**: Markdown documentation node.
- **publish**: Publishes the upstream data as a reusable data table. Use this when a cell exports/saves data to a file (df.to_csv, df.to_excel, etc.). Pass-through from parent — no code needed.
- **sheets_export**: Exports upstream data to Google Sheets. Pass-through from parent — no code needed.

CRITICAL CODE REWRITE RULES:
1. Data loading cells (pd.read_csv, open(), requests.get, etc.) → create a `data_source` node (no code) + optionally a `code` node for transforms. The code node should use `df_in` instead of the file loading call.
2. Processing cells → `code` nodes. Replace the original DataFrame variable with `df_in` for input and assign the final result to `df_out`.
3. If a cell only displays/prints data → `output` node.
4. Markdown cells → `note` nodes (put the markdown in the `content` field, NOT `code`).
5. Merge small related cells when they logically belong together. Split cells that do unrelated things.
6. Cells that only do `import` statements should be merged into the first code node that uses them. Don't create standalone import nodes.
7. Available packages in code nodes: pandas (pd), numpy (np), scipy, sklearn, statsmodels, duckdb. Import statements for these can be included in each code node.
8. matplotlib/seaborn/plotly visualization cells → convert to `output` nodes with appropriate output_mode. Drop the plotting code.
9. Keep the code clean and working. Each code node should be self-contained with its own imports if needed.
10. Data export cells → `publish` or `sheets_export` nodes. Drop the export code.

Never use placeholders like generic, unknown, io, data_loading, display_only, or custom node types.

Return JSON with this exact structure:
{
  "nodes": [
    {
      "type": "data_source" | "code" | "sql" | "output" | "note" | "publish" | "sheets_export",
      "name": "short descriptive name",
      "description": "one sentence about what this does",
      "code": "python code (for code nodes only, null otherwise)",
      "sql": "sql query (for sql nodes only, null otherwise)",
      "content": "markdown text (for note nodes only, null otherwise)",
      "output_mode": "table" | "bar" | "line" | "scatter" | "stats" (for output nodes only, null otherwise),
      "source_hint": {"source_type": "csv", "filename": "data.csv"} (for data_source nodes only, null otherwise),
      "export_hint": {"export_type": "file", "filename": "output.csv"} (for publish/sheets_export nodes only, null otherwise),
      "original_cells": [0, 1]
    }
  ],
  "edges": [{"from_index": 0, "to_index": 1}],
  "warnings": [],
  "key_inputs": ["Profiles"],
  "key_outputs": ["Prepared materials"]
}

Edge indices refer to positions in the nodes array (0-based). Data flows from from_index to to_index.
Every code/sql/output/publish/sheets_export node should have at least one incoming edge (except if it's truly standalone).
"""

_WORKFLOW_SYNTHESIS_SYSTEM = """\
You are a workflow synthesizer for notebook import.

You receive stage summaries and stage-local node lists.
Connect the stages into a coherent workflow without changing local stage internals.

Return JSON with this shape:
{
  "cross_stage_edges": [
    {
      "from_stage_id": "sec_ingest",
      "from_node_index": 0,
      "to_stage_id": "sec_prepare",
      "to_node_index": 0
    }
  ],
  "main_path_stage_ids": ["sec_ingest", "sec_prepare"],
  "warnings": []
}

Rules:
- Only connect stages that clearly depend on each other
- Prefer the dominant left-to-right workflow spine
- Use node indices local to each stage
"""


@router.post("/transform", response_model=TransformNotebookResponse)
def transform_notebook(req: TransformNotebookRequest) -> TransformNotebookResponse:
    """Use AI to convert parsed notebook cells into a pipeline definition."""
    try:
        from app.services.ai_model_service import (
            _gemini_key,
            _gemini_model,
            _gemini_endpoint,
            _send_gemini_request,
        )

        key = _gemini_key()
        model_name = _gemini_model()
        url = _gemini_endpoint(model_name)
        sections = plan_notebook_sections(req.cells, req.pipeline_name, _plan_sections_with_ai)
        analysis = analyze_notebook(req.cells, sections)

        if _should_use_multi_pass(analysis, sections):
            stage_results: list[dict[str, Any]] = []
            for section in sections:
                stage_results.append(_generate_parsed_stage_result(
                    key=key,
                    url=url,
                    cells=req.cells,
                    pipeline_name=req.pipeline_name,
                    section=section,
                    sections=sections,
                    send_gemini_request=_send_gemini_request,
                ))

            synthesis = _synthesize_workflow_with_ai(
                key=key,
                url=url,
                sections=sections,
                stage_results=stage_results,
                send_gemini_request=_send_gemini_request,
            )
            nodes, edges, warnings, _workflow = _stitch_stage_results(sections, stage_results, synthesis)
            return TransformNotebookResponse(
                ok=True,
                sections=sections,
                nodes=nodes,
                edges=edges,
                warnings=warnings,
            )

        user_prompt = _build_transform_prompt(req.cells, req.pipeline_name)
        section_summary = _summarize_sections_for_transform(sections)
        if section_summary:
            user_prompt = f"{user_prompt}\n\n{section_summary}"

        payload = {
            "system_instruction": {"parts": [{"text": _TRANSFORM_SYSTEM}]},
            "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 65536,
                "responseMimeType": "application/json",
            },
        }

        parsed = _send_gemini_request(url, {"key": key}, payload)

        nodes, parse_warnings = _parse_transform_nodes_with_context(parsed.get("nodes", []), req.cells)
        nodes = _assign_groups_to_nodes(nodes, sections)
        edges = [TransformEdgeDef(**e) for e in parsed.get("edges", [])]
        warnings = [*parsed.get("warnings", []), *parse_warnings]

        return TransformNotebookResponse(
            ok=True,
            sections=sections,
            nodes=nodes,
            edges=edges,
            warnings=warnings,
        )

    except Exception as exc:
        _log.exception("Notebook transform failed")
        return TransformNotebookResponse(ok=False, error=str(exc))


# ---------------------------------------------------------------------------
# POST /api/notebook/transform-stream — streaming variant with SSE
# ---------------------------------------------------------------------------


def _build_transform_prompt(cells: list[NotebookCell], pipeline_name: str) -> str:
    """Build the user prompt for notebook transformation."""
    cell_descriptions = []
    for cell in cells:
        header = f"[Cell {cell.index}] ({cell.cell_type})"
        body = cell.source
        if cell.outputs_text:
            body += f"\n\n# Output:\n# {cell.outputs_text[:300]}"
        cell_descriptions.append(f"{header}\n```\n{body}\n```")

    return (
        f"Convert this Jupyter notebook into a pipeline.\n"
        f"Notebook name: {pipeline_name}\n"
        f"Total cells: {len(cells)}\n\n"
        + "\n\n".join(cell_descriptions)
    )


def _build_section_plan_prompt(cells: list[NotebookCell], pipeline_name: str) -> str:
    cell_descriptions = []
    for cell in cells:
        cell_descriptions.append(f"[Cell {cell.index}] ({cell.cell_type})\n```\n{cell.source}\n```")
    return (
        f"Create a section plan for this notebook.\n"
        f"Notebook name: {pipeline_name}\n"
        f"Total cells: {len(cells)}\n\n"
        + "\n\n".join(cell_descriptions)
    )


def _summarize_sections_for_transform(sections: list[NotebookSection]) -> str:
    if not sections:
        return ""
    lines = ["Use this section plan when chunking and naming the pipeline:"]
    for section in sections:
        lines.append(
            f'- {section.name} ({section.id}): cells {section.cell_indices}. Purpose: {section.purpose}'
        )
    return "\n".join(lines)


def _cells_for_section(cells: list[NotebookCell], section: NotebookSection) -> list[NotebookCell]:
    cell_ids = set(section.cell_indices)
    return [cell for cell in cells if cell.index in cell_ids]


def _should_use_multi_pass(analysis: NotebookAnalysis, sections: list[NotebookSection]) -> bool:
    if len(sections) <= 1:
        return False
    if analysis.complexity_tier == "large":
        return True
    return analysis.complexity_tier == "medium" and analysis.code_cell_count >= 8


def _build_stage_generation_prompt(
    cells: list[NotebookCell],
    pipeline_name: str,
    section: NotebookSection,
    sections: list[NotebookSection],
) -> str:
    stage_cells = _cells_for_section(cells, section)
    cell_descriptions = []
    for cell in stage_cells:
        header = f"[Cell {cell.index}] ({cell.cell_type})"
        body = cell.source
        if cell.outputs_text:
            body += f"\n\n# Output:\n# {cell.outputs_text[:300]}"
        cell_descriptions.append(f"{header}\n```\n{body}\n```")

    return (
        f"Convert this single notebook stage into local pipeline nodes.\n"
        f"Notebook name: {pipeline_name}\n"
        f"Total planned stages: {len(sections)}\n"
        f"Current stage: {section.name} ({section.id})\n"
        f"Stage purpose: {section.purpose}\n"
        f"Stage cell indices: {section.cell_indices}\n\n"
        + "\n\n".join(cell_descriptions)
    )


def _build_workflow_synthesis_prompt(
    sections: list[NotebookSection],
    stage_results: list[dict[str, Any]],
) -> str:
    lines = ["Connect these notebook stages into a workflow:"]
    for stage_result in stage_results:
        section: NotebookSection = stage_result["section"]
        node_lines = [
            f'  - local node {index}: {node.name or node.type} ({node.type})'
            for index, node in enumerate(stage_result["nodes"])
        ]
        lines.append(
            "\n".join([
                f"- {section.name} ({section.id})",
                f"  purpose: {section.purpose}",
                f"  key inputs: {stage_result.get('key_inputs', [])}",
                f"  key outputs: {stage_result.get('key_outputs', [])}",
                *node_lines,
            ])
        )
    return "\n".join(lines)


def _plan_sections_with_ai(cells: list[NotebookCell], pipeline_name: str) -> list[dict]:
    from app.services.ai_model_service import (
        _gemini_endpoint,
        _gemini_key,
        _gemini_model,
        _send_gemini_request,
    )

    key = _gemini_key()
    model_name = _gemini_model()
    url = _gemini_endpoint(model_name)
    payload = {
        "system_instruction": {"parts": [{"text": _SECTION_PLAN_SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": _build_section_plan_prompt(cells, pipeline_name)}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json",
        },
    }
    parsed = _send_gemini_request(url, {"key": key}, payload)
    return parsed.get("sections", [])


def _generate_stage_with_ai(
    *,
    key: str,
    url: str,
    cells: list[NotebookCell],
    pipeline_name: str,
    section: NotebookSection,
    sections: list[NotebookSection],
    send_gemini_request,
) -> dict[str, Any]:
    payload = {
        "system_instruction": {"parts": [{"text": _STAGE_GENERATION_SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": _build_stage_generation_prompt(cells, pipeline_name, section, sections)}]}],
        "generationConfig": {
            "temperature": 0.15,
            "maxOutputTokens": 16384,
            "responseMimeType": "application/json",
        },
    }
    return send_gemini_request(url, {"key": key}, payload)


def _infer_transform_node_type_from_context(
    payload: dict[str, Any],
    cells_by_index: dict[int, NotebookCell] | None,
) -> str | None:
    name_text = str(payload.get("name", "") or "").lower()
    description_text = str(payload.get("description", "") or "").lower()
    text_parts = [name_text, description_text]
    for cell_index in payload.get("original_cells", []) or []:
        cell = cells_by_index.get(cell_index) if cells_by_index else None
        if cell is not None:
            text_parts.append(cell.source.lower())
    context_text = "\n".join(part for part in text_parts if part)

    if any(token in context_text for token in ["docs.google.com/spreadsheets", "gspread", "open_by_url(", ".worksheet(", ".update("]):
        return "sheets_export"
    if any(token in context_text for token in ["to_csv(", "to_excel(", "to_parquet(", "to_json(", "to_pickle(", "write_parquet(", "write_csv(", "save to ", "export_"]):
        return "publish"
    if any(token in context_text for token in ["read_csv(", "read_excel(", "read_parquet(", "read_json(", "pd.read_", "load_", "import_"]):
        return "data_source"
    if any(token in context_text for token in ["display(", ".head()", ".tail()", ".describe()", ".value_counts()", ".info()", ".plot(", "plt.", "sns.", "px.", "visualize_", "plot_", "chart"]):
        return "output"
    if any(token in context_text for token in ["select ", " from ", " join ", "duckdb", "sql"]):
        return "sql" if payload.get("sql") else None
    if any(token in context_text for token in ["merge", "filter", "map_", "calculate", "melt", "pivot", "groupby", "aggregate", "reindex", "break_down", "define_", "extend_", "query(", "assign(", "="]):
        return "code"
    return None


def _payload_cells(
    payload: dict[str, Any],
    cells_by_index: dict[int, NotebookCell] | None,
) -> list[NotebookCell]:
    if not cells_by_index:
        return []
    return [
        cell
        for cell_index in payload.get("original_cells", []) or []
        for cell in [cells_by_index.get(cell_index)]
        if cell is not None
    ]


def _normalize_transform_node_payload(
    node_payload: dict[str, Any],
    cells_by_index: dict[int, NotebookCell] | None = None,
) -> tuple[dict[str, Any], list[str]]:
    payload = dict(node_payload)
    warnings: list[str] = []
    source_cells = _payload_cells(payload, cells_by_index)
    raw_type = str(payload.get("type", "") or "").strip()
    normalized_type = raw_type.lower().replace("-", "_").replace(" ", "_")

    if normalized_type not in _ALLOWED_NOTEBOOK_NODE_TYPES:
        coerced_type = _NOTEBOOK_NODE_TYPE_ALIASES.get(normalized_type)
        if coerced_type is None:
            inferred_type = _infer_transform_node_type_from_context(payload, cells_by_index)
            if inferred_type is not None:
                coerced_type = inferred_type
            elif payload.get("content"):
                coerced_type = "note"
            elif payload.get("sql"):
                coerced_type = "sql"
            elif payload.get("export_hint", {}).get("export_type") == "google_sheets":
                coerced_type = "sheets_export"
            elif payload.get("export_hint"):
                coerced_type = "publish"
            elif payload.get("source_hint"):
                coerced_type = "data_source"
            elif payload.get("code"):
                coerced_type = "code"
            else:
                coerced_type = "output"
        payload["type"] = coerced_type
        warnings.append(
            f"Coerced unsupported notebook node type '{raw_type or normalized_type or 'unknown'}' to '{coerced_type}' for '{payload.get('name') or 'unnamed node'}'."
        )
    else:
        payload["type"] = normalized_type

    if payload["type"] == "output" and source_cells and all(cell.cell_type == "markdown" for cell in source_cells):
        payload["type"] = "note"
        warnings.append(
            f"Coerced notebook node '{payload.get('name') or 'unnamed node'}' from 'output' to 'note' because it only references markdown cells."
        )

    if payload["type"] == "note" and not payload.get("content"):
        markdown_content = "\n\n".join(cell.source for cell in source_cells if cell.cell_type == "markdown").strip()
        payload["content"] = markdown_content or payload.get("description") or payload.get("name") or ""

    if payload["type"] == "code" and not payload.get("code"):
        code_content = "\n\n".join(cell.source for cell in source_cells if cell.cell_type == "code").strip()
        if code_content:
            payload["code"] = code_content
            warnings.append(
                f"Recovered missing code for '{payload.get('name') or 'unnamed node'}' from notebook cells."
            )

    if payload["type"] == "output":
        output_mode = payload.get("output_mode")
        if output_mode not in _ALLOWED_OUTPUT_MODES:
            if output_mode is not None:
                warnings.append(
                    f"Coerced unsupported output mode '{output_mode}' to 'table' for '{payload.get('name') or 'unnamed node'}'."
                )
            payload["output_mode"] = "table"

    return payload, warnings


def _parse_transform_nodes(node_payloads: list[dict[str, Any]]) -> tuple[list[TransformNodeDef], list[str]]:
    return _parse_transform_nodes_with_context(node_payloads, None)


def _parse_transform_nodes_with_context(
    node_payloads: list[dict[str, Any]],
    cells: list[NotebookCell] | None,
) -> tuple[list[TransformNodeDef], list[str]]:
    nodes: list[TransformNodeDef] = []
    warnings: list[str] = []
    cells_by_index = {cell.index: cell for cell in cells} if cells else None
    for node_payload in node_payloads:
        normalized_payload, payload_warnings = _normalize_transform_node_payload(node_payload, cells_by_index)
        warnings.extend(payload_warnings)
        nodes.append(TransformNodeDef(**normalized_payload))
    return nodes, warnings


def _synthesize_workflow_with_ai(
    *,
    key: str,
    url: str,
    sections: list[NotebookSection],
    stage_results: list[dict[str, Any]],
    send_gemini_request,
) -> dict[str, Any]:
    payload = {
        "system_instruction": {"parts": [{"text": _WORKFLOW_SYNTHESIS_SYSTEM}]},
        "contents": [{"role": "user", "parts": [{"text": _build_workflow_synthesis_prompt(sections, stage_results)}]}],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 8192,
            "responseMimeType": "application/json",
        },
    }
    return send_gemini_request(url, {"key": key}, payload)


def _generate_parsed_stage_result(
    *,
    key: str,
    url: str,
    cells: list[NotebookCell],
    pipeline_name: str,
    section: NotebookSection,
    sections: list[NotebookSection],
    send_gemini_request,
) -> dict[str, Any]:
    stage_payload = _generate_stage_with_ai(
        key=key,
        url=url,
        cells=cells,
        pipeline_name=pipeline_name,
        section=section,
        sections=sections,
        send_gemini_request=send_gemini_request,
    )
    stage_nodes, stage_parse_warnings = _parse_transform_nodes_with_context(stage_payload.get("nodes", []), cells)
    stage_nodes = _assign_groups_to_nodes(stage_nodes, [section])
    stage_edges = [TransformEdgeDef(**e) for e in stage_payload.get("edges", [])]
    return {
        "section": section,
        "nodes": stage_nodes,
        "edges": stage_edges,
        "warnings": [*stage_payload.get("warnings", []), *stage_parse_warnings],
        "key_inputs": stage_payload.get("key_inputs", []),
        "key_outputs": stage_payload.get("key_outputs", []),
    }


def _assign_groups_to_nodes(nodes: list[TransformNodeDef], sections: list[NotebookSection]) -> list[TransformNodeDef]:
    if not sections:
        return nodes
    assigned: list[TransformNodeDef] = []
    for node in nodes:
        node_cells = set(node.original_cells)
        best_section: NotebookSection | None = None
        best_overlap = 0
        for section in sections:
            overlap = len(node_cells.intersection(section.cell_indices))
            if overlap > best_overlap:
                best_section = section
                best_overlap = overlap
        if best_section is None:
            assigned.append(node)
            continue
        assigned.append(node.model_copy(update={
            "group_id": best_section.id,
            "group_name": best_section.name,
        }))
    return assigned


def _stitch_stage_results(
    sections: list[NotebookSection],
    stage_results: list[dict[str, Any]],
    synthesis: dict[str, Any] | None,
) -> tuple[list[TransformNodeDef], list[TransformEdgeDef], list[str], dict[str, list[str]]]:
    nodes: list[TransformNodeDef] = []
    edges: list[TransformEdgeDef] = []
    warnings: list[str] = []
    stage_offsets: dict[str, int] = {}
    stage_sizes: dict[str, int] = {}

    for stage_result in stage_results:
      section: NotebookSection = stage_result["section"]
      stage_offsets[section.id] = len(nodes)
      stage_nodes: list[TransformNodeDef] = stage_result["nodes"]
      stage_edges: list[TransformEdgeDef] = stage_result["edges"]
      nodes.extend(stage_nodes)
      stage_sizes[section.id] = len(stage_nodes)
      edges.extend([
          TransformEdgeDef(
              from_index=edge.from_index + stage_offsets[section.id],
              to_index=edge.to_index + stage_offsets[section.id],
          )
          for edge in stage_edges
      ])
      warnings.extend(stage_result.get("warnings", []))

    synthesis = synthesis or {}
    cross_stage_edges = synthesis.get("cross_stage_edges", [])
    valid_cross_edges: list[TransformEdgeDef] = []
    for edge in cross_stage_edges:
        from_stage_id = edge.get("from_stage_id")
        to_stage_id = edge.get("to_stage_id")
        from_local = int(edge.get("from_node_index", 0))
        to_local = int(edge.get("to_node_index", 0))
        if from_stage_id not in stage_offsets or to_stage_id not in stage_offsets:
            continue
        if from_local < 0 or to_local < 0:
            continue
        if from_local >= stage_sizes.get(from_stage_id, 0) or to_local >= stage_sizes.get(to_stage_id, 0):
            continue
        valid_cross_edges.append(TransformEdgeDef(
            from_index=stage_offsets[from_stage_id] + from_local,
            to_index=stage_offsets[to_stage_id] + to_local,
        ))

    if not valid_cross_edges:
        for left, right in zip(sections, sections[1:]):
            if stage_sizes.get(left.id, 0) <= 0 or stage_sizes.get(right.id, 0) <= 0:
                continue
            valid_cross_edges.append(TransformEdgeDef(
                from_index=stage_offsets[left.id] + stage_sizes[left.id] - 1,
                to_index=stage_offsets[right.id],
            ))

    edges.extend(valid_cross_edges)
    warnings.extend(synthesis.get("warnings", []))
    fallback = _workflow_summary(sections, nodes, edges) if not synthesis.get("main_path_stage_ids") else {}
    workflow = {
        "main_path_stage_ids": synthesis.get("main_path_stage_ids") or fallback.get("main_path_stage_ids", []),
        "collapsed_stage_ids": synthesis.get("collapsed_stage_ids") or fallback.get("collapsed_stage_ids", []),
    }
    return nodes, edges, warnings, workflow


def _try_extract_nodes_incrementally(text: str) -> tuple[list[dict], int]:
    """Try to extract complete node objects from accumulating JSON text.

    Looks for the "nodes" array and extracts complete {...} objects within it
    by tracking brace depth.  Returns (extracted_nodes, count_already_emitted).
    """
    nodes: list[dict] = []
    # Find the start of the nodes array
    m = re.search(r'"nodes"\s*:\s*\[', text)
    if not m:
        return nodes, 0

    pos = m.end()
    depth = 0
    obj_start = -1

    while pos < len(text):
        ch = text[pos]

        # Skip strings (don't count braces inside strings)
        if ch == '"':
            pos += 1
            while pos < len(text):
                if text[pos] == '\\':
                    pos += 2
                    continue
                if text[pos] == '"':
                    pos += 1
                    break
                pos += 1
            continue

        if ch == '{':
            if depth == 0:
                obj_start = pos
            depth += 1
        elif ch == '}':
            depth -= 1
            if depth == 0 and obj_start >= 0:
                obj_text = text[obj_start : pos + 1]
                try:
                    node = json.loads(obj_text)
                    nodes.append(node)
                except json.JSONDecodeError:
                    pass
                obj_start = -1
        elif ch == ']' and depth == 0:
            # End of nodes array
            break

        pos += 1

    return nodes, 0


def _workflow_summary(
    sections: list[NotebookSection],
    nodes: list[TransformNodeDef],
    edges: list[TransformEdgeDef],
) -> dict[str, list[str]]:
    if not sections:
        return {"main_path_stage_ids": [], "collapsed_stage_ids": []}

    ordered_stage_ids = [section.id for section in sections]
    stage_by_index = {index: node.group_id for index, node in enumerate(nodes)}
    stage_graph: dict[str, set[str]] = {stage_id: set() for stage_id in ordered_stage_ids}
    indegree: dict[str, int] = {stage_id: 0 for stage_id in ordered_stage_ids}
    outdegree: dict[str, int] = {stage_id: 0 for stage_id in ordered_stage_ids}

    for edge in edges:
        source_stage = stage_by_index.get(edge.from_index)
        target_stage = stage_by_index.get(edge.to_index)
        if not source_stage or not target_stage or source_stage == target_stage:
            continue
        if target_stage not in stage_graph[source_stage]:
            stage_graph[source_stage].add(target_stage)
            indegree[target_stage] += 1
            outdegree[source_stage] += 1

    if not any(stage_graph.values()):
        return {"main_path_stage_ids": ordered_stage_ids, "collapsed_stage_ids": []}

    scores: dict[str, int] = {stage_id: 0 for stage_id in ordered_stage_ids}
    previous: dict[str, str | None] = {stage_id: None for stage_id in ordered_stage_ids}
    for stage_id in ordered_stage_ids:
        if indegree[stage_id] == 0:
            scores[stage_id] = 1
        for target in stage_graph[stage_id]:
            candidate = scores[stage_id] + 1
            if candidate > scores[target]:
                scores[target] = candidate
                previous[target] = stage_id

    sink_ids = [stage_id for stage_id in ordered_stage_ids if outdegree[stage_id] == 0] or ordered_stage_ids
    best_sink = max(sink_ids, key=lambda stage_id: scores[stage_id])
    main_path: list[str] = []
    cursor: str | None = best_sink
    while cursor is not None:
        main_path.append(cursor)
        cursor = previous[cursor]
    main_path.reverse()

    collapsed = [stage_id for stage_id in ordered_stage_ids if stage_id not in main_path]
    return {"main_path_stage_ids": main_path, "collapsed_stage_ids": collapsed}


@router.post("/transform-stream")
async def transform_notebook_stream(req: TransformNotebookRequest) -> StreamingResponse:
    """Streaming variant: emits SSE events as AI generates nodes."""

    async def event_generator():
        try:
            from app.services.ai_model_service import (
                _gemini_key,
                _gemini_model,
                _gemini_endpoint,
                _gemini_stream_endpoint,
                _extract_json,
                _send_gemini_request,
            )
            import httpx

            key = _gemini_key()
            model_name = _gemini_model()
            url = _gemini_stream_endpoint(model_name)
            fallback_url = _gemini_endpoint(model_name)
            yield _sse("status", {"message": "Reading notebook..."})
            yield _sse("status", {"message": "Finding the workflow stages..."})
            sections = plan_notebook_sections(req.cells, req.pipeline_name, _plan_sections_with_ai)
            analysis = analyze_notebook(req.cells, sections)
            yield _sse("analysis", analysis.model_dump(mode="json"))
            yield _sse("stage_plan", {
                "stages": [section.model_dump(mode="json") for section in sections],
            })
            for section in sections:
                yield _sse("stage_progress", {
                    "stage_id": section.id,
                    "stage_name": section.name,
                    "state": "queued",
                })

            if _should_use_multi_pass(analysis, sections):
                yield _sse("status", {"message": "Building notebook transformations..."})
                stage_results_by_id: dict[str, dict[str, Any]] = {}
                nodes_emitted = 0
                pending_sections = list(sections)
                in_flight: dict[asyncio.Task, NotebookSection] = {}
                concurrency_limit = 3

                def _start_stage_task(section: NotebookSection, index: int) -> tuple[str, str]:
                    yield_event_status = _sse("stage_progress", {
                        "stage_id": section.id,
                        "stage_name": section.name,
                        "state": "building",
                    })
                    yield_event_message = _sse("status", {"message": f"Building stage {index + 1}/{len(sections)}: {section.name}"})
                    nonlocal in_flight
                    task = asyncio.create_task(asyncio.to_thread(
                        _generate_parsed_stage_result,
                        key=key,
                        url=fallback_url,
                        cells=req.cells,
                        pipeline_name=req.pipeline_name,
                        section=section,
                        sections=sections,
                        send_gemini_request=_send_gemini_request,
                    ))
                    in_flight[task] = section
                    return yield_event_status, yield_event_message

                while pending_sections and len(in_flight) < concurrency_limit:
                    section = pending_sections.pop(0)
                    status_event, message_event = _start_stage_task(section, sections.index(section))
                    yield status_event
                    yield message_event

                failed_stage_ids: set[str] = set()
                while in_flight:
                    done, _pending = await asyncio.wait(in_flight.keys(), return_when=asyncio.FIRST_COMPLETED)
                    for task in done:
                        section = in_flight.pop(task)
                        try:
                            stage_result = task.result()
                        except Exception as exc:
                            failed_stage_ids.add(section.id)
                            yield _sse("warning", {"message": f"Stage '{section.name}' needs review: {exc}"})
                            yield _sse("stage_progress", {
                                "stage_id": section.id,
                                "stage_name": section.name,
                                "state": "needs_review",
                            })
                        else:
                            stage_results_by_id[section.id] = stage_result
                            for warning in stage_result.get("warnings", []):
                                yield _sse("warning", {"message": warning})
                            for stage_node in stage_result["nodes"]:
                                yield _sse("node", {"index": nodes_emitted, "node": stage_node.model_dump(mode="json")})
                                nodes_emitted += 1
                            yield _sse("stage_progress", {
                                "stage_id": section.id,
                                "stage_name": section.name,
                                "state": "done",
                            })

                        if pending_sections:
                            next_section = pending_sections.pop(0)
                            status_event, message_event = _start_stage_task(next_section, sections.index(next_section))
                            yield status_event
                            yield message_event

                successful_sections = [section for section in sections if section.id in stage_results_by_id]
                stage_results = [stage_results_by_id[section.id] for section in successful_sections]
                if not stage_results:
                    yield _sse("error", {"message": "Notebook import failed: no stages were generated successfully."})
                    return

                yield _sse("status", {"message": "Connecting workflow..."})
                synthesis = _synthesize_workflow_with_ai(
                    key=key,
                    url=fallback_url,
                    sections=successful_sections,
                    stage_results=stage_results,
                    send_gemini_request=_send_gemini_request,
                )
                nodes, edges, warnings, workflow = _stitch_stage_results(successful_sections, stage_results, synthesis)
                yield _sse("workflow", workflow)
                for warning in warnings:
                    yield _sse("warning", {"message": warning})
                yield _sse("status", {"message": "Preparing workflow map..."})
                yield _sse("complete", {
                    "ok": True,
                    "sections": [section.model_dump(mode="json") for section in successful_sections],
                    "nodes": [node.model_dump(mode="json") for node in nodes],
                    "edges": [edge.model_dump(mode="json") for edge in edges],
                    "warnings": warnings,
                })
                return

            user_prompt = _build_transform_prompt(req.cells, req.pipeline_name)
            section_summary = _summarize_sections_for_transform(sections)
            if section_summary:
                user_prompt = f"{user_prompt}\n\n{section_summary}"

            payload = {
                "system_instruction": {"parts": [{"text": _TRANSFORM_SYSTEM}]},
                "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                "generationConfig": {
                    "temperature": 0.2,
                    "maxOutputTokens": 65536,
                    # No responseMimeType — streaming conflicts with it
                },
            }

            yield _sse("status", {"message": "Building notebook transformations..."})

            # Stream directly from Gemini SSE (inline, no task/future)
            full_text = ""
            nodes_emitted = 0
            timeout = httpx.Timeout(connect=30.0, read=60.0, write=30.0, pool=30.0)
            stream_failed = False
            received_text = False
            stages_started: set[str] = set()

            try:
                async with httpx.AsyncClient(timeout=timeout) as client:
                    stream_params = {"key": key, "alt": "sse"}
                    async with client.stream("POST", url, params=stream_params, json=payload) as response:
                        if response.status_code >= 400:
                            body = await response.aread()
                            yield _sse("error", {"message": f"Gemini returned {response.status_code}: {body.decode(errors='replace')[:500]}"})
                            return

                        async for line in response.aiter_lines():
                            if not line.startswith("data: "):
                                continue
                            chunk_json = line[6:]
                            try:
                                chunk = json.loads(chunk_json)
                            except json.JSONDecodeError:
                                continue

                            # Extract text from chunk
                            try:
                                text_part = chunk["candidates"][0]["content"]["parts"][0]["text"]
                                if not received_text:
                                    received_text = True
                                    yield _sse("status", {"message": "Generating notebook steps..."})
                                full_text += text_part
                                yield _sse("text", {"chunk": text_part})

                                # Try to extract complete nodes incrementally
                                all_nodes, _ = _try_extract_nodes_incrementally(full_text)
                                while nodes_emitted < len(all_nodes):
                                    parsed_nodes, parse_warnings = _parse_transform_nodes_with_context([all_nodes[nodes_emitted]], req.cells)
                                    node_data = parsed_nodes[0]
                                    for warning in parse_warnings:
                                        yield _sse("warning", {"message": warning})
                                    assigned_node = _assign_groups_to_nodes([node_data], sections)[0]
                                    if assigned_node.group_id and assigned_node.group_id not in stages_started:
                                        stages_started.add(assigned_node.group_id)
                                        yield _sse("stage_progress", {
                                            "stage_id": assigned_node.group_id,
                                            "stage_name": assigned_node.group_name,
                                            "state": "building",
                                        })
                                        yield _sse("status", {"message": f"Building stage: {assigned_node.group_name or assigned_node.group_id}"})
                                    yield _sse("node", {"index": nodes_emitted, "node": assigned_node.model_dump(mode="json")})
                                    nodes_emitted += 1

                            except (KeyError, IndexError):
                                # Non-text chunk (usage metadata), skip
                                pass
            except Exception:
                stream_failed = True

            if stream_failed or not full_text:
                yield _sse("status", {"message": "Streaming stalled; retrying without streaming..."})
                fallback_payload = {
                    **payload,
                    "generationConfig": {
                        **payload.get("generationConfig", {}),
                        "responseMimeType": "application/json",
                    },
                }
                parsed_json = _send_gemini_request(fallback_url, {"key": key}, fallback_payload)
            else:
                _log.debug("Notebook transform streamed %d chars", len(full_text))

                # Parse the complete JSON
                try:
                    yield _sse("status", {"message": "Finalizing notebook import..."})
                    parsed_json = _extract_json(full_text)
                except Exception as parse_exc:
                    yield _sse("error", {"message": f"Failed to parse AI response as JSON: {parse_exc}"})
                    return

            nodes, parse_warnings = _parse_transform_nodes_with_context(parsed_json.get("nodes", []), req.cells)
            nodes = _assign_groups_to_nodes(nodes, sections)
            edges = [TransformEdgeDef(**e) for e in parsed_json.get("edges", [])]
            warnings = [*parsed_json.get("warnings", []), *parse_warnings]
            yield _sse("status", {"message": "Connecting workflow..."})
            workflow = _workflow_summary(sections, nodes, edges)
            yield _sse("workflow", workflow)

            for section in sections:
                yield _sse("stage_progress", {
                    "stage_id": section.id,
                    "stage_name": section.name,
                    "state": "done",
                })

            for warning in warnings:
                yield _sse("warning", {"message": warning})

            yield _sse("status", {"message": "Preparing workflow map..."})

            # Emit any remaining nodes not yet emitted
            while nodes_emitted < len(nodes):
                yield _sse("node", {"index": nodes_emitted, "node": nodes[nodes_emitted].model_dump(mode="json")})
                nodes_emitted += 1

            yield _sse("complete", {
                "ok": True,
                "sections": [section.model_dump(mode="json") for section in sections],
                "nodes": [node.model_dump(mode="json") for node in nodes],
                "edges": [edge.model_dump(mode="json") for edge in edges],
                "warnings": warnings,
            })

        except Exception as exc:
            _log.exception("Notebook transform stream failed")
            msg = str(exc)
            if hasattr(exc, "detail"):
                detail = exc.detail
                if isinstance(detail, dict):
                    errors = detail.get("errors", [])
                    if errors:
                        msg = errors[0].get("message", msg)
                else:
                    msg = str(detail)
            if not msg:
                msg = f"{type(exc).__name__}: {repr(exc)}"
            yield _sse("error", {"message": msg})

    return StreamingResponse(event_generator(), media_type="text/event-stream")


def _sse(event: str, data: Any) -> str:
    """Format a single SSE event."""
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"
