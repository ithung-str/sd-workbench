import type {
  AuxNode,
  ModelDocument,
  SimulateRequest,
  SimulateResponse,
  ValidateResponse,
  ValidationIssue,
  VensimImportResponse,
  VensimSimulateRequest,
  VensimSimulateResponse,
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

function modelForBackend(model: ModelDocument): ModelDocument {
  const { global_variables: _globals, ...base } = model;
  const globals = model.global_variables ?? [];
  if (globals.length === 0) return base;
  const globalNodes: AuxNode[] = globals.map((variable, idx) => ({
    id: `global_${variable.id || idx}`,
    type: 'aux',
    name: variable.name,
    label: `Global ${variable.name}`,
    equation: variable.equation,
    units: variable.units,
    position: { x: -10000, y: -10000 - idx * 40 },
  }));
  return {
    ...base,
    nodes: [...base.nodes, ...globalNodes],
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

export async function importVensimFile(file: File): Promise<VensimImportResponse> {
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/vensim/import`, {
    method: 'POST',
    body: form,
  });
  return parseJson(res);
}

export async function simulateImportedVensim(req: VensimSimulateRequest): Promise<VensimSimulateResponse> {
  const res = await fetch(`${API_BASE}/api/vensim/simulate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  });
  return parseJson(res);
}

export async function executeAiCommand(prompt: string, model: ModelDocument): Promise<{ ok: boolean; model: ModelDocument; warnings: ValidationIssue[] }> {
  const normalized = modelForBackend(model);
  const res = await fetch(`${API_BASE}/api/ai/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, model: normalized }),
  });
  return parseJson(res);
}
