import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { DataTable, DataTableMeta } from '../types/dataTable';
import {
  saveDataTable,
  listDataTables,
  loadDataTable,
  deleteDataTable,
} from './dataTableStorage';

const makeSample = (id = 'dt_test_1', name = 'Test Table'): DataTable => ({
  id,
  name,
  source: 'csv',
  description: '',
  tags: [],
  columns: [
    { key: 'col_a', label: 'Col A', type: 'number' },
    { key: 'col_b', label: 'Col B', type: 'string' },
  ],
  rows: [
    [1, 'alpha'],
    [2, 'beta'],
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

// In-memory store that the mocked fetch uses
let store: Map<string, DataTable>;

function makeMeta(t: DataTable): DataTableMeta {
  return {
    id: t.id,
    name: t.name,
    source: t.source,
    description: t.description,
    tags: t.tags,
    columns: t.columns,
    rowCount: t.rows.length,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

beforeEach(() => {
  store = new Map();

  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = new URL(url).pathname;

    // PUT /api/data/tables/:id/upsert
    if (method === 'PUT' && path.endsWith('/upsert')) {
      const body = JSON.parse(init!.body as string);
      const table: DataTable = {
        id: body.id,
        name: body.name,
        source: body.source,
        description: body.description ?? '',
        tags: body.tags ?? [],
        columns: body.columns,
        rows: body.rows,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      store.set(table.id, table);
      return new Response(JSON.stringify(makeMeta(table)), { status: 200 });
    }

    // GET /api/data/tables (list)
    if (method === 'GET' && path === '/api/data/tables') {
      const list = [...store.values()].map(makeMeta);
      return new Response(JSON.stringify(list), { status: 200 });
    }

    // GET /api/data/tables/:id
    if (method === 'GET' && path.startsWith('/api/data/tables/')) {
      const id = path.split('/').pop()!;
      const t = store.get(id);
      if (!t) return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 });
      return new Response(JSON.stringify({ ...t, column_stats: {}, rowCount: t.rows.length }), { status: 200 });
    }

    // DELETE /api/data/tables/:id
    if (method === 'DELETE' && path.startsWith('/api/data/tables/')) {
      const id = path.split('/').pop()!;
      store.delete(id);
      return new Response(null, { status: 204 });
    }

    return new Response(JSON.stringify({ detail: 'Not found' }), { status: 404 });
  }));
});

describe('dataTableStorage', () => {
  it('saves and loads a table', async () => {
    const sample = makeSample();
    await saveDataTable(sample);
    const loaded = await loadDataTable(sample.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('Test Table');
    expect(loaded!.rows).toHaveLength(2);
  });

  it('lists tables without row data', async () => {
    await saveDataTable(makeSample('dt_1', 'First'));
    await saveDataTable(makeSample('dt_2', 'Second'));
    const list = await listDataTables();
    expect(list).toHaveLength(2);
    expect(list[0]).toHaveProperty('rowCount');
    expect(list[0]).not.toHaveProperty('rows');
  });

  it('deletes a table', async () => {
    await saveDataTable(makeSample());
    await deleteDataTable('dt_test_1');
    const loaded = await loadDataTable('dt_test_1');
    expect(loaded).toBeNull();
  });

  it('upserts on save', async () => {
    const sample = makeSample();
    await saveDataTable(sample);
    const updated = { ...sample, name: 'Updated Name' };
    await saveDataTable(updated);
    const loaded = await loadDataTable(sample.id);
    expect(loaded!.name).toBe('Updated Name');
    const list = await listDataTables();
    expect(list).toHaveLength(1);
  });
});
