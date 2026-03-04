import type { DataColumn, DataTable, GoogleSheetsMetadata } from '../types/dataTable';

export type SheetInfo = {
  sheetId: number;
  title: string;
};

export type SpreadsheetMeta = {
  title: string;
  sheets: SheetInfo[];
};

/**
 * Extract spreadsheet ID from a Google Sheets URL.
 * Supports URLs like:
 *   https://docs.google.com/spreadsheets/d/SPREADSHEET_ID/edit...
 */
export function parseSpreadsheetId(url: string): string | null {
  const match = url.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match?.[1] ?? null;
}

/**
 * Fetch spreadsheet title and worksheet list.
 */
export async function fetchSpreadsheetMeta(
  spreadsheetId: string,
  accessToken: string,
): Promise<SpreadsheetMeta> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=properties.title,sheets.properties`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch spreadsheet metadata: ${res.status} ${text}`);
  }
  const data = await res.json();
  return {
    title: data.properties.title,
    sheets: (data.sheets ?? []).map((s: { properties: { sheetId: number; title: string } }) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
    })),
  };
}

/**
 * Fetch all values from a worksheet as a 2D string array.
 */
export async function fetchSheetData(
  spreadsheetId: string,
  sheetTitle: string,
  accessToken: string,
): Promise<string[][]> {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${encodeURIComponent(sheetTitle)}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to fetch sheet data: ${res.status} ${text}`);
  }
  const data = await res.json();
  return (data.values as string[][]) ?? [];
}

function detectColumnType(values: (string | number | null)[]): 'number' | 'string' {
  let numericCount = 0;
  let nonEmptyCount = 0;
  for (const v of values.slice(0, 100)) {
    if (v == null || v === '') continue;
    nonEmptyCount++;
    const num = typeof v === 'number' ? v : Number(v);
    if (!Number.isNaN(num)) {
      numericCount++;
    }
  }
  return nonEmptyCount > 0 && numericCount === nonEmptyCount ? 'number' : 'string';
}

/**
 * Convert raw sheet data (2D array with header row) to a DataTable.
 */
export function sheetDataToDataTable(
  rawRows: string[][],
  spreadsheetId: string,
  spreadsheetUrl: string,
  sheetName: string,
  sheetId: number,
  spreadsheetTitle: string,
): DataTable {
  if (rawRows.length === 0) {
    throw new Error('Sheet is empty');
  }

  const headers = rawRows[0];
  const dataRows = rawRows.slice(1);

  const columns: DataColumn[] = headers.map((header, colIdx) => {
    const values = dataRows.map((row) => {
      const v = row[colIdx];
      if (v == null || v === '') return null;
      const num = Number(v);
      return Number.isNaN(num) ? v : num;
    });
    return {
      key: header,
      label: header,
      type: detectColumnType(values),
    };
  });

  const rows: (string | number | null)[][] = dataRows.map((row) =>
    headers.map((_, colIdx) => {
      const v = row[colIdx];
      if (v == null || v === '') return null;
      const col = columns[colIdx];
      if (col.type === 'number') {
        const num = Number(v);
        return Number.isNaN(num) ? v : num;
      }
      return v;
    }),
  );

  const now = new Date().toISOString();
  const googleSheets: GoogleSheetsMetadata = {
    spreadsheetId,
    spreadsheetUrl,
    sheetName,
    sheetId,
  };

  return {
    id: `dt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: `${spreadsheetTitle} - ${sheetName}`,
    source: 'google_sheets',
    columns,
    rows,
    createdAt: now,
    updatedAt: now,
    googleSheets,
  };
}

/**
 * Re-fetch data for an existing Google Sheets table.
 * Returns an updated DataTable preserving the original id and createdAt.
 */
export async function refreshGoogleSheetsTable(
  existing: DataTable,
  accessToken: string,
): Promise<DataTable> {
  const meta = existing.googleSheets;
  if (!meta) throw new Error('Not a Google Sheets table');

  const rawRows = await fetchSheetData(meta.spreadsheetId, meta.sheetName, accessToken);
  const refreshed = sheetDataToDataTable(
    rawRows,
    meta.spreadsheetId,
    meta.spreadsheetUrl,
    meta.sheetName,
    meta.sheetId,
    existing.name.replace(/ - .+$/, ''),
  );

  return {
    ...refreshed,
    id: existing.id,
    createdAt: existing.createdAt,
  };
}
