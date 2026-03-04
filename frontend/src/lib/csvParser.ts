import Papa from 'papaparse';
import type { DataColumn, DataTable } from '../types/dataTable';

function detectColumnType(values: (string | number | null | undefined)[]): 'number' | 'string' {
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

        const rawRows = results.data as Record<string, unknown>[];

        const columns: DataColumn[] = headers.map((header) => {
          const values = rawRows.map((row) => row[header] as string | number | null);
          return {
            key: header,
            label: header,
            type: detectColumnType(values),
          };
        });

        const rows: (string | number | null)[][] = rawRows.map((row) =>
          headers.map((h) => {
            const v = row[h];
            if (v == null || v === '') return null;
            return v as string | number;
          }),
        );

        const baseName = file.name.replace(/\.[^.]+$/, '');
        const now = new Date().toISOString();

        resolve({
          id: `dt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          name: baseName,
          source: 'csv',
          columns,
          rows,
          createdAt: now,
          updatedAt: now,
        });
      },
      error(err) {
        reject(err);
      },
    });
  });
}
