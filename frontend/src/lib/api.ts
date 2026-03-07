import type {
  AIChatMessage,
  AIExecuteResponse,
  BatchSimulateRequest,
  BatchSimulateResponse,
  ChunkUpdate,
  MonteCarloRequest,
  MonteCarloResponse,
  OATSensitivityRequest,
  OATSensitivityResponse,
  StreamChunk,
  AuxNode,
  ModelDocument,
  SimConfig,
  SimulateRequest,
  SimulateResponse,
  ValidateResponse,
} from '../types/model';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

async function parseJson<T>(res: Response): Promise<T> {
  const body = await res.json();
  if (!res.ok) {
    if (body?.detail) {
      throw body.detail;
    }
    throw body;
  }
  return body as T;
}

function syncOutputs(nodes: ModelDocument['nodes']): string[] {
  const outputs: string[] = [];
  for (const node of nodes) {
    if (node.type === 'text' || node.type === 'cld_symbol' || node.type === 'phantom' || node.type === 'cloud') continue;
    if ('name' in node && node.name) outputs.push(node.name);
  }
  return outputs;
}

function modelForBackend(model: ModelDocument): ModelDocument {
  const { global_variables: _globals, ...base } = model;
  const semanticNodes = base.nodes.filter((node) => node.type !== 'cld_symbol' && node.type !== 'phantom' && node.type !== 'cloud');
  const semanticIds = new Set(semanticNodes.map((node) => node.id));
  const semanticEdges = base.edges.filter((edge) => semanticIds.has(edge.source) && semanticIds.has(edge.target));
  const globals = model.global_variables ?? [];
  const allNodes = globals.length === 0
    ? semanticNodes
    : [...semanticNodes, ...globals.map((variable, idx): AuxNode => ({
        id: `global_${variable.id || idx}`,
        type: 'aux',
        name: variable.name,
        label: `Global ${variable.name}`,
        equation: variable.equation,
        units: variable.units,
        position: { x: -10000, y: -10000 - idx * 40 },
      }))];
  return {
    ...base,
    nodes: allNodes,
    edges: semanticEdges,
    outputs: syncOutputs(allNodes),
  };
}

export async function healthCheck(): Promise<{ status: string; service: string }> {
  const res = await fetch(`${API_BASE}/api/health`);
  return parseJson(res);
}

export async function validateModel(model: ModelDocument): Promise<ValidateResponse> {
  const normalized = modelForBackend(model);
  const res = await fetch(`${API_BASE}/api/models/validate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: normalized }),
  });
  return parseJson(res);
}

export async function simulateModel(req: SimulateRequest): Promise<SimulateResponse> {
  const normalized = modelForBackend(req.model);
  const res = await fetch(`${API_BASE}/api/models/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, model: normalized }),
  });
  return parseJson(res);
}

export async function simulateScenarioBatch(req: BatchSimulateRequest): Promise<BatchSimulateResponse> {
  const normalized = modelForBackend(req.model);
  const res = await fetch(`${API_BASE}/api/models/scenarios/simulate-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, model: normalized }),
  });
  return parseJson(res);
}

export async function runOATSensitivity(req: OATSensitivityRequest): Promise<OATSensitivityResponse> {
  const normalized = modelForBackend(req.model);
  const res = await fetch(`${API_BASE}/api/models/sensitivity/oat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, model: normalized }),
  });
  return parseJson(res);
}

export async function runMonteCarlo(req: MonteCarloRequest): Promise<MonteCarloResponse> {
  const normalized = modelForBackend(req.model);
  const res = await fetch(`${API_BASE}/api/models/sensitivity/monte-carlo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...req, model: normalized }),
  });
  return parseJson(res);
}

export async function executeAiCommand(prompt: string, model: ModelDocument, history?: AIChatMessage[], simConfig?: SimConfig): Promise<AIExecuteResponse> {
  const normalized = modelForBackend(model);
  // Strip frontend-only fields (suggestions) before sending history to backend
  const cleanHistory = (history ?? []).map(({ role, content }) => ({ role, content }));
  const res = await fetch(`${API_BASE}/api/ai/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model: normalized, history: cleanHistory, sim_config: simConfig ?? null }),
  });
  return parseJson(res);
}

export async function executeAiCommandStream(
  prompt: string,
  model: ModelDocument,
  history: AIChatMessage[] | undefined,
  simConfig: SimConfig | undefined,
  onStatus: (message: string) => void,
  onDebugChunk?: (text: string) => void,
  onChunk?: (chunk: StreamChunk, index: number) => void,
  onChunkUpdate?: (update: ChunkUpdate) => void,
): Promise<AIExecuteResponse> {
  const normalized = modelForBackend(model);
  const cleanHistory = (history ?? []).map(({ role, content }) => ({ role, content }));
  const res = await fetch(`${API_BASE}/api/ai/execute-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model: normalized, history: cleanHistory, sim_config: simConfig ?? null }),
  });

  if (!res.ok) {
    const body = await res.json();
    if (body?.detail) throw body.detail;
    throw body;
  }

  const reader = res.body?.getReader();
  if (!reader) throw { errors: [{ message: 'Streaming not supported' }] };

  const decoder = new TextDecoder();
  let buffer = '';
  let result: AIExecuteResponse | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    // Parse SSE events from buffer
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    let eventType = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        if (eventType === 'status') {
          onStatus(data.message ?? '');
        } else if (eventType === 'debug_chunk') {
          onDebugChunk?.(data.text ?? '');
        } else if (eventType === 'chunk') {
          onChunk?.({
            type: data.type,
            data: data.data,
            status: data.status,
            errors: data.errors ?? [],
          }, data.index ?? 0);
        } else if (eventType === 'chunk_update') {
          onChunkUpdate?.({
            index: data.index,
            status: data.status,
            errors: data.errors ?? [],
          });
        } else if (eventType === 'complete') {
          result = data as AIExecuteResponse;
        } else if (eventType === 'error') {
          throw data;
        }
        eventType = '';
      }
    }
  }

  if (!result) throw { errors: [{ message: 'Stream ended without a complete event' }] };
  return result;
}

export async function importSpreadsheet(file: File): Promise<{ ok: boolean; model: ModelDocument; warnings: { code: string; message: string; severity: string }[]; node_count: number }> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/imports/spreadsheet`, {
    method: 'POST',
    body: form,
  });
  return parseJson(res);
}

export type ExecutePipelineRequest = {
  pipeline_id: string;
  run_from?: string | null;
  nodes: Array<{
    id: string;
    type: 'data_source' | 'code' | 'sql' | 'output' | 'sheets_export' | 'publish';
    code?: string;
    sql?: string;
    data_table?: { columns: Array<{ key: string; label: string; type: string }>; rows: unknown[][] };
    publish_table_name?: string;
    publish_table_id?: string;
    publish_mode?: 'overwrite' | 'append';
  }>;
  edges: Array<{ source: string; target: string }>;
};

export type ColumnStats = {
  dtype: string;
  count: number;
  nulls: number;
  mean?: number | null;
  std?: number | null;
  min?: number | null;
  max?: number | null;
  '25%'?: number | null;
  '50%'?: number | null;
  '75%'?: number | null;
  unique?: number;
};

export type ValueKind = 'dataframe' | 'scalar' | 'dict' | 'list' | 'text';

export type NodeResultResponse = {
  ok: boolean;
  preview?: {
    columns?: Array<{ key: string; label: string; type: string }>;
    rows?: unknown[][];
    dtypes?: Record<string, string>;
    stats?: Record<string, ColumnStats>;
    // Generic value previews
    display?: string;
    length?: number;
    keys?: string[];
    total_keys?: number;
    sample?: unknown;
  };
  shape?: number[];
  value_kind?: ValueKind;
  generic_value?: unknown;
  display?: string;  // notebook-style last expression text
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

export async function loadPipelineResults(pipelineId: string): Promise<Record<string, NodeResultResponse>> {
  try {
    const res = await fetch(`${API_BASE}/api/analysis/pipelines/${pipelineId}/results`);
    const body = await parseJson<{ results: Record<string, NodeResultResponse> }>(res);
    return body.results;
  } catch {
    return {};
  }
}

export async function savePipelineResults(pipelineId: string, results: Record<string, NodeResultResponse>): Promise<void> {
  await fetch(`${API_BASE}/api/analysis/pipelines/${pipelineId}/results`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ results }),
  }).catch(() => {});
}

export type PaginatedPreview = {
  ok: boolean;
  value_kind?: ValueKind;
  columns?: Array<{ key: string; label: string; type: string }>;
  rows?: unknown[][];
  total_rows?: number;
  offset?: number;
  limit?: number;
  preview?: Record<string, unknown>;
  error?: string;
};

export async function fetchNodePreview(
  pipelineId: string,
  nodeId: string,
  offset = 0,
  limit = 100,
): Promise<PaginatedPreview> {
  try {
    const res = await fetch(
      `${API_BASE}/api/analysis/pipelines/${pipelineId}/nodes/${nodeId}/preview?offset=${offset}&limit=${limit}`,
    );
    return parseJson(res);
  } catch {
    return { ok: false, error: 'Failed to fetch preview' };
  }
}

export async function exportXmile(model: ModelDocument, simConfig?: { start: number; stop: number; dt: number; method: 'euler' }): Promise<{ ok: boolean; xml: string }> {
  const normalized = modelForBackend(model);
  const res = await fetch(`${API_BASE}/api/imports/export/xmile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: normalized, sim_config: simConfig ?? null }),
  });
  return parseJson(res);
}

// ── Data Tables API ──

import type { DataTable, DataTableMeta } from '../types/dataTable';

export async function apiListDataTables(params?: {
  search?: string;
  source?: string;
  tag?: string;
}): Promise<DataTableMeta[]> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.source) query.set('source', params.source);
  if (params?.tag) query.set('tag', params.tag);
  const qs = query.toString();
  const res = await fetch(`${API_BASE}/api/data/tables${qs ? '?' + qs : ''}`);
  return parseJson(res);
}

export async function apiGetDataTable(id: string): Promise<DataTable> {
  const res = await fetch(`${API_BASE}/api/data/tables/${id}`);
  return parseJson(res);
}

export async function apiCreateDataTable(table: {
  id?: string;
  name: string;
  source: string;
  description?: string;
  tags?: string[];
  columns: { key: string; label: string; type: string }[];
  rows: (string | number | null)[][];
  googleSheets?: { spreadsheetId: string; spreadsheetUrl: string; sheetName: string; sheetId: number };
  original_filename?: string;
}): Promise<DataTableMeta> {
  const res = await fetch(`${API_BASE}/api/data/tables`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(table),
  });
  return parseJson(res);
}

export async function apiUpsertDataTable(id: string, table: {
  name: string;
  source: string;
  description?: string;
  tags?: string[];
  columns: { key: string; label: string; type: string }[];
  rows: (string | number | null)[][];
  googleSheets?: { spreadsheetId: string; spreadsheetUrl: string; sheetName: string; sheetId: number };
  original_filename?: string;
}): Promise<DataTableMeta> {
  const res = await fetch(`${API_BASE}/api/data/tables/${id}/upsert`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...table, id }),
  });
  return parseJson(res);
}

export async function apiUpdateDataTable(id: string, updates: {
  name?: string;
  description?: string;
  tags?: string[];
}): Promise<DataTableMeta> {
  const res = await fetch(`${API_BASE}/api/data/tables/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return parseJson(res);
}

export async function apiDeleteDataTable(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/data/tables/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw body?.detail ?? 'Delete failed';
  }
}

export function apiDataTableCsvUrl(id: string): string {
  return `${API_BASE}/api/data/tables/${id}/export/csv`;
}

// ── Assets API ──

export type AssetKind = 'table' | 'file' | 'value';

export type AssetLineage = {
  pipeline_id: string;
  node_id: string;
  run_at?: string;
};

export type AssetMeta = {
  id: string;
  slug: string | null;
  name: string;
  kind: AssetKind;
  source: string;
  description: string;
  tags: string[];
  version: number;
  versions_count: number;
  lineage: AssetLineage | null;
  columns: { key: string; label: string; type: string }[] | null;
  row_count: number | null;
  created_at: string;
  updated_at: string;
};

export type AssetDetail = AssetMeta & {
  rows: (string | number | null)[][] | null;
  column_stats: Record<string, any> | null;
  content_text: string | null;
  value: any;
};

export type AssetVersionMeta = {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  row_count: number | null;
  lineage: AssetLineage | null;
};

export async function apiListAssets(params?: {
  kind?: string;
  source?: string;
  tag?: string;
  search?: string;
  pipeline_id?: string;
}): Promise<AssetMeta[]> {
  const query = new URLSearchParams();
  if (params?.kind) query.set('kind', params.kind);
  if (params?.source) query.set('source', params.source);
  if (params?.tag) query.set('tag', params.tag);
  if (params?.search) query.set('search', params.search);
  if (params?.pipeline_id) query.set('pipeline_id', params.pipeline_id);
  const qs = query.toString();
  const res = await fetch(`${API_BASE}/api/assets${qs ? '?' + qs : ''}`);
  return parseJson(res);
}

export async function apiGetAsset(id: string): Promise<AssetDetail> {
  const res = await fetch(`${API_BASE}/api/assets/${id}`);
  return parseJson(res);
}

export async function apiGetAssetBySlug(slug: string): Promise<AssetDetail> {
  const res = await fetch(`${API_BASE}/api/assets/by-slug/${slug}`);
  return parseJson(res);
}

export async function apiGetAssetVersions(id: string): Promise<AssetVersionMeta[]> {
  const res = await fetch(`${API_BASE}/api/assets/${id}/versions`);
  return parseJson(res);
}

export async function apiCreateAsset(asset: {
  name: string;
  kind?: AssetKind;
  source?: string;
  slug?: string;
  description?: string;
  tags?: string[];
  columns?: { key: string; label: string; type: string }[];
  rows?: (string | number | null)[][];
  content_text?: string;
  value?: any;
}): Promise<AssetMeta> {
  const res = await fetch(`${API_BASE}/api/assets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(asset),
  });
  return parseJson(res);
}

export async function apiUpdateAsset(id: string, updates: {
  name?: string;
  slug?: string;
  description?: string;
  tags?: string[];
}): Promise<AssetMeta> {
  const res = await fetch(`${API_BASE}/api/assets/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });
  return parseJson(res);
}

export async function apiDeleteAsset(id: string): Promise<void> {
  const res = await fetch(`${API_BASE}/api/assets/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw body?.detail ?? 'Delete failed';
  }
}

export function apiAssetDataUrl(idOrSlug: string, format: string = 'json', bySlug = false): string {
  const path = bySlug ? `by-slug/${idOrSlug}` : idOrSlug;
  return `${API_BASE}/api/assets/${path}/data?format=${format}`;
}

// ── AI Node Describe ──

export type NodeDescribeRequest = {
  node_type: string;
  code?: string;
  sql?: string;
  columns?: string[];
  current_name?: string;
  current_description?: string;
  input_columns?: string[];
};

export type NodeDescribeResponse = {
  ok: boolean;
  name?: string;
  description?: string;
  error?: string;
};

// ── Notebook Import ──

export type NotebookCell = {
  index: number;
  cell_type: 'code' | 'markdown' | 'raw';
  source: string;
  outputs_text?: string | null;
};

export type ParseNotebookResponse = {
  ok: boolean;
  name: string;
  cells: NotebookCell[];
  error?: string;
};

export type SourceHint = {
  source_type: 'csv' | 'excel' | 'google_sheets' | 'url' | 'unknown';
  filename?: string | null;
  url?: string | null;
};

export type ExportHint = {
  export_type: 'google_sheets' | 'file' | 'unknown';
  url?: string | null;
  sheet_name?: string | null;
  filename?: string | null;
};

export type NotebookSection = {
  id: string;
  name: string;
  purpose: string;
  cell_indices: number[];
};

export type NotebookAnalysis = {
  total_cells?: number;
  code_cell_count: number;
  markdown_cell_count?: number;
  output_cell_count?: number;
  export_cell_count?: number;
  stage_count: number;
  complexity_tier: 'small' | 'medium' | 'large';
};

export type NotebookStagePlanEvent = {
  stages: NotebookSection[];
};

export type NotebookStageProgressEvent = {
  stage_id: string;
  stage_name?: string | null;
  state: 'queued' | 'building' | 'done' | 'needs_review';
};

export type NotebookWorkflowEvent = {
  main_path_stage_ids: string[];
  collapsed_stage_ids?: string[];
};

export type TransformNodeDef = {
  type: 'data_source' | 'code' | 'sql' | 'output' | 'note' | 'group' | 'sheets_export' | 'publish';
  name: string;
  description: string;
  code?: string | null;
  sql?: string | null;
  content?: string | null;
  output_mode?: 'table' | 'bar' | 'line' | 'scatter' | 'stats' | null;
  original_cells: number[];
  source_hint?: SourceHint | null;
  export_hint?: ExportHint | null;
  group_id?: string | null;
  group_name?: string | null;
};

export type TransformEdgeDef = {
  from_index: number;
  to_index: number;
};

export type TransformNotebookResponse = {
  ok: boolean;
  sections: NotebookSection[];
  nodes: TransformNodeDef[];
  edges: TransformEdgeDef[];
  warnings: string[];
  error?: string;
};

export async function parseNotebook(file: File): Promise<ParseNotebookResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/notebook/parse`, {
    method: 'POST',
    body: form,
  });
  return parseJson(res);
}

export async function transformNotebook(
  cells: NotebookCell[],
  pipelineName: string,
): Promise<TransformNotebookResponse> {
  const res = await fetch(`${API_BASE}/api/notebook/transform`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cells, pipeline_name: pipelineName }),
  });
  return parseJson(res);
}

export async function transformNotebookStream(
  cells: NotebookCell[],
  pipelineName: string,
  onText: (chunk: string) => void,
  onNode: (index: number, node: TransformNodeDef) => void,
  onStatus: (message: string) => void,
  opts?: {
    onAnalysis?: (analysis: NotebookAnalysis) => void;
    onStagePlan?: (plan: NotebookStagePlanEvent) => void;
    onStageProgress?: (progress: NotebookStageProgressEvent) => void;
    onWorkflow?: (workflow: NotebookWorkflowEvent) => void;
    onWarning?: (warning: { message: string }) => void;
  },
): Promise<TransformNotebookResponse> {
  const res = await fetch(`${API_BASE}/api/notebook/transform-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cells, pipeline_name: pipelineName }),
  });

  if (!res.ok) {
    const body = await res.json();
    throw body?.detail ?? body;
  }

  const reader = res.body?.getReader();
  if (!reader) throw new Error('Streaming not supported');

  const decoder = new TextDecoder();
  let buffer = '';
  let result: TransformNotebookResponse | null = null;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    let eventType = '';
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        eventType = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        const data = JSON.parse(line.slice(6));
        if (eventType === 'status') {
          onStatus(data.message ?? '');
        } else if (eventType === 'analysis') {
          opts?.onAnalysis?.(data as NotebookAnalysis);
        } else if (eventType === 'stage_plan') {
          opts?.onStagePlan?.(data as NotebookStagePlanEvent);
        } else if (eventType === 'stage_progress') {
          opts?.onStageProgress?.(data as NotebookStageProgressEvent);
        } else if (eventType === 'workflow') {
          opts?.onWorkflow?.(data as NotebookWorkflowEvent);
        } else if (eventType === 'warning') {
          opts?.onWarning?.(data as { message: string });
        } else if (eventType === 'text') {
          onText(data.chunk ?? '');
        } else if (eventType === 'node') {
          onNode(data.index ?? 0, data.node as TransformNodeDef);
        } else if (eventType === 'complete') {
          result = data as TransformNotebookResponse;
        } else if (eventType === 'error') {
          throw new Error(data.message ?? 'Transform failed');
        }
        eventType = '';
      }
    }
  }

  if (!result) throw new Error('Stream ended without a complete event');
  return result;
}

export async function aiDescribeNode(req: NodeDescribeRequest): Promise<NodeDescribeResponse> {
  try {
    const res = await fetch(`${API_BASE}/api/ai/describe-node`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
    });
    return parseJson(res);
  } catch {
    return { ok: false, error: 'Failed to reach AI service' };
  }
}
