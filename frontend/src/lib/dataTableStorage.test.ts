import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import type { DataTable } from '../types/dataTable';
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

beforeEach(async () => {
  const list = await listDataTables();
  for (const entry of list) {
    await deleteDataTable(entry.id);
  }
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
