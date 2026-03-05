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
    NotebookCell,
    ParseNotebookResponse,
    TransformNodeDef,
    TransformEdgeDef,
    TransformNotebookRequest,
    TransformNotebookResponse,
)

router = APIRouter(prefix="/api/notebook", tags=["notebook"])
_log = logging.getLogger(__name__)


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

        # Build the user prompt with all cells
        cell_descriptions = []
        for cell in req.cells:
            header = f"[Cell {cell.index}] ({cell.cell_type})"
            body = cell.source
            if cell.outputs_text:
                body += f"\n\n# Output:\n# {cell.outputs_text[:300]}"
            cell_descriptions.append(f"{header}\n```\n{body}\n```")

        user_prompt = (
            f"Convert this Jupyter notebook into a pipeline.\n"
            f"Notebook name: {req.pipeline_name}\n"
            f"Total cells: {len(req.cells)}\n\n"
            + "\n\n".join(cell_descriptions)
        )

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

        nodes = [TransformNodeDef(**n) for n in parsed.get("nodes", [])]
        edges = [TransformEdgeDef(**e) for e in parsed.get("edges", [])]
        warnings = parsed.get("warnings", [])

        return TransformNotebookResponse(
            ok=True,
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


@router.post("/transform-stream")
async def transform_notebook_stream(req: TransformNotebookRequest) -> StreamingResponse:
    """Streaming variant: emits SSE events as AI generates nodes."""

    async def event_generator():
        try:
            from app.services.ai_model_service import (
                _gemini_key,
                _gemini_model,
                _gemini_stream_endpoint,
                _extract_json,
            )
            import httpx

            key = _gemini_key()
            model_name = _gemini_model()
            url = _gemini_stream_endpoint(model_name)

            user_prompt = _build_transform_prompt(req.cells, req.pipeline_name)

            payload = {
                "system_instruction": {"parts": [{"text": _TRANSFORM_SYSTEM}]},
                "contents": [{"role": "user", "parts": [{"text": user_prompt}]}],
                "generationConfig": {
                    "temperature": 0.2,
                    "maxOutputTokens": 65536,
                    # No responseMimeType — streaming conflicts with it
                },
            }

            yield _sse("status", {"message": "Calling AI..."})

            # Stream directly from Gemini SSE (inline, no task/future)
            full_text = ""
            nodes_emitted = 0
            timeout = httpx.Timeout(connect=30.0, read=60.0, write=30.0, pool=30.0)

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
                            full_text += text_part
                            yield _sse("text", {"chunk": text_part})

                            # Try to extract complete nodes incrementally
                            all_nodes, _ = _try_extract_nodes_incrementally(full_text)
                            while nodes_emitted < len(all_nodes):
                                node_data = all_nodes[nodes_emitted]
                                yield _sse("node", {"index": nodes_emitted, "node": node_data})
                                nodes_emitted += 1

                        except (KeyError, IndexError):
                            # Non-text chunk (usage metadata), skip
                            pass

            if not full_text:
                yield _sse("error", {"message": "Gemini returned no text"})
                return

            _log.debug("Notebook transform streamed %d chars", len(full_text))

            # Parse the complete JSON
            try:
                parsed_json = _extract_json(full_text)
            except Exception as parse_exc:
                yield _sse("error", {"message": f"Failed to parse AI response as JSON: {parse_exc}"})
                return

            nodes = parsed_json.get("nodes", [])
            edges = parsed_json.get("edges", [])
            warnings = parsed_json.get("warnings", [])

            # Emit any remaining nodes not yet emitted
            while nodes_emitted < len(nodes):
                yield _sse("node", {"index": nodes_emitted, "node": nodes[nodes_emitted]})
                nodes_emitted += 1

            yield _sse("complete", {
                "ok": True,
                "nodes": nodes,
                "edges": edges,
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
