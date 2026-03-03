import type {
  AIChatMessage,
  AIExecuteResponse,
  BatchSimulateRequest,
  BatchSimulateResponse,
  MonteCarloRequest,
  MonteCarloResponse,
  OATSensitivityRequest,
  OATSensitivityResponse,
  AuxNode,
  ModelDocument,
  SimConfig,
  SimulateRequest,
  SimulateResponse,
  ValidateResponse,
  ValidationIssue,
  VensimImportResponse,
  VensimBatchSimulateRequest,
  VensimDiagnosticsResponse,
  VensimParityReadinessResponse,
  VensimOATSensitivityRequest,
  VensimMonteCarloRequest,
  VensimSimulateRequest,
  VensimSimulateResponse,
} from '../types/model';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';
const VENSIM_IMPORT_TIMEOUT_MS = 30_000;

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

export async function importVensimFile(file: File): Promise<VensimImportResponse> {
  const form = new FormData();
  form.append('file', file);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), VENSIM_IMPORT_TIMEOUT_MS);
  try {
    const res = await fetch(`${API_BASE}/api/vensim/import`, {
      method: 'POST',
      body: form,
      signal: controller.signal,
    });
    return parseJson(res);
  } catch (error: unknown) {
    const name = typeof error === 'object' && error !== null && 'name' in error ? String((error as { name?: string }).name) : '';
    if (name === 'AbortError') {
      throw { errors: [{ message: `Vensim import timed out after ${Math.floor(VENSIM_IMPORT_TIMEOUT_MS / 1000)}s` }] };
    }
    const message = error instanceof Error ? error.message : 'Failed to reach backend';
    throw { errors: [{ message: `Vensim import request failed: ${message}` }] };
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export async function simulateImportedVensim(req: VensimSimulateRequest): Promise<VensimSimulateResponse> {
  const res = await fetch(`${API_BASE}/api/vensim/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return parseJson(res);
}

export async function simulateImportedVensimBatch(req: VensimBatchSimulateRequest): Promise<BatchSimulateResponse> {
  const res = await fetch(`${API_BASE}/api/vensim/scenarios/simulate-batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return parseJson(res);
}

export async function runVensimOATSensitivity(req: VensimOATSensitivityRequest): Promise<OATSensitivityResponse> {
  const res = await fetch(`${API_BASE}/api/vensim/sensitivity/oat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return parseJson(res);
}

export async function runVensimMonteCarlo(req: VensimMonteCarloRequest): Promise<MonteCarloResponse> {
  const res = await fetch(`${API_BASE}/api/vensim/sensitivity/monte-carlo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return parseJson(res);
}

export async function getVensimDiagnostics(importId: string): Promise<VensimDiagnosticsResponse> {
  const res = await fetch(`${API_BASE}/api/vensim/import/${importId}/diagnostics`);
  return parseJson(res);
}

export async function getVensimParityReadiness(importId: string): Promise<VensimParityReadinessResponse> {
  const res = await fetch(`${API_BASE}/api/vensim/import/${importId}/parity-readiness`);
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

export async function exportXmile(model: ModelDocument, simConfig?: { start: number; stop: number; dt: number; method: 'euler' }): Promise<{ ok: boolean; xml: string }> {
  const normalized = modelForBackend(model);
  const res = await fetch(`${API_BASE}/api/imports/export/xmile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: normalized, sim_config: simConfig ?? null }),
  });
  return parseJson(res);
}
