from __future__ import annotations

import json
import time

import httpx
from fastapi.testclient import TestClient

from app.main import app
from app.schemas.notebook import NotebookAnalysis, NotebookSection


client = TestClient(app)


def _parse_sse_events(body: str) -> list[tuple[str, dict]]:
    events: list[tuple[str, dict]] = []
    current_event: str | None = None
    for line in body.splitlines():
        if line.startswith("event: "):
            current_event = line.removeprefix("event: ").strip()
        elif line.startswith("data: ") and current_event:
            events.append((current_event, json.loads(line.removeprefix("data: "))))
            current_event = None
    return events


def test_transform_notebook_stream_falls_back_when_streaming_times_out(monkeypatch):
    class BrokenAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        def stream(self, *args, **kwargs):
            raise httpx.ReadTimeout("timed out")

    def fake_send_gemini_request(url, params, payload):
        return {
            "nodes": [
                {
                    "type": "note",
                    "name": "Imported notebook",
                    "description": "Fallback import succeeded.",
                    "content": "Notebook import",
                    "original_cells": [0],
                }
            ],
            "edges": [],
            "warnings": [],
        }

    monkeypatch.setattr("httpx.AsyncClient", BrokenAsyncClient)
    monkeypatch.setattr("app.services.ai_model_service._gemini_key", lambda: "test-key")
    monkeypatch.setattr("app.services.ai_model_service._gemini_model", lambda: "gemini-test")
    monkeypatch.setattr("app.services.ai_model_service._gemini_stream_endpoint", lambda model: "https://example.test/stream")
    monkeypatch.setattr("app.services.ai_model_service._gemini_endpoint", lambda model: "https://example.test/generate")
    monkeypatch.setattr("app.services.ai_model_service._send_gemini_request", fake_send_gemini_request)

    with client.stream(
        "POST",
        "/api/notebook/transform-stream",
        json={
            "pipeline_name": "Notebook Import",
            "cells": [
                {"index": 0, "cell_type": "markdown", "source": "# Hello"},
            ],
        },
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: complete" in body
    assert "event: error" not in body
    assert 'Streaming stalled; retrying without streaming...' in body
    assert '"type": "note"' in body


def test_transform_notebook_stream_reports_intermediate_status_on_success(monkeypatch):
    class FakeStreamResponse:
        status_code = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def aread(self):
            return b""

        async def aiter_lines(self):
            yield (
                'data: {"candidates":[{"content":{"parts":[{"text":"'
                '{\\"nodes\\":[{\\"type\\":\\"note\\",\\"name\\":\\"Imported notebook\\",'
                '\\"description\\":\\"Streamed import succeeded.\\",\\"content\\":\\"Notebook import\\",'
                '\\"original_cells\\":[0]}],\\"edges\\":[],\\"warnings\\":[]}'
                '"}]}}]}'
            )

    class SuccessfulAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        def stream(self, *args, **kwargs):
            return FakeStreamResponse()

    monkeypatch.setattr("httpx.AsyncClient", SuccessfulAsyncClient)
    monkeypatch.setattr("app.services.ai_model_service._gemini_key", lambda: "test-key")
    monkeypatch.setattr("app.services.ai_model_service._gemini_model", lambda: "gemini-test")
    monkeypatch.setattr("app.services.ai_model_service._gemini_stream_endpoint", lambda model: "https://example.test/stream")
    monkeypatch.setattr("app.services.ai_model_service._gemini_endpoint", lambda model: "https://example.test/generate")

    with client.stream(
        "POST",
        "/api/notebook/transform-stream",
        json={
            "pipeline_name": "Notebook Import",
            "cells": [
                {"index": 0, "cell_type": "markdown", "source": "# Hello"},
            ],
        },
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: complete" in body
    assert "Reading notebook..." in body
    assert "Finding the workflow stages..." in body
    assert "event: analysis" in body


def test_transform_notebook_stream_emits_notebook_progress_events(monkeypatch):
    class FakeStreamResponse:
        status_code = 200

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        async def aread(self):
            return b""

        async def aiter_lines(self):
            yield (
                'data: {"candidates":[{"content":{"parts":[{"text":"'
                '{\\"nodes\\":['
                '{\\"type\\":\\"data_source\\",\\"name\\":\\"Profiles\\",\\"description\\":\\"Loads profiles\\",\\"original_cells\\":[1]},'
                '{\\"type\\":\\"code\\",\\"name\\":\\"Prepare materials\\",\\"description\\":\\"Prepares materials\\",\\"code\\":\\"df_out = df_in\\",\\"original_cells\\":[2]},'
                '{\\"type\\":\\"output\\",\\"name\\":\\"Distribution table\\",\\"description\\":\\"Shows distribution\\",\\"output_mode\\":\\"table\\",\\"original_cells\\":[3]}'
                '],\\"edges\\":[{\\"from_index\\":0,\\"to_index\\":1},{\\"from_index\\":1,\\"to_index\\":2}],\\"warnings\\":[]}'
                '"}]}}]}'
            )

    class SuccessfulAsyncClient:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, exc_type, exc, tb):
            return None

        def stream(self, *args, **kwargs):
            return FakeStreamResponse()

    def fake_send_gemini_request(url, params, payload):
        system_text = payload.get("system_instruction", {}).get("parts", [{}])[0].get("text", "")
        if "section plan" in system_text.lower():
            return {
                "sections": [
                    {"id": "sec_ingest", "name": "Load inputs", "purpose": "Loads source tables.", "cell_indices": [1]},
                    {"id": "sec_prepare", "name": "Prepare materials", "purpose": "Cleans and reshapes materials.", "cell_indices": [2]},
                    {"id": "sec_output", "name": "Generate outputs", "purpose": "Builds summary outputs.", "cell_indices": [3]},
                ]
            }
        return {"nodes": [], "edges": [], "warnings": []}

    monkeypatch.setattr("httpx.AsyncClient", SuccessfulAsyncClient)
    monkeypatch.setattr("app.services.ai_model_service._gemini_key", lambda: "test-key")
    monkeypatch.setattr("app.services.ai_model_service._gemini_model", lambda: "gemini-test")
    monkeypatch.setattr("app.services.ai_model_service._gemini_stream_endpoint", lambda model: "https://example.test/stream")
    monkeypatch.setattr("app.services.ai_model_service._gemini_endpoint", lambda model: "https://example.test/generate")
    monkeypatch.setattr("app.services.ai_model_service._send_gemini_request", fake_send_gemini_request)

    with client.stream(
        "POST",
        "/api/notebook/transform-stream",
        json={
            "pipeline_name": "Notebook Import",
            "cells": [
                {"index": 0, "cell_type": "markdown", "source": "# Notebook"},
                {"index": 1, "cell_type": "code", "source": 'profiles = pd.read_excel("profiles.xlsx")'},
                {"index": 2, "cell_type": "code", "source": "materials = profiles.merge(products)"},
                {"index": 3, "cell_type": "code", "source": "materials.head()"},
            ],
        },
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    assert "event: analysis" in body
    assert '"complexity_tier":' in body
    assert "event: stage_plan" in body
    assert '"name": "Load inputs"' in body
    assert "event: stage_progress" in body
    assert '"state": "queued"' in body
    assert '"state": "done"' in body
    assert "event: workflow" in body
    assert '"main_path_stage_ids": ["sec_ingest", "sec_prepare", "sec_output"]' in body


def test_transform_notebook_uses_stage_generation_and_synthesis_for_large_notebook(monkeypatch):
    calls: list[str] = []

    def fake_send_gemini_request(url, params, payload):
        system_text = payload.get("system_instruction", {}).get("parts", [{}])[0].get("text", "")
        user_text = payload.get("contents", [{}])[0].get("parts", [{}])[0].get("text", "")
        if "section plan" in system_text.lower():
            calls.append("plan")
            return {
                "sections": [
                    {"id": "sec_ingest", "name": "Load inputs", "purpose": "Loads source tables.", "cell_indices": [1]},
                    {"id": "sec_prepare", "name": "Prepare materials", "purpose": "Cleans and reshapes materials.", "cell_indices": [2]},
                    {"id": "sec_output", "name": "Generate outputs", "purpose": "Builds outputs.", "cell_indices": [3]},
                ]
            }
        if "single notebook stage" in system_text.lower():
            if "Load inputs" in user_text:
                calls.append("stage:ingest")
                return {
                    "nodes": [
                        {"type": "data_source", "name": "Profiles", "description": "Loads profiles.", "original_cells": [1]},
                    ],
                    "edges": [],
                    "warnings": [],
                    "key_outputs": ["Profiles"],
                }
            if "Prepare materials" in user_text:
                calls.append("stage:prepare")
                return {
                    "nodes": [
                        {"type": "code", "name": "Prepare materials", "description": "Prepares materials.", "code": "df_out = df_in", "original_cells": [2]},
                    ],
                    "edges": [],
                    "warnings": [],
                    "key_inputs": ["Profiles"],
                    "key_outputs": ["Prepared materials"],
                }
            calls.append("stage:output")
            return {
                "nodes": [
                    {"type": "output", "name": "Distribution table", "description": "Displays outputs.", "output_mode": "table", "original_cells": [3]},
                ],
                "edges": [],
                "warnings": [],
                "key_inputs": ["Prepared materials"],
                "key_outputs": ["Distribution table"],
            }
        if "workflow synthesizer" in system_text.lower():
            calls.append("synthesis")
            return {
                "cross_stage_edges": [
                    {"from_stage_id": "sec_ingest", "from_node_index": 0, "to_stage_id": "sec_prepare", "to_node_index": 0},
                    {"from_stage_id": "sec_prepare", "from_node_index": 0, "to_stage_id": "sec_output", "to_node_index": 0},
                ],
                "main_path_stage_ids": ["sec_ingest", "sec_prepare", "sec_output"],
                "warnings": [],
            }
        calls.append("monolith")
        return {"nodes": [], "edges": [], "warnings": []}

    monkeypatch.setattr("app.services.ai_model_service._gemini_key", lambda: "test-key")
    monkeypatch.setattr("app.services.ai_model_service._gemini_model", lambda: "gemini-test")
    monkeypatch.setattr("app.services.ai_model_service._gemini_endpoint", lambda model: "https://example.test/generate")
    monkeypatch.setattr("app.services.ai_model_service._send_gemini_request", fake_send_gemini_request)
    monkeypatch.setattr("app.api.routes_notebook.analyze_notebook", lambda *args, **kwargs: NotebookAnalysis(
        total_cells=9, code_cell_count=8, markdown_cell_count=2, output_cell_count=1, export_cell_count=1, stage_count=2, complexity_tier="large",
    ))

    response = client.post(
        "/api/notebook/transform",
        json={
            "pipeline_name": "Notebook Import",
            "cells": [
                {"index": 0, "cell_type": "markdown", "source": "# Notebook"},
                {"index": 1, "cell_type": "code", "source": 'profiles = pd.read_excel("profiles.xlsx")'},
                {"index": 2, "cell_type": "code", "source": "materials = profiles.merge(products)"},
                {"index": 3, "cell_type": "code", "source": "materials.head()"},
                {"index": 4, "cell_type": "code", "source": "materials.to_csv('out.csv')"},
                {"index": 5, "cell_type": "code", "source": "materials.plot()"},
                {"index": 6, "cell_type": "code", "source": "summary = materials.groupby('type').sum()"},
                {"index": 7, "cell_type": "code", "source": "summary.head()"},
                {"index": 8, "cell_type": "code", "source": "summary.to_csv('summary.csv')"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert [node["name"] for node in body["nodes"]] == ["Profiles", "Prepare materials", "Distribution table"]
    assert body["edges"] == [{"from_index": 0, "to_index": 1}, {"from_index": 1, "to_index": 2}]
    assert [node["group_id"] for node in body["nodes"]] == ["sec_ingest", "sec_prepare", "sec_output"]
    assert calls == ["plan", "stage:ingest", "stage:prepare", "stage:output", "synthesis"]


def test_transform_notebook_coerces_generic_stage_node_types(monkeypatch):
    def fake_send_gemini_request(url, params, payload):
        system_text = payload.get("system_instruction", {}).get("parts", [{}])[0].get("text", "")
        user_text = payload.get("contents", [{}])[0].get("parts", [{}])[0].get("text", "")
        if "section plan" in system_text.lower():
            return {
                "sections": [
                    {"id": "sec_ingest", "name": "Load inputs", "purpose": "Loads source tables.", "cell_indices": [1]},
                    {"id": "sec_output", "name": "Generate outputs", "purpose": "Displays outputs.", "cell_indices": [2]},
                ]
            }
        if "single notebook stage" in system_text.lower():
            if "Load inputs" in user_text:
                return {
                    "nodes": [
                        {"type": "data_source", "name": "Profiles", "description": "Loads profiles.", "original_cells": [1]},
                    ],
                    "edges": [],
                    "warnings": [],
                    "key_outputs": ["Profiles"],
                }
            return {
                "nodes": [
                    {
                        "type": "generic",
                        "name": "Distribution table",
                        "description": "Displays outputs.",
                        "output_mode": "table",
                        "original_cells": [2],
                    },
                ],
                "edges": [],
                "warnings": [],
                "key_inputs": ["Profiles"],
                "key_outputs": ["Distribution table"],
            }
        if "workflow synthesizer" in system_text.lower():
            return {
                "cross_stage_edges": [
                    {"from_stage_id": "sec_ingest", "from_node_index": 0, "to_stage_id": "sec_output", "to_node_index": 0},
                ],
                "main_path_stage_ids": ["sec_ingest", "sec_output"],
                "warnings": [],
            }
        return {"nodes": [], "edges": [], "warnings": []}

    monkeypatch.setattr("app.services.ai_model_service._gemini_key", lambda: "test-key")
    monkeypatch.setattr("app.services.ai_model_service._gemini_model", lambda: "gemini-test")
    monkeypatch.setattr("app.services.ai_model_service._gemini_endpoint", lambda model: "https://example.test/generate")
    monkeypatch.setattr("app.services.ai_model_service._send_gemini_request", fake_send_gemini_request)
    monkeypatch.setattr("app.api.routes_notebook.analyze_notebook", lambda *args, **kwargs: NotebookAnalysis(
        total_cells=9, code_cell_count=8, markdown_cell_count=2, output_cell_count=1, export_cell_count=1, stage_count=2, complexity_tier="large",
    ))

    response = client.post(
        "/api/notebook/transform",
        json={
            "pipeline_name": "Notebook Import",
            "cells": [
                {"index": 0, "cell_type": "markdown", "source": "# Notebook"},
                {"index": 1, "cell_type": "code", "source": 'profiles = pd.read_excel("profiles.xlsx")'},
                {"index": 2, "cell_type": "code", "source": "profiles.head()"},
                {"index": 3, "cell_type": "code", "source": "profiles.to_csv('summary.csv')"},
                {"index": 4, "cell_type": "code", "source": "profiles.describe()"},
                {"index": 5, "cell_type": "code", "source": "profiles.plot()"},
                {"index": 6, "cell_type": "code", "source": "profiles.groupby('type').sum()"},
                {"index": 7, "cell_type": "code", "source": "profiles.tail()"},
                {"index": 8, "cell_type": "code", "source": "profiles.info()"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert [node["type"] for node in body["nodes"]] == ["data_source", "output"]
    assert body["warnings"] == [
        "Coerced unsupported notebook node type 'generic' to 'output' for 'Distribution table'.",
    ]


def test_transform_notebook_infers_stage_node_types_from_cell_code(monkeypatch):
    def fake_send_gemini_request(url, params, payload):
        system_text = payload.get("system_instruction", {}).get("parts", [{}])[0].get("text", "")
        user_text = payload.get("contents", [{}])[0].get("parts", [{}])[0].get("text", "")
        if "section plan" in system_text.lower():
            return {
                "sections": [
                    {"id": "sec_inputs", "name": "Load inputs", "purpose": "Loads source tables.", "cell_indices": [1]},
                    {"id": "sec_prepare", "name": "Prepare data", "purpose": "Combines inputs.", "cell_indices": [2]},
                    {"id": "sec_exports", "name": "Export results", "purpose": "Writes outputs.", "cell_indices": [3]},
                ]
            }
        if "single notebook stage" in system_text.lower():
            if "Load inputs" in user_text:
                return {
                    "nodes": [
                        {"type": "data_loading", "name": "load_building_profiles", "description": "Loads Excel input.", "original_cells": [1]},
                    ],
                    "edges": [],
                    "warnings": [],
                    "key_outputs": ["Profiles"],
                }
            if "Prepare data" in user_text:
                return {
                    "nodes": [
                        {"type": "unknown", "name": "merge_and_filter_materials", "description": "Merges and filters inputs.", "original_cells": [2]},
                    ],
                    "edges": [],
                    "warnings": [],
                    "key_inputs": ["Profiles"],
                    "key_outputs": ["Prepared materials"],
                }
            return {
                "nodes": [
                    {"type": "io", "name": "export_building_elements", "description": "Writes Excel output.", "original_cells": [3]},
                ],
                "edges": [],
                "warnings": [],
                "key_inputs": ["Prepared materials"],
                "key_outputs": ["Exported workbook"],
            }
        if "workflow synthesizer" in system_text.lower():
            return {
                "cross_stage_edges": [
                    {"from_stage_id": "sec_inputs", "from_node_index": 0, "to_stage_id": "sec_prepare", "to_node_index": 0},
                    {"from_stage_id": "sec_prepare", "from_node_index": 0, "to_stage_id": "sec_exports", "to_node_index": 0},
                ],
                "main_path_stage_ids": ["sec_inputs", "sec_prepare", "sec_exports"],
                "warnings": [],
            }
        return {"nodes": [], "edges": [], "warnings": []}

    monkeypatch.setattr("app.services.ai_model_service._gemini_key", lambda: "test-key")
    monkeypatch.setattr("app.services.ai_model_service._gemini_model", lambda: "gemini-test")
    monkeypatch.setattr("app.services.ai_model_service._gemini_endpoint", lambda model: "https://example.test/generate")
    monkeypatch.setattr("app.services.ai_model_service._send_gemini_request", fake_send_gemini_request)
    monkeypatch.setattr(
        "app.api.routes_notebook.analyze_notebook",
        lambda *args, **kwargs: NotebookAnalysis(
            total_cells=9,
            code_cell_count=8,
            markdown_cell_count=2,
            output_cell_count=1,
            export_cell_count=1,
            stage_count=2,
            complexity_tier="large",
        ),
    )

    response = client.post(
        "/api/notebook/transform",
        json={
            "pipeline_name": "Notebook Import",
            "cells": [
                {"index": 0, "cell_type": "markdown", "source": "# Notebook"},
                {"index": 1, "cell_type": "code", "source": 'profiles = pd.read_excel("profiles.xlsx")'},
                {"index": 2, "cell_type": "code", "source": 'materials = profiles.merge(products).query("kg > 0")'},
                {"index": 3, "cell_type": "code", "source": 'materials.to_excel("elements.xlsx")'},
                {"index": 4, "cell_type": "code", "source": "materials.describe()"},
                {"index": 5, "cell_type": "code", "source": "materials.plot()"},
                {"index": 6, "cell_type": "code", "source": "materials.groupby('type').sum()"},
                {"index": 7, "cell_type": "code", "source": "materials.head()"},
                {"index": 8, "cell_type": "code", "source": "materials.tail()"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert [node["type"] for node in body["nodes"]] == ["data_source", "code", "publish"]
    assert body["warnings"] == [
        "Coerced unsupported notebook node type 'data_loading' to 'data_source' for 'load_building_profiles'.",
        "Coerced unsupported notebook node type 'unknown' to 'code' for 'merge_and_filter_materials'.",
        "Recovered missing code for 'merge_and_filter_materials' from notebook cells.",
        "Coerced unsupported notebook node type 'io' to 'publish' for 'export_building_elements'.",
    ]


def test_transform_notebook_fills_missing_code_and_preserves_headers_as_notes(monkeypatch):
    def fake_send_gemini_request(url, params, payload):
        system_text = payload.get("system_instruction", {}).get("parts", [{}])[0].get("text", "")
        user_text = payload.get("contents", [{}])[0].get("parts", [{}])[0].get("text", "")
        if "section plan" in system_text.lower():
            return {
                "sections": [
                    {"id": "sec_notes", "name": "Header", "purpose": "Documents the analysis.", "cell_indices": [1]},
                    {"id": "sec_calc", "name": "Compute", "purpose": "Calculates results.", "cell_indices": [2]},
                ]
            }
        if "single notebook stage" in system_text.lower():
            if "Header" in user_text:
                return {
                    "nodes": [
                        {"type": "unknown", "name": "Heat Pumps Analysis Header", "description": "Section heading.", "original_cells": [1]},
                    ],
                    "edges": [],
                    "warnings": [],
                }
            return {
                "nodes": [
                    {"type": "code", "name": "Calculate HP Material Totals", "description": "Calculates totals.", "original_cells": [2]},
                ],
                "edges": [],
                "warnings": [],
            }
        if "workflow synthesizer" in system_text.lower():
            return {
                "cross_stage_edges": [],
                "main_path_stage_ids": ["sec_notes", "sec_calc"],
                "warnings": [],
            }
        return {"nodes": [], "edges": [], "warnings": []}

    monkeypatch.setattr("app.services.ai_model_service._gemini_key", lambda: "test-key")
    monkeypatch.setattr("app.services.ai_model_service._gemini_model", lambda: "gemini-test")
    monkeypatch.setattr("app.services.ai_model_service._gemini_endpoint", lambda model: "https://example.test/generate")
    monkeypatch.setattr("app.services.ai_model_service._send_gemini_request", fake_send_gemini_request)
    monkeypatch.setattr("app.api.routes_notebook.analyze_notebook", lambda *args, **kwargs: NotebookAnalysis(
        total_cells=9, code_cell_count=8, markdown_cell_count=2, output_cell_count=1, export_cell_count=1, stage_count=2, complexity_tier="large",
    ))

    response = client.post(
        "/api/notebook/transform",
        json={
            "pipeline_name": "Notebook Import",
            "cells": [
                {"index": 0, "cell_type": "markdown", "source": "# Notebook"},
                {"index": 1, "cell_type": "markdown", "source": "## Heat Pumps Analysis"},
                {"index": 2, "cell_type": "code", "source": "hp_totals = df.groupby('material').sum()"},
                {"index": 3, "cell_type": "code", "source": "hp_totals.head()"},
                {"index": 4, "cell_type": "code", "source": "hp_totals.plot()"},
                {"index": 5, "cell_type": "code", "source": "hp_totals.to_csv('hp.csv')"},
                {"index": 6, "cell_type": "code", "source": "hp_totals.describe()"},
                {"index": 7, "cell_type": "code", "source": "hp_totals.tail()"},
                {"index": 8, "cell_type": "code", "source": "hp_totals.info()"},
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["nodes"][0]["type"] == "note"
    assert body["nodes"][0]["content"] == "## Heat Pumps Analysis"
    assert body["nodes"][1]["type"] == "code"
    assert body["nodes"][1]["code"] == "hp_totals = df.groupby('material').sum()"


def test_transform_notebook_stream_preserves_section_order_when_stage_generation_completes_out_of_order(monkeypatch):
    sections = [
        NotebookSection(id="sec_ingest", name="Load inputs", purpose="Loads source tables.", cell_indices=[1]),
        NotebookSection(id="sec_prepare", name="Prepare materials", purpose="Combines inputs.", cell_indices=[2]),
        NotebookSection(id="sec_output", name="Generate outputs", purpose="Builds outputs.", cell_indices=[3]),
    ]

    def fake_generate_stage_with_ai(*, section, **kwargs):
        if section.id == "sec_ingest":
            time.sleep(0.15)
            return {
                "nodes": [{"type": "data_source", "name": "Profiles", "description": "Loads profiles.", "original_cells": [1]}],
                "edges": [],
                "warnings": [],
                "key_outputs": ["Profiles"],
            }
        if section.id == "sec_prepare":
            time.sleep(0.01)
            return {
                "nodes": [{"type": "code", "name": "Prepare materials", "description": "Prepares materials.", "code": "df_out = df_in", "original_cells": [2]}],
                "edges": [],
                "warnings": [],
                "key_inputs": ["Profiles"],
                "key_outputs": ["Prepared materials"],
            }
        time.sleep(0.05)
        return {
            "nodes": [{"type": "output", "name": "Distribution table", "description": "Displays outputs.", "output_mode": "table", "original_cells": [3]}],
            "edges": [],
            "warnings": [],
            "key_inputs": ["Prepared materials"],
            "key_outputs": ["Distribution table"],
        }

    monkeypatch.setattr("app.api.routes_notebook.plan_notebook_sections", lambda *args, **kwargs: sections)
    monkeypatch.setattr("app.api.routes_notebook.analyze_notebook", lambda *args, **kwargs: NotebookAnalysis(
        total_cells=9, code_cell_count=9, markdown_cell_count=1, output_cell_count=1, export_cell_count=0, stage_count=3, complexity_tier="large",
    ))
    monkeypatch.setattr("app.api.routes_notebook._generate_stage_with_ai", fake_generate_stage_with_ai)
    monkeypatch.setattr("app.api.routes_notebook._synthesize_workflow_with_ai", lambda **kwargs: {
        "cross_stage_edges": [
            {"from_stage_id": "sec_ingest", "from_node_index": 0, "to_stage_id": "sec_prepare", "to_node_index": 0},
            {"from_stage_id": "sec_prepare", "from_node_index": 0, "to_stage_id": "sec_output", "to_node_index": 0},
        ],
        "main_path_stage_ids": ["sec_ingest", "sec_prepare", "sec_output"],
        "warnings": [],
    })
    monkeypatch.setattr("app.services.ai_model_service._gemini_key", lambda: "test-key")
    monkeypatch.setattr("app.services.ai_model_service._gemini_model", lambda: "gemini-test")
    monkeypatch.setattr("app.services.ai_model_service._gemini_stream_endpoint", lambda model: "https://example.test/stream")
    monkeypatch.setattr("app.services.ai_model_service._gemini_endpoint", lambda model: "https://example.test/generate")
    monkeypatch.setattr("app.services.ai_model_service._send_gemini_request", lambda *args, **kwargs: {})

    with client.stream(
        "POST",
        "/api/notebook/transform-stream",
        json={
            "pipeline_name": "Notebook Import",
            "cells": [
                {"index": 0, "cell_type": "markdown", "source": "# Notebook"},
                {"index": 1, "cell_type": "code", "source": 'profiles = pd.read_excel("profiles.xlsx")'},
                {"index": 2, "cell_type": "code", "source": "materials = profiles.merge(products)"},
                {"index": 3, "cell_type": "code", "source": "materials.head()"},
            ],
        },
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    events = _parse_sse_events(body)
    node_names = [payload["node"]["name"] for event, payload in events if event == "node"]
    assert node_names == ["Prepare materials", "Distribution table", "Profiles"]
    done_stage_ids = [payload["stage_id"] for event, payload in events if event == "stage_progress" and payload["state"] == "done"]
    assert done_stage_ids == ["sec_prepare", "sec_output", "sec_ingest"]
    complete_payload = [payload for event, payload in events if event == "complete"][-1]
    assert [node["name"] for node in complete_payload["nodes"]] == ["Profiles", "Prepare materials", "Distribution table"]


def test_transform_notebook_stream_continues_when_one_stage_generation_fails(monkeypatch):
    sections = [
        NotebookSection(id="sec_ingest", name="Load inputs", purpose="Loads source tables.", cell_indices=[1]),
        NotebookSection(id="sec_prepare", name="Prepare materials", purpose="Combines inputs.", cell_indices=[2]),
        NotebookSection(id="sec_output", name="Generate outputs", purpose="Builds outputs.", cell_indices=[3]),
    ]

    def fake_generate_stage_with_ai(*, section, **kwargs):
        if section.id == "sec_prepare":
            raise RuntimeError("stage generation failed")
        if section.id == "sec_ingest":
            return {
                "nodes": [{"type": "data_source", "name": "Profiles", "description": "Loads profiles.", "original_cells": [1]}],
                "edges": [],
                "warnings": [],
                "key_outputs": ["Profiles"],
            }
        return {
            "nodes": [{"type": "output", "name": "Distribution table", "description": "Displays outputs.", "output_mode": "table", "original_cells": [3]}],
            "edges": [],
            "warnings": [],
            "key_inputs": ["Profiles"],
            "key_outputs": ["Distribution table"],
        }

    monkeypatch.setattr("app.api.routes_notebook.plan_notebook_sections", lambda *args, **kwargs: sections)
    monkeypatch.setattr("app.api.routes_notebook.analyze_notebook", lambda *args, **kwargs: NotebookAnalysis(
        total_cells=9, code_cell_count=9, markdown_cell_count=1, output_cell_count=1, export_cell_count=0, stage_count=3, complexity_tier="large",
    ))
    monkeypatch.setattr("app.api.routes_notebook._generate_stage_with_ai", fake_generate_stage_with_ai)
    monkeypatch.setattr("app.api.routes_notebook._synthesize_workflow_with_ai", lambda **kwargs: {
        "cross_stage_edges": [
            {"from_stage_id": "sec_ingest", "from_node_index": 0, "to_stage_id": "sec_output", "to_node_index": 0},
        ],
        "main_path_stage_ids": ["sec_ingest", "sec_output"],
        "warnings": [],
    })
    monkeypatch.setattr("app.services.ai_model_service._gemini_key", lambda: "test-key")
    monkeypatch.setattr("app.services.ai_model_service._gemini_model", lambda: "gemini-test")
    monkeypatch.setattr("app.services.ai_model_service._gemini_stream_endpoint", lambda model: "https://example.test/stream")
    monkeypatch.setattr("app.services.ai_model_service._gemini_endpoint", lambda model: "https://example.test/generate")
    monkeypatch.setattr("app.services.ai_model_service._send_gemini_request", lambda *args, **kwargs: {})

    with client.stream(
        "POST",
        "/api/notebook/transform-stream",
        json={
            "pipeline_name": "Notebook Import",
            "cells": [
                {"index": 0, "cell_type": "markdown", "source": "# Notebook"},
                {"index": 1, "cell_type": "code", "source": 'profiles = pd.read_excel("profiles.xlsx")'},
                {"index": 2, "cell_type": "code", "source": "materials = profiles.merge(products)"},
                {"index": 3, "cell_type": "code", "source": "materials.head()"},
            ],
        },
    ) as response:
        body = "".join(response.iter_text())

    assert response.status_code == 200
    events = _parse_sse_events(body)
    assert any(event == "complete" for event, _payload in events)
    assert any(event == "stage_progress" and payload["stage_id"] == "sec_prepare" and payload["state"] == "needs_review" for event, payload in events)
    assert any(event == "warning" and "Prepare materials" in payload["message"] for event, payload in events)
    complete_payload = [payload for event, payload in events if event == "complete"][-1]
    assert [node["name"] for node in complete_payload["nodes"]] == ["Profiles", "Distribution table"]
