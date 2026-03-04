import type { ModelDocument } from '../types/model';

const STORAGE_KEY = 'sd_workbench_models';
const ACTIVE_KEY = 'sd_workbench_active_model_id';

export type SavedModelEntry = {
  id: string;
  name: string;
  updatedAt: string;
  data: ModelDocument;
};

function readAll(): SavedModelEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as SavedModelEntry[];
  } catch {
    return [];
  }
}

function writeAll(entries: SavedModelEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // localStorage quota exceeded — silently ignore
  }
}

/** Upsert a model into localStorage by its id. */
export function saveModelToStorage(model: ModelDocument): void {
  const entries = readAll();
  const now = new Date().toISOString();
  const idx = entries.findIndex((e) => e.id === model.id);
  const entry: SavedModelEntry = {
    id: model.id,
    name: model.name,
    updatedAt: now,
    data: model,
  };
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }
  writeAll(entries);
}

/** List all saved models (id, name, updatedAt) sorted by most recent first. */
export function listSavedModels(): Omit<SavedModelEntry, 'data'>[] {
  return readAll()
    .map(({ id, name, updatedAt }) => ({ id, name, updatedAt }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Load a model by id. Returns null if not found. */
export function loadModelFromStorage(id: string): ModelDocument | null {
  const entry = readAll().find((e) => e.id === id);
  return entry?.data ?? null;
}

/** Delete a model by id. */
export function deleteModelFromStorage(id: string): void {
  writeAll(readAll().filter((e) => e.id !== id));
}

/** Get the last-active model id. */
export function getActiveModelId(): string | null {
  return localStorage.getItem(ACTIVE_KEY);
}

/** Set the last-active model id. */
export function setActiveModelId(id: string): void {
  try {
    localStorage.setItem(ACTIVE_KEY, id);
  } catch {
    // ignore
  }
}
