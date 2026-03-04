# Analysis Canvas Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Python analysis canvas where users build data pipelines visually with ReactFlow, executed via backend subprocesses.

**Architecture:** New `/analysis` page with ReactFlow canvas. Three node types (Data Source, Code, Output). Backend executes the DAG as subprocesses in topological order, caching intermediate DataFrames in memory. Clean execution boundary (`executor.py`) swappable from subprocess to Docker later.

**Tech Stack:** React 18, ReactFlow 11, Monaco Editor (`@monaco-editor/react`), FastAPI, pandas, subprocess, Parquet (pyarrow)

---

### Task 1: Install Monaco Editor dependency

**Files:**
- Modify: `frontend/package.json`

**Step 1: Install the package**

Run: `cd frontend && npm install @monaco-editor/react`

**Step 2: Verify install**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -c "monaco" || echo "ok"`
Expected: No new type errors from monaco.

**Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: add @monaco-editor/react dependency"
```

---

### Task 2: Add frontend types for analysis pipelines

**Files:**
- Modify: `frontend/src/types/model.ts:325-336` (AnalysisConfig type)

**Step 1: Add new types after the existing `DashboardDefinition` type**

Add these types to `frontend/src/types/model.ts` before the `AnalysisConfig` type:

```typescript
export type AnalysisNodeType = 'data_source' | 'code' | 'output';

export type AnalysisNode = {
  id: string;
  type: AnalysisNodeType;
  x: number;
  y: number;
  w?: number;
  h?: number;
  // data_source fields
  data_table_id?: string;
  // code fields
  code?: string;
  // output fields
  output_mode?: 'table' | 'bar' | 'line';
};

export type AnalysisEdge = {
  id: string;
  source: string;
  target: string;
};

export type AnalysisPipeline = {
  id: string;
  name: string;
  nodes: AnalysisNode[];
  edges: AnalysisEdge[];
};

export type AnalysisComponent = {
  id: string;
  name: string;
  description?: string;
  code: string;
};
```

**Step 2: Update the AnalysisConfig type to include pipelines and components**

Update the `AnalysisConfig` type at line ~325:

```typescript
export type AnalysisConfig = {
  scenarios: ScenarioDefinition[];
  defaults?: {
    baseline_scenario_id?: string;
    active_dashboard_id?: string;
    active_sensitivity_config_id?: string;
    active_optimisation_config_id?: string;
    active_pipeline_id?: string;
  };
  dashboards?: DashboardDefinition[];
  sensitivity_configs?: SensitivityConfig[];
  optimisation_configs?: OptimisationConfig[];
  pipelines?: AnalysisPipeline[];
  analysis_components?: AnalysisComponent[];
};
```

**Step 3: Type-check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No new errors from these types.

**Step 4: Commit**

```bash
git add frontend/src/types/model.ts
git commit -m "feat: add AnalysisPipeline, AnalysisNode, AnalysisEdge types"
```

---

### Task 3: Add backend Pydantic schemas for analysis

**Files:**
- Create: `backend/app/schemas/analysis.py`
- Modify: `backend/app/schemas/model.py:384-391` (AnalysisConfig)

**Step 1: Create the analysis schemas file**

Create `backend/app/schemas/analysis.py`:

```python
from typing import Literal, Optional
from pydantic import BaseModel, ConfigDict, Field


class AnalysisNode(BaseModel):
    id: str
    type: Literal["data_source", "code", "output"]
    x: float = 0
    y: float = 0
    w: Optional[float] = None
    h: Optional[float] = None
    data_table_id: Optional[str] = None
    code: Optional[str] = None
    output_mode: Optional[Literal["table", "bar", "line"]] = None

    model_config = ConfigDict(extra="forbid")


class AnalysisEdge(BaseModel):
    id: str
    source: str
    target: str

    model_config = ConfigDict(extra="forbid")


class AnalysisPipeline(BaseModel):
    id: str
    name: str
    nodes: list[AnalysisNode] = Field(default_factory=list)
    edges: list[AnalysisEdge] = Field(default_factory=list)

    model_config = ConfigDict(extra="forbid")


class AnalysisComponent(BaseModel):
    id: str
    name: str
    description: Optional[str] = None
    code: str

    model_config = ConfigDict(extra="forbid")


# --- Execution request/response ---

class DataTablePayload(BaseModel):
    columns: list[dict]
    rows: list[list]


class ExecuteNode(BaseModel):
    id: str
    type: Literal["data_source", "code", "output"]
    code: Optional[str] = None
    data_table: Optional[DataTablePayload] = None


class ExecuteEdge(BaseModel):
    source: str
    target: str


class ExecutePipelineRequest(BaseModel):
    pipeline_id: str
    run_from: Optional[str] = None
    nodes: list[ExecuteNode]
    edges: list[ExecuteEdge]


class NodeResultResponse(BaseModel):
    ok: bool
    preview: Optional[dict] = None
    shape: Optional[list[int]] = None
    logs: Optional[str] = None
    error: Optional[str] = None


class ExecutePipelineResponse(BaseModel):
    results: dict[str, NodeResultResponse]
```

**Step 2: Update AnalysisConfig in model.py**

In `backend/app/schemas/model.py`, add the import and update the AnalysisConfig class:

Add import near the top:
```python
from app.schemas.analysis import AnalysisPipeline, AnalysisComponent
```

Update `AnalysisConfig` class to add:
```python
class AnalysisConfig(BaseModel):
    scenarios: list[ScenarioDefinition] = Field(default_factory=list)
    dashboards: list[DashboardDefinition] = Field(default_factory=list)
    sensitivity_configs: list[SensitivityConfigSchema] = Field(default_factory=list)
    optimisation_configs: list[OptimisationConfigSchema] = Field(default_factory=list)
    pipelines: list[AnalysisPipeline] = Field(default_factory=list)
    analysis_components: list[AnalysisComponent] = Field(default_factory=list)
    defaults: AnalysisDefaults = Field(default_factory=AnalysisDefaults)

    model_config = ConfigDict(extra="forbid")
```

Also add `active_pipeline_id` to `AnalysisDefaults`:
```python
class AnalysisDefaults(BaseModel):
    baseline_scenario_id: Optional[str] = None
    active_dashboard_id: Optional[str] = None
    active_sensitivity_config_id: Optional[str] = None
    active_optimisation_config_id: Optional[str] = None
    active_pipeline_id: Optional[str] = None

    model_config = ConfigDict(extra="forbid")
```

**Step 3: Run backend tests**

Run: `make test-backend`
Expected: Same 2 pre-existing failures only (test_imports_api).

**Step 4: Commit**

```bash
git add backend/app/schemas/analysis.py backend/app/schemas/model.py
git commit -m "feat: add Pydantic schemas for analysis pipelines and execution"
```

---

### Task 4: Build the backend execution engine

**Files:**
- Create: `backend/app/analysis/__init__.py`
- Create: `backend/app/analysis/executor.py`
- Create: `backend/app/analysis/runner_script.py`
- Create: `backend/app/analysis/cache.py`
- Test: `backend/tests/unit/test_analysis_executor.py`

**Step 1: Write the tests**

Create `backend/tests/unit/test_analysis_executor.py`:

```python
import pandas as pd
import pytest
from app.analysis.executor import execute_node, NodeResult
from app.analysis.cache import PipelineCache


def test_execute_simple_code():
    """A code node that doubles a column should return the modified DataFrame."""
    input_df = pd.DataFrame({"x": [1, 2, 3]})
    result = execute_node(
        code="df['y'] = df['x'] * 2",
        inputs={"df": input_df},
        timeout=10,
    )
    assert result.ok
    assert result.output_df is not None
    assert list(result.output_df["y"]) == [2, 4, 6]


def test_execute_syntax_error():
    """A syntax error should return ok=False with an error message."""
    input_df = pd.DataFrame({"x": [1]})
    result = execute_node(
        code="df['y' = bad syntax",
        inputs={"df": input_df},
        timeout=10,
    )
    assert not result.ok
    assert result.error is not None
    assert "SyntaxError" in result.error


def test_execute_runtime_error():
    """A runtime error should return ok=False with traceback."""
    input_df = pd.DataFrame({"x": [1]})
    result = execute_node(
        code="df = df['nonexistent_column']",
        inputs={"df": input_df},
        timeout=10,
    )
    assert not result.ok
    assert result.error is not None


def test_execute_timeout():
    """An infinite loop should be killed after timeout."""
    input_df = pd.DataFrame({"x": [1]})
    result = execute_node(
        code="while True: pass",
        inputs={"df": input_df},
        timeout=2,
    )
    assert not result.ok
    assert "timeout" in (result.error or "").lower()


def test_execute_multiple_inputs():
    """A node with multiple inputs should get df1, df2."""
    df1 = pd.DataFrame({"a": [1, 2]})
    df2 = pd.DataFrame({"b": [3, 4]})
    result = execute_node(
        code="df = pd.concat([df1, df2], axis=1)",
        inputs={"df1": df1, "df2": df2},
        timeout=10,
    )
    assert result.ok
    assert list(result.output_df.columns) == ["a", "b"]


def test_cache_store_and_retrieve():
    """Cache should store and retrieve DataFrames by pipeline+node ID."""
    cache = PipelineCache()
    test_df = pd.DataFrame({"x": [1, 2, 3]})
    cache.set("pipe1", "node1", test_df)
    result = cache.get("pipe1", "node1")
    assert result is not None
    assert list(result["x"]) == [1, 2, 3]


def test_cache_invalidate():
    """Invalidating a node should clear it and downstream entries."""
    cache = PipelineCache()
    cache.set("pipe1", "n1", pd.DataFrame({"x": [1]}))
    cache.set("pipe1", "n2", pd.DataFrame({"x": [2]}))
    cache.invalidate("pipe1", "n1")
    assert cache.get("pipe1", "n1") is None
    # n2 is still there (downstream invalidation happens at executor level)
    assert cache.get("pipe1", "n2") is not None


def test_cache_clear_pipeline():
    """Clearing a pipeline should remove all its entries."""
    cache = PipelineCache()
    cache.set("pipe1", "n1", pd.DataFrame({"x": [1]}))
    cache.set("pipe1", "n2", pd.DataFrame({"x": [2]}))
    cache.clear_pipeline("pipe1")
    assert cache.get("pipe1", "n1") is None
    assert cache.get("pipe1", "n2") is None
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/unit/test_analysis_executor.py -v`
Expected: FAIL (modules don't exist yet)

**Step 3: Implement the cache**

Create `backend/app/analysis/__init__.py` (empty file).

Create `backend/app/analysis/cache.py`:

```python
import pandas as pd


class PipelineCache:
    """In-memory cache for pipeline node results. Keyed by (pipeline_id, node_id)."""

    def __init__(self) -> None:
        self._store: dict[tuple[str, str], pd.DataFrame] = {}

    def get(self, pipeline_id: str, node_id: str) -> pd.DataFrame | None:
        return self._store.get((pipeline_id, node_id))

    def set(self, pipeline_id: str, node_id: str, df: pd.DataFrame) -> None:
        self._store[(pipeline_id, node_id)] = df

    def invalidate(self, pipeline_id: str, node_id: str) -> None:
        self._store.pop((pipeline_id, node_id), None)

    def clear_pipeline(self, pipeline_id: str) -> None:
        keys = [k for k in self._store if k[0] == pipeline_id]
        for k in keys:
            del self._store[k]

    def clear_all(self) -> None:
        self._store.clear()


# Singleton instance used by the executor and API
pipeline_cache = PipelineCache()
```

**Step 4: Implement the runner script**

Create `backend/app/analysis/runner_script.py`:

```python
"""
Subprocess runner script for analysis nodes.
Protocol:
  - Reads a JSON manifest from stdin: { "inputs": { "df": <parquet_b64>, ... }, "code": "..." }
  - Executes the code with inputs loaded as DataFrames
  - Writes output: JSON { "ok": true, "output": <parquet_b64> } or { "ok": false, "error": "..." }
"""
import base64
import io
import json
import sys
import traceback


def main() -> None:
    try:
        import numpy as np
        import pandas as pd
        from scipy import stats  # noqa: F401 — available to user code

        manifest = json.loads(sys.stdin.read())
        code = manifest["code"]
        input_data = manifest.get("inputs", {})

        # Deserialize input DataFrames from base64 Parquet
        namespace: dict = {"pd": pd, "np": np, "stats": stats}
        for name, b64 in input_data.items():
            buf = io.BytesIO(base64.b64decode(b64))
            namespace[name] = pd.read_parquet(buf)

        # Execute user code
        exec(code, namespace)  # noqa: S102

        # Extract output DataFrame — must be named 'df'
        output_df = namespace.get("df")
        if output_df is None or not isinstance(output_df, pd.DataFrame):
            json.dump({"ok": False, "error": "Code must assign result to `df`"}, sys.stdout)
            return

        # Serialize output as base64 Parquet
        buf = io.BytesIO()
        output_df.to_parquet(buf, index=False)
        b64_out = base64.b64encode(buf.getvalue()).decode()

        json.dump({"ok": True, "output": b64_out}, sys.stdout)

    except Exception:
        json.dump({"ok": False, "error": traceback.format_exc()}, sys.stdout)


if __name__ == "__main__":
    main()
```

**Step 5: Implement the executor**

Create `backend/app/analysis/executor.py`:

```python
import base64
import io
import json
import subprocess
import sys
from dataclasses import dataclass, field
from pathlib import Path

import pandas as pd

RUNNER_SCRIPT = str(Path(__file__).parent / "runner_script.py")
DEFAULT_TIMEOUT = 30
DEFAULT_MEMORY_MB = 512


@dataclass
class NodeResult:
    ok: bool
    output_df: pd.DataFrame | None = None
    logs: str = ""
    error: str | None = None


def _serialize_df(df: pd.DataFrame) -> str:
    """Serialize DataFrame to base64 Parquet string."""
    buf = io.BytesIO()
    df.to_parquet(buf, index=False)
    return base64.b64encode(buf.getvalue()).decode()


def _deserialize_df(b64: str) -> pd.DataFrame:
    """Deserialize DataFrame from base64 Parquet string."""
    buf = io.BytesIO(base64.b64decode(b64))
    return pd.read_parquet(buf)


def execute_node(
    code: str,
    inputs: dict[str, pd.DataFrame],
    timeout: int = DEFAULT_TIMEOUT,
) -> NodeResult:
    """Execute a code node in a subprocess. This is the swappable boundary."""
    # Build manifest
    serialized_inputs = {name: _serialize_df(df) for name, df in inputs.items()}
    manifest = json.dumps({"code": code, "inputs": serialized_inputs})

    try:
        result = subprocess.run(
            [sys.executable, RUNNER_SCRIPT],
            input=manifest,
            capture_output=True,
            text=True,
            timeout=timeout,
        )
    except subprocess.TimeoutExpired:
        return NodeResult(ok=False, error=f"Timeout: node exceeded {timeout}s limit")

    stderr = result.stderr.strip()

    if result.returncode != 0:
        return NodeResult(ok=False, error=stderr or f"Process exited with code {result.returncode}", logs=stderr)

    try:
        output = json.loads(result.stdout)
    except json.JSONDecodeError:
        return NodeResult(ok=False, error="Invalid output from runner", logs=stderr)

    if not output.get("ok"):
        return NodeResult(ok=False, error=output.get("error", "Unknown error"), logs=stderr)

    output_df = _deserialize_df(output["output"])
    return NodeResult(ok=True, output_df=output_df, logs=stderr)
```

**Step 6: Run tests**

Run: `cd backend && python -m pytest tests/unit/test_analysis_executor.py -v`
Expected: All 8 tests pass. The timeout test will take ~2s.

**Step 7: Commit**

```bash
git add backend/app/analysis/ backend/tests/unit/test_analysis_executor.py
git commit -m "feat: add analysis pipeline executor with subprocess isolation and cache"
```

---

### Task 5: Add the backend API endpoint

**Files:**
- Create: `backend/app/api/routes_analysis.py`
- Modify: `backend/app/main.py` (register router)
- Test: `backend/tests/unit/test_analysis_api.py`

**Step 1: Write the test**

Create `backend/tests/unit/test_analysis_api.py`:

```python
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_execute_simple_pipeline():
    """A simple data_source → code → output pipeline should execute."""
    resp = client.post("/api/analysis/execute", json={
        "pipeline_id": "test_pipe",
        "nodes": [
            {
                "id": "n1",
                "type": "data_source",
                "data_table": {
                    "columns": [{"key": "x", "label": "X", "type": "number"}],
                    "rows": [[1], [2], [3]],
                },
            },
            {"id": "n2", "type": "code", "code": "df['y'] = df['x'] * 10"},
            {"id": "n3", "type": "output"},
        ],
        "edges": [
            {"source": "n1", "target": "n2"},
            {"source": "n2", "target": "n3"},
        ],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["results"]["n1"]["ok"]
    assert data["results"]["n2"]["ok"]
    assert data["results"]["n3"]["ok"]
    # Check n2 output has the computed column
    assert "y" in [c["key"] if isinstance(c, dict) else c for c in data["results"]["n2"]["preview"]["columns"]]


def test_execute_error_propagation():
    """If a node fails, downstream nodes should be skipped."""
    resp = client.post("/api/analysis/execute", json={
        "pipeline_id": "test_err",
        "nodes": [
            {
                "id": "n1",
                "type": "data_source",
                "data_table": {
                    "columns": [{"key": "x", "label": "X", "type": "number"}],
                    "rows": [[1]],
                },
            },
            {"id": "n2", "type": "code", "code": "raise ValueError('boom')"},
            {"id": "n3", "type": "output"},
        ],
        "edges": [
            {"source": "n1", "target": "n2"},
            {"source": "n2", "target": "n3"},
        ],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["results"]["n1"]["ok"]
    assert not data["results"]["n2"]["ok"]
    assert not data["results"]["n3"]["ok"]
    assert "upstream" in data["results"]["n3"]["error"].lower()
```

**Step 2: Run tests to verify they fail**

Run: `cd backend && python -m pytest tests/unit/test_analysis_api.py -v`
Expected: FAIL (route not found → 404)

**Step 3: Implement the API route**

Create `backend/app/api/routes_analysis.py`:

```python
from collections import defaultdict

import pandas as pd
from fastapi import APIRouter

from app.analysis.cache import pipeline_cache
from app.analysis.executor import execute_node
from app.schemas.analysis import (
    ExecutePipelineRequest,
    ExecutePipelineResponse,
    NodeResultResponse,
)

router = APIRouter(prefix="/api/analysis", tags=["analysis"])


def _topological_sort(node_ids: list[str], edges: list[dict]) -> list[str]:
    """Return node IDs in topological (dependency) order."""
    graph: dict[str, list[str]] = defaultdict(list)
    in_degree: dict[str, int] = {nid: 0 for nid in node_ids}
    for edge in edges:
        graph[edge["source"]].append(edge["target"])
        in_degree[edge["target"]] = in_degree.get(edge["target"], 0) + 1

    queue = [nid for nid in node_ids if in_degree[nid] == 0]
    order: list[str] = []
    while queue:
        node = queue.pop(0)
        order.append(node)
        for child in graph[node]:
            in_degree[child] -= 1
            if in_degree[child] == 0:
                queue.append(child)
    return order


def _df_preview(df: pd.DataFrame, max_rows: int = 100) -> dict:
    """Convert a DataFrame to a JSON-serializable preview."""
    columns = [{"key": col, "label": col, "type": "number" if pd.api.types.is_numeric_dtype(df[col]) else "string"} for col in df.columns]
    rows = df.head(max_rows).values.tolist()
    return {"columns": columns, "rows": rows}


@router.post("/execute", response_model=ExecutePipelineResponse)
def execute_pipeline(req: ExecutePipelineRequest) -> ExecutePipelineResponse:
    nodes_by_id = {n.id: n for n in req.nodes}
    edges_raw = [{"source": e.source, "target": e.target} for e in req.edges]

    # Build parent map: node_id → [parent_node_ids in edge order]
    parent_map: dict[str, list[str]] = defaultdict(list)
    for edge in req.edges:
        parent_map[edge.target].append(edge.source)

    order = _topological_sort(list(nodes_by_id.keys()), edges_raw)
    results: dict[str, NodeResultResponse] = {}
    failed: set[str] = set()

    for node_id in order:
        node = nodes_by_id[node_id]
        parents = parent_map.get(node_id, [])

        # Skip if any upstream failed
        if any(p in failed for p in parents):
            results[node_id] = NodeResultResponse(ok=False, error="Upstream node failed")
            failed.add(node_id)
            continue

        # Check cache (unless run_from targets this node or downstream)
        if req.run_from and req.run_from != node_id:
            cached = pipeline_cache.get(req.pipeline_id, node_id)
            if cached is not None:
                results[node_id] = NodeResultResponse(
                    ok=True,
                    preview=_df_preview(cached),
                    shape=list(cached.shape),
                )
                continue

        # --- Data Source node ---
        if node.type == "data_source":
            if not node.data_table:
                results[node_id] = NodeResultResponse(ok=False, error="No data table provided")
                failed.add(node_id)
                continue
            col_keys = [c["key"] for c in node.data_table.columns]
            df = pd.DataFrame(node.data_table.rows, columns=col_keys)
            # Coerce numeric columns
            for col_def in node.data_table.columns:
                if col_def.get("type") == "number":
                    df[col_def["key"]] = pd.to_numeric(df[col_def["key"]], errors="coerce")
            pipeline_cache.set(req.pipeline_id, node_id, df)
            results[node_id] = NodeResultResponse(
                ok=True,
                preview=_df_preview(df),
                shape=list(df.shape),
            )
            continue

        # --- Output node (pass-through) ---
        if node.type == "output":
            if parents:
                parent_df = pipeline_cache.get(req.pipeline_id, parents[0])
                if parent_df is not None:
                    pipeline_cache.set(req.pipeline_id, node_id, parent_df)
                    results[node_id] = NodeResultResponse(
                        ok=True,
                        preview=_df_preview(parent_df),
                        shape=list(parent_df.shape),
                    )
                    continue
            results[node_id] = NodeResultResponse(ok=False, error="No input data")
            failed.add(node_id)
            continue

        # --- Code node ---
        if node.type == "code":
            code = node.code or ""
            inputs: dict[str, pd.DataFrame] = {}
            if len(parents) == 1:
                parent_df = pipeline_cache.get(req.pipeline_id, parents[0])
                if parent_df is not None:
                    inputs["df"] = parent_df
            else:
                for i, pid in enumerate(parents):
                    parent_df = pipeline_cache.get(req.pipeline_id, pid)
                    if parent_df is not None:
                        inputs[f"df{i + 1}"] = parent_df

            if not inputs:
                results[node_id] = NodeResultResponse(ok=False, error="No input data")
                failed.add(node_id)
                continue

            exec_result = execute_node(code=code, inputs=inputs, timeout=30)
            if exec_result.ok and exec_result.output_df is not None:
                pipeline_cache.set(req.pipeline_id, node_id, exec_result.output_df)
                results[node_id] = NodeResultResponse(
                    ok=True,
                    preview=_df_preview(exec_result.output_df),
                    shape=list(exec_result.output_df.shape),
                    logs=exec_result.logs or None,
                )
            else:
                results[node_id] = NodeResultResponse(
                    ok=False,
                    error=exec_result.error,
                    logs=exec_result.logs or None,
                )
                failed.add(node_id)
            continue

    return ExecutePipelineResponse(results=results)
```

**Step 4: Register the router in main.py**

In `backend/app/main.py`, add:

```python
from app.api.routes_analysis import router as analysis_router
```

And add this line next to the other `app.include_router` calls:

```python
app.include_router(analysis_router)
```

**Step 5: Run tests**

Run: `cd backend && python -m pytest tests/unit/test_analysis_api.py -v`
Expected: Both tests pass.

**Step 6: Run full backend test suite**

Run: `make test-backend`
Expected: Same 2 pre-existing failures only.

**Step 7: Commit**

```bash
git add backend/app/api/routes_analysis.py backend/app/main.py backend/tests/unit/test_analysis_api.py
git commit -m "feat: add /api/analysis/execute endpoint with DAG execution"
```

---

### Task 6: Add the analysis tab to frontend navigation

**Files:**
- Modify: `frontend/src/state/editorStore.ts:50` (WorkbenchTab type)
- Modify: `frontend/src/App.tsx:7-13` (PATH_TO_TAB)
- Modify: `frontend/src/components/workbench/BottomNavBar.tsx:15-28` (TABS array)
- Modify: `frontend/src/components/workbench/WorkbenchLayoutMantine.tsx` (import + conditional render)
- Create: `frontend/src/components/analysis/AnalysisPage.tsx` (placeholder)

**Step 1: Add 'analysis' to WorkbenchTab type**

In `frontend/src/state/editorStore.ts` at line 50, change:

```typescript
export type WorkbenchTab = 'canvas' | 'formulas' | 'dashboard' | 'scenarios' | 'sensitivity' | 'optimisation' | 'data';
```

to:

```typescript
export type WorkbenchTab = 'canvas' | 'formulas' | 'dashboard' | 'scenarios' | 'sensitivity' | 'optimisation' | 'data' | 'analysis';
```

**Step 2: Add route mapping**

In `frontend/src/App.tsx`, add to `PATH_TO_TAB`:

```typescript
'/analysis': 'analysis',
```

**Step 3: Add tab to BottomNavBar**

In `frontend/src/components/workbench/BottomNavBar.tsx`:

Add import: `import { IconCode } from '@tabler/icons-react';` (add to existing icon imports)

Add to the TABS array, after the 'data' entry:

```typescript
{ value: 'analysis', label: 'Analysis', icon: <IconCode size={14} />, activeColor: '#862e9c' },
```

**Step 4: Create placeholder AnalysisPage**

Create `frontend/src/components/analysis/AnalysisPage.tsx`:

```typescript
import { Box, Text } from '@mantine/core';

export function AnalysisPage() {
  return (
    <Box style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Text size="lg" c="dimmed">Analysis Canvas — coming soon</Text>
    </Box>
  );
}
```

**Step 5: Wire up in WorkbenchLayout**

In `frontend/src/components/workbench/WorkbenchLayoutMantine.tsx`:

Add import:
```typescript
import { AnalysisPage } from '../analysis/AnalysisPage';
```

Add conditional render next to the other `activeTab` checks:
```typescript
{activeTab === 'analysis' && <AnalysisPage />}
```

**Step 6: Type-check and test**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No new errors.

Run: `make test-frontend`
Expected: All 172 tests pass.

**Step 7: Commit**

```bash
git add frontend/src/state/editorStore.ts frontend/src/App.tsx \
  frontend/src/components/workbench/BottomNavBar.tsx \
  frontend/src/components/workbench/WorkbenchLayoutMantine.tsx \
  frontend/src/components/analysis/AnalysisPage.tsx
git commit -m "feat: add Analysis tab with placeholder page"
```

---

### Task 7: Add pipeline CRUD to the Zustand store

**Files:**
- Modify: `frontend/src/state/editorStore.ts` (add pipeline state + CRUD methods)
- Modify: `frontend/src/lib/api.ts` (add executePipeline API call)

**Step 1: Add API client function**

In `frontend/src/lib/api.ts`, add:

```typescript
export type ExecutePipelineRequest = {
  pipeline_id: string;
  run_from?: string | null;
  nodes: Array<{
    id: string;
    type: 'data_source' | 'code' | 'output';
    code?: string;
    data_table?: { columns: Array<{ key: string; label: string; type: string }>; rows: unknown[][] };
  }>;
  edges: Array<{ source: string; target: string }>;
};

export type NodeResultResponse = {
  ok: boolean;
  preview?: { columns: Array<{ key: string; label: string; type: string }>; rows: unknown[][] };
  shape?: number[];
  logs?: string;
  error?: string;
};

export type ExecutePipelineResponse = {
  results: Record<string, NodeResultResponse>;
};

export async function executePipeline(req: ExecutePipelineRequest): Promise<ExecutePipelineResponse> {
  const res = await fetch(`${API_BASE}/api/analysis/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return parseJson(res);
}
```

Note: `API_BASE` and `parseJson` are already defined in this file. Just add the types and function.

**Step 2: Add pipeline state and methods to editorStore**

In `frontend/src/state/editorStore.ts`, add to the `EditorState` type (near the dashboard method signatures):

```typescript
// Analysis pipelines
pipelines: AnalysisPipeline[];
activePipelineId: string | null;
analysisResults: Record<string, import('../lib/api').NodeResultResponse>;
isRunningPipeline: boolean;
createPipeline: (name?: string) => void;
updatePipeline: (id: string, patch: Partial<AnalysisPipeline>) => void;
deletePipeline: (id: string) => void;
setActivePipeline: (id: string) => void;
runPipeline: (runFrom?: string) => Promise<void>;
```

Add the import for `AnalysisPipeline` from `../types/model` (it should already be importable after Task 2).

Add default state initialization in the `create()` call:

```typescript
pipelines: (model.metadata?.analysis as any)?.pipelines ?? [],
activePipelineId: (model.metadata?.analysis as any)?.defaults?.active_pipeline_id ?? null,
analysisResults: {},
isRunningPipeline: false,
```

Add the method implementations (follow the same pattern as `createDashboard`, `updateDashboard`, etc.):

```typescript
createPipeline: (name) => {
  set((state) => {
    const id = `pipeline_${Date.now()}`;
    const pipeline: AnalysisPipeline = {
      id,
      name: name?.trim() || `Pipeline ${state.pipelines.length + 1}`,
      nodes: [],
      edges: [],
    };
    const pipelines = [...state.pipelines, pipeline];
    return {
      pipelines,
      activePipelineId: id,
      model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, state.dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, pipelines, id),
    };
  });
},

updatePipeline: (id, patch) => {
  set((state) => {
    const pipelines = state.pipelines.map((p) => (p.id === id ? { ...p, ...patch } : p));
    return {
      pipelines,
      model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, state.dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, pipelines, state.activePipelineId),
    };
  });
},

deletePipeline: (id) => {
  set((state) => {
    const pipelines = state.pipelines.filter((p) => p.id !== id);
    const activePipelineId = state.activePipelineId === id ? (pipelines[0]?.id ?? null) : state.activePipelineId;
    return {
      pipelines,
      activePipelineId,
      model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, state.dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, pipelines, activePipelineId),
    };
  });
},

setActivePipeline: (id) => {
  set((state) => ({
    activePipelineId: id,
    analysisResults: {},
    model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, state.dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, state.pipelines, id),
  }));
},
```

The `runPipeline` method will need to load data tables from IndexedDB and call the API. This requires importing `executePipeline` from `../lib/api` and `loadDataTable` from `../lib/dataTableStorage`. Implementation:

```typescript
runPipeline: async (runFrom) => {
  const { pipelines, activePipelineId } = get();
  const pipeline = pipelines.find((p) => p.id === activePipelineId);
  if (!pipeline) return;

  set({ isRunningPipeline: true, analysisResults: {} });

  try {
    // Load data tables for data_source nodes
    const execNodes = [];
    for (const node of pipeline.nodes) {
      if (node.type === 'data_source' && node.data_table_id) {
        const table = await loadDataTable(node.data_table_id);
        execNodes.push({
          id: node.id,
          type: node.type as 'data_source',
          data_table: table ? { columns: table.columns, rows: table.rows } : undefined,
        });
      } else {
        execNodes.push({
          id: node.id,
          type: node.type as 'code' | 'output',
          code: node.code,
        });
      }
    }

    const response = await executePipeline({
      pipeline_id: pipeline.id,
      run_from: runFrom ?? null,
      nodes: execNodes,
      edges: pipeline.edges,
    });

    set({ analysisResults: response.results, isRunningPipeline: false });
  } catch {
    set({ isRunningPipeline: false });
  }
},
```

**Important:** The `persistAnalysis` function needs to be updated to accept pipeline arguments. Add `pipelines` and `activePipelineId` parameters and include them in the returned metadata:

In the `persistAnalysis` function (line ~374), add two new parameters and update the return:

```typescript
function persistAnalysis(
  model: ModelDocument,
  scenarios: ScenarioDefinition[],
  activeScenarioId: string,
  dashboards: DashboardDefinition[],
  activeDashboardId: string | null,
  sensitivityConfigs?: SensitivityConfig[],
  activeSensitivityConfigId?: string,
  optimisationConfigs?: OptimisationConfig[],
  activeOptimisationConfigId?: string,
  pipelines?: AnalysisPipeline[],
  activePipelineId?: string | null,
): ModelDocument {
  return {
    ...model,
    metadata: {
      ...(model.metadata ?? {}),
      analysis: {
        scenarios,
        dashboards,
        sensitivity_configs: sensitivityConfigs,
        optimisation_configs: optimisationConfigs,
        pipelines: pipelines,
        defaults: {
          baseline_scenario_id: activeScenarioId,
          active_dashboard_id: activeDashboardId ?? undefined,
          active_sensitivity_config_id: activeSensitivityConfigId ?? undefined,
          active_optimisation_config_id: activeOptimisationConfigId ?? undefined,
          active_pipeline_id: activePipelineId ?? undefined,
        },
      },
    },
  };
}
```

**Note:** ALL existing calls to `persistAnalysis` (in dashboard, scenario, sensitivity, optimisation methods) need to be updated to pass the new `pipelines` and `activePipelineId` arguments. Add `state.pipelines, state.activePipelineId` to each existing call.

**Step 3: Type-check and test**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No new errors.

Run: `make test-frontend`
Expected: All tests pass.

**Step 4: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/state/editorStore.ts
git commit -m "feat: add pipeline CRUD methods and executePipeline API client"
```

---

### Task 8: Build the Analysis canvas page with ReactFlow

**Files:**
- Create: `frontend/src/components/analysis/AnalysisPage.tsx` (replace placeholder)
- Create: `frontend/src/components/analysis/AnalysisToolbar.tsx`
- Create: `frontend/src/components/analysis/nodes/DataSourceNode.tsx`
- Create: `frontend/src/components/analysis/nodes/CodeNode.tsx`
- Create: `frontend/src/components/analysis/nodes/OutputNode.tsx`

This is the largest task. The page has:
- A toolbar at top (run button, pipeline name, add-node menu)
- A ReactFlow canvas filling the rest
- Three custom node types

**Step 1: Create the DataSourceNode**

Create `frontend/src/components/analysis/nodes/DataSourceNode.tsx`:

```typescript
import { useEffect, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Box, Select, Text } from '@mantine/core';
import { IconDatabase } from '@tabler/icons-react';
import { listDataTables } from '../../../lib/dataTableStorage';
import type { DataTableMeta } from '../../../types/dataTable';

type DataSourceData = {
  data_table_id?: string;
  onUpdate: (patch: Record<string, unknown>) => void;
  result?: { ok: boolean; shape?: number[] };
};

export function DataSourceNode({ data }: NodeProps<DataSourceData>) {
  const [tables, setTables] = useState<DataTableMeta[]>([]);

  useEffect(() => {
    listDataTables().then(setTables).catch(() => setTables([]));
  }, []);

  const options = useMemo(
    () => tables.map((t) => ({ value: t.id, label: `${t.name} (${t.rowCount} rows)` })),
    [tables],
  );

  const selected = tables.find((t) => t.id === data.data_table_id);

  return (
    <Box
      style={{
        background: '#fff',
        border: '1px solid #dee2e6',
        borderRadius: 8,
        padding: 12,
        minWidth: 200,
      }}
    >
      <Box style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <IconDatabase size={14} color="#0b7285" />
        <Text size="xs" fw={600} c="cyan.8">Data Source</Text>
        {data.result && (
          <Box style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: data.result.ok ? '#2f9e44' : '#e03131' }} />
        )}
      </Box>
      <Select
        size="xs"
        value={data.data_table_id ?? ''}
        onChange={(value) => data.onUpdate({ data_table_id: value ?? '' })}
        data={options}
        placeholder="Select table"
      />
      {selected && (
        <Text size="xs" c="dimmed" mt={4}>{selected.columns.length} columns</Text>
      )}
      <Handle type="source" position={Position.Right} />
    </Box>
  );
}
```

**Step 2: Create the CodeNode**

Create `frontend/src/components/analysis/nodes/CodeNode.tsx`:

```typescript
import { useCallback, useState } from 'react';
import { Handle, Position, type NodeProps, NodeResizer } from 'reactflow';
import { Box, Text, Table, ScrollArea } from '@mantine/core';
import { IconCode } from '@tabler/icons-react';
import Editor from '@monaco-editor/react';
import type { NodeResultResponse } from '../../../lib/api';

type CodeData = {
  code?: string;
  onUpdate: (patch: Record<string, unknown>) => void;
  result?: NodeResultResponse;
  selected?: boolean;
};

export function CodeNode({ data }: NodeProps<CodeData>) {
  const handleCodeChange = useCallback(
    (value: string | undefined) => {
      data.onUpdate({ code: value ?? '' });
    },
    [data],
  );

  const result = data.result;
  const preview = result?.ok ? result.preview : null;

  return (
    <>
      <NodeResizer minWidth={280} minHeight={200} isVisible={data.selected} />
      <Box
        style={{
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: 8,
          overflow: 'hidden',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <IconCode size={14} color="#862e9c" />
          <Text size="xs" fw={600} c="violet.8">Code</Text>
          {result && (
            <Box style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: result.ok ? '#2f9e44' : '#e03131' }} />
          )}
        </Box>

        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />

        <Box style={{ flex: 1, minHeight: 80 }}>
          <Editor
            height="100%"
            language="python"
            theme="vs-light"
            value={data.code ?? ''}
            onChange={handleCodeChange}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'off',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 8 },
              overviewRulerLanes: 0,
            }}
          />
        </Box>

        {/* Result preview or error */}
        {result && !result.ok && (
          <Box style={{ padding: '6px 12px', background: '#fff5f5', borderTop: '1px solid #ffc9c9', maxHeight: 80, overflow: 'auto' }}>
            <Text size="xs" c="red" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{result.error}</Text>
          </Box>
        )}
        {preview && (
          <Box style={{ borderTop: '1px solid #f0f0f0', maxHeight: 120 }}>
            <Text size="xs" c="dimmed" px={12} py={2}>{result?.shape?.[0]} rows x {result?.shape?.[1]} cols</Text>
            <ScrollArea style={{ maxHeight: 100 }}>
              <Table striped highlightOnHover style={{ fontSize: 11 }}>
                <Table.Thead>
                  <Table.Tr>
                    {preview.columns.map((col) => (
                      <Table.Th key={typeof col === 'string' ? col : col.key} style={{ padding: '2px 8px' }}>
                        {typeof col === 'string' ? col : col.label}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {preview.rows.slice(0, 10).map((row, i) => (
                    <Table.Tr key={i}>
                      {(row as unknown[]).map((cell, j) => (
                        <Table.Td key={j} style={{ padding: '2px 8px' }}>{cell != null ? String(cell) : ''}</Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Box>
        )}
      </Box>
    </>
  );
}
```

**Step 3: Create the OutputNode**

Create `frontend/src/components/analysis/nodes/OutputNode.tsx`:

```typescript
import { Handle, Position, type NodeProps } from 'reactflow';
import { Box, ScrollArea, SegmentedControl, Table, Text } from '@mantine/core';
import { IconTableFilled } from '@tabler/icons-react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { NodeResultResponse } from '../../../lib/api';

type OutputData = {
  output_mode?: 'table' | 'bar' | 'line';
  onUpdate: (patch: Record<string, unknown>) => void;
  result?: NodeResultResponse;
};

export function OutputNode({ data }: NodeProps<OutputData>) {
  const result = data.result;
  const preview = result?.ok ? result.preview : null;
  const mode = data.output_mode ?? 'table';

  const chartData = preview
    ? preview.rows.map((row) => {
        const entry: Record<string, unknown> = {};
        preview.columns.forEach((col, i) => {
          const key = typeof col === 'string' ? col : col.key;
          entry[key] = row[i];
        });
        return entry;
      })
    : [];

  const numericCols = preview?.columns.filter((c) => typeof c !== 'string' && c.type === 'number').map((c) => (typeof c === 'string' ? c : c.key)) ?? [];
  const xCol = preview?.columns[0] ? (typeof preview.columns[0] === 'string' ? preview.columns[0] : preview.columns[0].key) : '';

  return (
    <Box
      style={{
        background: '#fff',
        border: '1px solid #dee2e6',
        borderRadius: 8,
        minWidth: 300,
        minHeight: 200,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Handle type="target" position={Position.Left} />

      <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
        <IconTableFilled size={14} color="#e67700" />
        <Text size="xs" fw={600} c="orange.8">Output</Text>
        {result && (
          <Box style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: result.ok ? '#2f9e44' : '#e03131' }} />
        )}
      </Box>

      <Box px={12} py={4}>
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) => data.onUpdate({ output_mode: v })}
          data={[
            { value: 'table', label: 'Table' },
            { value: 'bar', label: 'Bar' },
            { value: 'line', label: 'Line' },
          ]}
        />
      </Box>

      {!result && <Text size="xs" c="dimmed" p={12}>Run pipeline to see output</Text>}

      {result && !result.ok && (
        <Box style={{ padding: '6px 12px' }}>
          <Text size="xs" c="red" style={{ fontFamily: 'monospace' }}>{result.error}</Text>
        </Box>
      )}

      {preview && mode === 'table' && (
        <ScrollArea style={{ flex: 1, maxHeight: 300 }} px={4}>
          <Table striped highlightOnHover style={{ fontSize: 11 }}>
            <Table.Thead>
              <Table.Tr>
                {preview.columns.map((col) => (
                  <Table.Th key={typeof col === 'string' ? col : col.key} style={{ padding: '2px 8px' }}>
                    {typeof col === 'string' ? col : col.label}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {preview.rows.map((row, i) => (
                <Table.Tr key={i}>
                  {(row as unknown[]).map((cell, j) => (
                    <Table.Td key={j} style={{ padding: '2px 8px' }}>{cell != null ? String(cell) : ''}</Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}

      {preview && mode === 'bar' && (
        <Box style={{ height: 200, padding: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey={xCol} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              {numericCols.slice(0, 5).map((col, i) => (
                <Bar key={col} dataKey={col} fill={['#4263eb', '#2f9e44', '#e67700', '#c2255c', '#0b7285'][i % 5]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      {preview && mode === 'line' && (
        <Box style={{ height: 200, padding: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey={xCol} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              {numericCols.slice(0, 5).map((col, i) => (
                <Line key={col} type="monotone" dataKey={col} stroke={['#4263eb', '#2f9e44', '#e67700', '#c2255c', '#0b7285'][i % 5]} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Box>
  );
}
```

**Step 4: Create the AnalysisToolbar**

Create `frontend/src/components/analysis/AnalysisToolbar.tsx`:

```typescript
import { Button, Group, Menu, TextInput } from '@mantine/core';
import { IconPlayerPlay, IconPlus, IconCode, IconDatabase, IconTableFilled } from '@tabler/icons-react';
import type { AnalysisPipeline, AnalysisNodeType } from '../../types/model';

type Props = {
  pipeline: AnalysisPipeline;
  isRunning: boolean;
  onUpdatePipeline: (id: string, patch: Partial<AnalysisPipeline>) => void;
  onAddNode: (type: AnalysisNodeType) => void;
  onRun: () => void;
};

export function AnalysisToolbar({ pipeline, isRunning, onUpdatePipeline, onAddNode, onRun }: Props) {
  return (
    <Group
      gap="sm"
      px="sm"
      py={6}
      style={{ borderBottom: '1px solid var(--mantine-color-gray-3)', flexShrink: 0 }}
    >
      <Menu shadow="md" width={200}>
        <Menu.Target>
          <Button size="xs" variant="light" leftSection={<IconPlus size={14} />}>
            Add Node
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconDatabase size={14} />} onClick={() => onAddNode('data_source')}>
            Data Source
          </Menu.Item>
          <Menu.Item leftSection={<IconCode size={14} />} onClick={() => onAddNode('code')}>
            Code
          </Menu.Item>
          <Menu.Item leftSection={<IconTableFilled size={14} />} onClick={() => onAddNode('output')}>
            Output
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

      <Button
        size="xs"
        leftSection={<IconPlayerPlay size={14} />}
        onClick={onRun}
        loading={isRunning}
      >
        Run Pipeline
      </Button>

      <TextInput
        size="xs"
        value={pipeline.name}
        onChange={(e) => onUpdatePipeline(pipeline.id, { name: e.currentTarget.value })}
        styles={{ input: { fontWeight: 600 } }}
        style={{ flex: 1 }}
      />
    </Group>
  );
}
```

**Step 5: Build the full AnalysisPage**

Replace `frontend/src/components/analysis/AnalysisPage.tsx`:

```typescript
import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  addEdge,
  useEdgesState,
  useNodesState,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Box, Button, Group, Select, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import type { AnalysisNodeType, AnalysisNode as AnalysisNodeT, AnalysisEdge as AnalysisEdgeT } from '../../types/model';
import { AnalysisToolbar } from './AnalysisToolbar';
import { DataSourceNode } from './nodes/DataSourceNode';
import { CodeNode } from './nodes/CodeNode';
import { OutputNode } from './nodes/OutputNode';

const nodeTypes: NodeTypes = {
  data_source: DataSourceNode,
  code: CodeNode,
  output: OutputNode,
};

function pipelineNodesToFlow(
  nodes: AnalysisNodeT[],
  results: Record<string, any>,
  onUpdate: (nodeId: string, patch: Record<string, unknown>) => void,
  selectedNodeId: string | null,
): Node[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    ...(n.w && n.h ? { style: { width: n.w, height: n.h } } : {}),
    data: {
      ...n,
      result: results[n.id],
      selected: n.id === selectedNodeId,
      onUpdate: (patch: Record<string, unknown>) => onUpdate(n.id, patch),
    },
  }));
}

function pipelineEdgesToFlow(edges: AnalysisEdgeT[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: true,
  }));
}

export function AnalysisPage() {
  const pipelines = useEditorStore((s) => s.pipelines);
  const activePipelineId = useEditorStore((s) => s.activePipelineId);
  const createPipeline = useEditorStore((s) => s.createPipeline);
  const updatePipeline = useEditorStore((s) => s.updatePipeline);
  const setActivePipeline = useEditorStore((s) => s.setActivePipeline);
  const runPipeline = useEditorStore((s) => s.runPipeline);
  const isRunningPipeline = useEditorStore((s) => s.isRunningPipeline);
  const analysisResults = useEditorStore((s) => s.analysisResults);

  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;

  const handleUpdateNode = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      if (!activePipeline) return;
      const nodes = activePipeline.nodes.map((n) =>
        n.id === nodeId ? { ...n, ...patch } : n,
      );
      updatePipeline(activePipeline.id, { nodes });
    },
    [activePipeline, updatePipeline],
  );

  const flowNodes = useMemo(
    () => activePipeline ? pipelineNodesToFlow(activePipeline.nodes, analysisResults, handleUpdateNode, null) : [],
    [activePipeline, analysisResults, handleUpdateNode],
  );

  const flowEdges = useMemo(
    () => activePipeline ? pipelineEdgesToFlow(activePipeline.edges) : [],
    [activePipeline],
  );

  const onNodesChange = useCallback(
    (changes: any[]) => {
      if (!activePipeline) return;
      // Handle position changes (drag)
      const posChanges = changes.filter((c: any) => c.type === 'position' && c.position);
      if (posChanges.length > 0) {
        const nodes = activePipeline.nodes.map((n) => {
          const change = posChanges.find((c: any) => c.id === n.id);
          if (change) return { ...n, x: change.position.x, y: change.position.y };
          return n;
        });
        updatePipeline(activePipeline.id, { nodes });
      }
      // Handle resize changes
      const resizeChanges = changes.filter((c: any) => c.type === 'dimensions' && c.dimensions);
      if (resizeChanges.length > 0) {
        const nodes = activePipeline.nodes.map((n) => {
          const change = resizeChanges.find((c: any) => c.id === n.id);
          if (change) return { ...n, w: change.dimensions.width, h: change.dimensions.height };
          return n;
        });
        updatePipeline(activePipeline.id, { nodes });
      }
    },
    [activePipeline, updatePipeline],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!activePipeline || !connection.source || !connection.target) return;
      const id = `edge_${Date.now()}`;
      const newEdge: AnalysisEdgeT = { id, source: connection.source, target: connection.target };
      updatePipeline(activePipeline.id, { edges: [...activePipeline.edges, newEdge] });
    },
    [activePipeline, updatePipeline],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!activePipeline) return;
      const deletedIds = new Set(deleted.map((e) => e.id));
      updatePipeline(activePipeline.id, {
        edges: activePipeline.edges.filter((e) => !deletedIds.has(e.id)),
      });
    },
    [activePipeline, updatePipeline],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      if (!activePipeline) return;
      const deletedIds = new Set(deleted.map((n) => n.id));
      updatePipeline(activePipeline.id, {
        nodes: activePipeline.nodes.filter((n) => !deletedIds.has(n.id)),
        edges: activePipeline.edges.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)),
      });
    },
    [activePipeline, updatePipeline],
  );

  const handleAddNode = useCallback(
    (type: AnalysisNodeType) => {
      if (!activePipeline) return;
      const id = `node_${Date.now()}`;
      const newNode: AnalysisNodeT = {
        id,
        type,
        x: 100 + activePipeline.nodes.length * 50,
        y: 100 + activePipeline.nodes.length * 50,
        ...(type === 'code' ? { code: '# Transform your data\ndf = df', w: 350, h: 300 } : {}),
      };
      updatePipeline(activePipeline.id, { nodes: [...activePipeline.nodes, newNode] });
    },
    [activePipeline, updatePipeline],
  );

  if (!activePipeline) {
    return (
      <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Group px="md" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
          <Text fw={600}>Analysis Pipelines</Text>
          <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => createPipeline()}>
            New Pipeline
          </Button>
          {pipelines.length > 0 && (
            <Select
              size="xs"
              placeholder="Select pipeline"
              data={pipelines.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(v) => v && setActivePipeline(v)}
              w={200}
            />
          )}
        </Group>
        <Box style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text c="dimmed">Create a pipeline to get started</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <AnalysisToolbar
        pipeline={activePipeline}
        isRunning={isRunningPipeline}
        onUpdatePipeline={updatePipeline}
        onAddNode={handleAddNode}
        onRun={() => void runPipeline()}
      />
      <Box style={{ flex: 1 }}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onNodesDelete={onNodesDelete}
          fitView
          deleteKeyCode="Delete"
        >
          <Background />
          <Controls />
        </ReactFlow>
      </Box>
    </Box>
  );
}
```

**Step 6: Type-check and test**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No new errors.

Run: `make test-frontend`
Expected: All tests pass.

**Step 7: Commit**

```bash
git add frontend/src/components/analysis/
git commit -m "feat: add Analysis canvas page with Data Source, Code, and Output nodes"
```

---

### Task 9: Add reusable components (save/load code templates)

**Files:**
- Modify: `frontend/src/state/editorStore.ts` (add component CRUD)
- Modify: `frontend/src/components/analysis/AnalysisToolbar.tsx` (add component dropdown)
- Modify: `frontend/src/components/analysis/nodes/CodeNode.tsx` (add "Save as component" button)

**Step 1: Add component state to editorStore**

Add to EditorState type:
```typescript
analysisComponents: AnalysisComponent[];
saveAnalysisComponent: (name: string, code: string) => void;
deleteAnalysisComponent: (id: string) => void;
```

Add default state:
```typescript
analysisComponents: (model.metadata?.analysis as any)?.analysis_components ?? [],
```

Add implementations:
```typescript
saveAnalysisComponent: (name, code) => {
  set((state) => {
    const id = `comp_${Date.now()}`;
    const component: AnalysisComponent = { id, name, code };
    const analysisComponents = [...state.analysisComponents, component];
    return {
      analysisComponents,
      model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, state.dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, state.pipelines, state.activePipelineId, analysisComponents),
    };
  });
},

deleteAnalysisComponent: (id) => {
  set((state) => {
    const analysisComponents = state.analysisComponents.filter((c) => c.id !== id);
    return {
      analysisComponents,
      model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, state.dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, state.pipelines, state.activePipelineId, analysisComponents),
    };
  });
},
```

**Note:** `persistAnalysis` needs one more parameter: `analysisComponents`. Add it as the last parameter and include it in the returned metadata as `analysis_components`.

**Step 2: Add component picker to the toolbar**

In `AnalysisToolbar.tsx`, add a "Components" menu that lists saved components. Clicking one calls `onAddNode('code')` and pre-fills the code. Pass `analysisComponents` and an `onAddFromComponent` callback as props.

**Step 3: Add "Save as Component" to CodeNode**

Add a small button in the CodeNode header that opens a prompt for the component name, then calls `saveAnalysisComponent`.

**Step 4: Type-check and test**

Run: `cd frontend && npx tsc -b --noEmit && make test-frontend`
Expected: No new errors, all tests pass.

**Step 5: Commit**

```bash
git add frontend/src/state/editorStore.ts frontend/src/components/analysis/
git commit -m "feat: add reusable analysis components (save/load code templates)"
```

---

### Task 10: End-to-end verification

**Step 1: Run all backend tests**

Run: `make test-backend`
Expected: Same 2 pre-existing failures only.

**Step 2: Run all frontend tests**

Run: `make test-frontend`
Expected: All tests pass.

**Step 3: Type-check frontend**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No errors from analysis files.

**Step 4: Manual smoke test**

Run: `make dev`

1. Navigate to the Analysis tab in the bottom nav bar
2. Click "New Pipeline"
3. Add a Data Source node → select a data table
4. Add a Code node → write `df['doubled'] = df.iloc[:, 0] * 2`
5. Add an Output node
6. Connect: Data Source → Code → Output
7. Click "Run Pipeline"
8. Verify: green badges on all nodes, output table shows the new column
9. Test error: change code to `raise ValueError('test')`, re-run, verify red badge and traceback on Code node
10. Test timeout: change code to `while True: pass`, re-run, verify timeout error after ~30s

**Step 5: Commit**

```bash
git add -A
git commit -m "feat: complete analysis canvas with pipeline execution"
```
