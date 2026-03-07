import Papa from 'papaparse';
import type { DataColumn, DataTable } from '../types/dataTable';

export type LocalSpreadsheetSource = 'csv' | 'excel';

export function detectColumnType(values: (string | number | null | undefined)[]): 'number' | 'string' {
  let numericCount = 0;
  let nonEmptyCount = 0;
  for (const v of values.slice(0, 100)) {
    if (v == null || v === '') continue;
    nonEmptyCount++;
    if (typeof v === 'number' && !Number.isNaN(v)) {
      numericCount++;
    }
  }
  return nonEmptyCount > 0 && numericCount === nonEmptyCount ? 'number' : 'string';
}

function normalizeHeader(value: unknown, index: number): string {
  const text = value == null ? '' : String(value).trim();
  return text || `Column ${index + 1}`;
}

function normalizeCell(value: unknown): string | number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && !Number.isNaN(value)) {
    return value;
  }
  return String(value);
}

export function buildDataTableFromGrid(params: {
  name: string;
  source: LocalSpreadsheetSource;
  headers: unknown[];
  rawRows: unknown[][];
}): DataTable {
  const headers = params.headers.map((header, index) => normalizeHeader(header, index));
  const rows: (string | number | null)[][] = params.rawRows.map((row) =>
    headers.map((_, index) => normalizeCell(row[index])),
  );

  const columns: DataColumn[] = headers.map((header, index) => {
    const values = rows.map((row) => row[index]);
    return {
      key: header,
      label: header,
      type: detectColumnType(values),
    };
  });

  const now = new Date().toISOString();

  return {
    id: `dt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: params.name,
    source: params.source,
    description: '',
    tags: [],
    columns,
    rows,
    createdAt: now,
    updatedAt: now,
  };
}

export function parseCSV(file: File): Promise<DataTable> {
  return new Promise((resolve, reject) => {
    Papa.parse(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete(results) {
        const headers = results.meta.fields ?? [];
        if (headers.length === 0) {
          reject(new Error('CSV has no columns'));
          return;
        }

        const baseName = file.name.replace(/\.[^.]+$/, '');
        const rawRows = (results.data as Record<string, unknown>[]).map((row) =>
          headers.map((header) => row[header]),
        );

        resolve(buildDataTableFromGrid({
          name: baseName,
          source: 'csv',
          headers,
          rawRows,
        }));
      },
      error(err) {
        reject(err);
      },
    });
  });
}
