/**
 * Data table storage — delegates to backend API.
 *
 * Keeps the same function signatures so all existing consumers
 * (AnalysisDataPanel, DataSourceNode, flyouts, etc.) work unchanged.
 */
import type { DataTable, DataTableMeta } from '../types/dataTable';
import {
  apiListDataTables,
  apiGetDataTable,
  apiUpsertDataTable,
  apiDeleteDataTable,
} from './api';

export async function saveDataTable(table: DataTable): Promise<void> {
  await apiUpsertDataTable(table.id, {
    name: table.name,
    source: table.source,
    description: (table as any).description ?? '',
    tags: (table as any).tags ?? [],
    columns: table.columns,
    rows: table.rows,
    googleSheets: table.googleSheets,
    original_filename: (table as any).original_filename,
  });
}

export async function loadDataTable(id: string): Promise<DataTable | null> {
  try {
    return await apiGetDataTable(id);
  } catch (err) {
    console.warn('[dataTableStorage] Failed to load table', id, err);
    return null;
  }
}

export async function listDataTables(): Promise<DataTableMeta[]> {
  try {
    return await apiListDataTables();
  } catch (err) {
    console.warn('[dataTableStorage] Failed to list tables:', err);
    return [];
  }
}

export async function deleteDataTable(id: string): Promise<void> {
  await apiDeleteDataTable(id);
}
