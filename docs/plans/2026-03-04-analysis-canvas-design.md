# Analysis Canvas — Design Document

## Goal

A new Analysis page with a ReactFlow canvas where users build Python data pipelines visually. Nodes contain arbitrary Python code operating on DataFrames. Edges define data flow. The backend executes the DAG via subprocesses, caching intermediate results for incremental re-runs.

## Architecture

```
Frontend (ReactFlow canvas)
  │
  │  POST /api/analysis/execute
  │  { pipeline_id, nodes, edges, data_tables, run_from?: node_id }
  │
  ▼
Backend (FastAPI)
  │
  ├─ Topological sort
  ├─ For each node: check cache or spawn subprocess
  ├─ Cache results in memory (keyed by pipeline_id + node_id)
  └─ Return previews (100 rows) + metadata per node
```

**Execution boundary**: A single module `backend/app/analysis/executor.py` containing an `execute_pipeline()` function. This is the only file that changes when swapping subprocess → Docker.

## Node Types

### Data Source
- Selects a data table from IndexedDB (frontend)
- Sends full table data to backend on first run
- One output handle
- Displays: table name, row/column count

### Code
- Monaco editor (Python syntax highlighting, autocomplete)
- Resizable node
- Input handle(s) on left, output handle on right
- Pre-loaded namespace: `pd`, `np`, `scipy.stats`
- Single input: `df` variable. Multiple inputs: `df1, df2, ...` (by edge connection order)
- Output: whatever `df` equals at end of execution
- After run: collapsible preview (10 rows + shape) or error traceback

### Output
- Displays full result: paginated table or chart (bar/line)
- Configurable via dropdown: `table | bar | line`
- Input handle only

## Data Flow

- Primary output per node: pandas DataFrame
- Serialization between API and subprocess: Arrow/Parquet (fast, compact)
- Serialization in API response to frontend: JSON, first 100 rows only (preview)
- Full DataFrames stay on the backend in the result cache

## Backend Execution

### Endpoint

`POST /api/analysis/execute`

**Request:**
```json
{
  "pipeline_id": "pipe_123",
  "run_from": null,
  "nodes": [
    { "id": "n1", "type": "data_source", "data_table": { "columns": [...], "rows": [...] } },
    { "id": "n2", "type": "code", "code": "df = df.groupby('region').sum()" },
    { "id": "n3", "type": "output" }
  ],
  "edges": [
    { "source": "n1", "target": "n2" },
    { "source": "n2", "target": "n3" }
  ]
}
```

**Response:**
```json
{
  "results": {
    "n1": { "ok": true, "preview": { "columns": [...], "rows": [...] }, "shape": [1000000, 12], "logs": "" },
    "n2": { "ok": true, "preview": { "columns": [...], "rows": [...] }, "shape": [50, 3], "logs": "" },
    "n3": { "ok": true, "preview": { "columns": [...], "rows": [...] }, "shape": [50, 3], "logs": "" }
  }
}
```

Failed nodes return `"ok": false, "error": "traceback..."`. Downstream nodes of a failed node are skipped with `"error": "upstream failed"`.

### Execution Flow

1. Topologically sort the DAG
2. If `run_from` is set, use cached results for upstream nodes; re-execute from that node downstream
3. For each node to execute:
   - Serialize input DataFrames as Parquet, pipe to subprocess via stdin
   - Subprocess loads inputs, runs user code, writes output Parquet to stdout, errors to stderr
   - Timeout: 30s per node (kill subprocess if exceeded)
   - Memory: 512MB limit via `resource.setrlimit`
4. Cache result DataFrame in memory keyed by `(pipeline_id, node_id)`
5. Return 100-row JSON previews to frontend

### Result Cache

- In-memory dict: `{ (pipeline_id, node_id): DataFrame }`
- Invalidated when: node code changes, upstream node re-runs, or explicit clear
- Cleared on server restart (no disk persistence)
- Future (Docker): shared volume or Redis

### Subprocess Runner (`executor.py`)

```python
# This is the swappable boundary
def execute_node(code: str, inputs: dict[str, pd.DataFrame], timeout: int = 30) -> NodeResult:
    """Run user code in a subprocess. Returns output DataFrame or error."""
    # Serialize inputs as Parquet → stdin
    # Spawn subprocess with resource limits
    # Capture stdout (output Parquet) and stderr (errors)
    # Return NodeResult(ok, output_df, logs, error)
```

To swap to Docker later: replace the subprocess spawn with `docker run`, same stdin/stdout protocol.

## Frontend

### New Page

- Route: `/analysis`
- Tab added to WorkbenchTab type and BottomNavBar
- Own ReactFlow instance, separate from SD model canvas
- Toolbar: Run button, pipeline name, add-node menu

### State

Pipeline definitions stored in model metadata:

```typescript
// model.metadata.analysis.pipelines
type AnalysisPipeline = {
  id: string;
  name: string;
  nodes: AnalysisNode[];
  edges: AnalysisEdge[];
}

type AnalysisNode = {
  id: string;
  type: 'data_source' | 'code' | 'output';
  x: number;
  y: number;
  w?: number;
  h?: number;
  data_table_id?: string;    // data_source
  code?: string;              // code
  output_mode?: 'table' | 'bar' | 'line';  // output
}

type AnalysisEdge = {
  id: string;
  source: string;
  target: string;
}
```

Execution results stored in Zustand (ephemeral, not persisted):

```typescript
type NodeResult = {
  ok: boolean;
  preview?: { columns: string[]; rows: (string | number | null)[][] };
  shape?: [number, number];
  logs?: string;
  error?: string;
}

// In store
analysisResults: Record<string, NodeResult>  // keyed by node_id
```

### Auto-save

Same pattern as dashboards: pipeline definitions saved to model metadata via `persistAnalysis()`. Auto-saved to localStorage. Included in JSON export. Results are ephemeral (re-run to regenerate).

### Reusable Components

Saved code templates stored in model metadata:

```typescript
// model.metadata.analysis.components
type AnalysisComponent = {
  id: string;
  name: string;
  description?: string;
  code: string;
}
```

Dragging a component onto the canvas creates a Code node pre-filled with that code. No special execution logic — just a template library. Users can "Save as component" from any Code node's context menu.

## Security & Limits

- **Subprocess isolation**: user code runs in a child process, not in the FastAPI process
- **Timeout**: 30s per node (configurable)
- **Memory**: 512MB per subprocess via `resource.setrlimit`
- **No sandboxing**: trusted users (self-hosted / internal team). For public deployment, swap subprocess → Docker container
- **Swap boundary**: only `executor.py` changes for Docker migration

## Files to Create/Modify

### Backend (new)
- `backend/app/analysis/__init__.py`
- `backend/app/analysis/executor.py` — subprocess runner (the swappable boundary)
- `backend/app/analysis/runner_script.py` — the Python script that runs inside the subprocess
- `backend/app/analysis/cache.py` — in-memory result cache
- `backend/app/api/routes_analysis.py` — `/api/analysis/execute` endpoint
- `backend/app/schemas/analysis.py` — Pydantic request/response models

### Backend (modify)
- `backend/app/schemas/model.py` — add AnalysisPipeline, AnalysisComponent to AnalysisConfig
- `backend/app/main.py` — register analysis router

### Frontend (new)
- `frontend/src/components/analysis/AnalysisPage.tsx` — main page with ReactFlow canvas
- `frontend/src/components/analysis/AnalysisToolbar.tsx` — toolbar (run, add node, pipeline name)
- `frontend/src/components/analysis/nodes/DataSourceNode.tsx`
- `frontend/src/components/analysis/nodes/CodeNode.tsx`
- `frontend/src/components/analysis/nodes/OutputNode.tsx`
- `frontend/src/components/analysis/AnalysisEdge.tsx`
- `frontend/src/lib/analysisApi.ts` — API client for execute endpoint

### Frontend (modify)
- `frontend/src/types/model.ts` — add AnalysisPipeline, AnalysisNode, AnalysisEdge, AnalysisComponent types
- `frontend/src/state/editorStore.ts` — add 'analysis' to WorkbenchTab, pipeline CRUD methods, results state
- `frontend/src/App.tsx` — add '/analysis' route
- `frontend/src/components/workbench/WorkbenchLayoutMantine.tsx` — render AnalysisPage
- `frontend/src/components/workbench/BottomNavBar.tsx` — add Analysis tab
