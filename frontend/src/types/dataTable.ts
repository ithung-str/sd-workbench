export type DataColumnType = 'number' | 'string' | 'date';

export type DataColumn = {
  key: string;
  label: string;
  type: DataColumnType;
};

export type GoogleSheetsMetadata = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheetName: string;
  sheetId: number;
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

export type DataTable = {
  id: string;
  name: string;
  source: 'csv' | 'excel' | 'google_sheets';
  description: string;
  tags: string[];
  columns: DataColumn[];
  rows: (string | number | null)[][];
  createdAt: string;
  updatedAt: string;
  googleSheets?: GoogleSheetsMetadata;
  original_filename?: string;
  column_stats?: Record<string, ColumnStats>;
};

export type DataTableMeta = {
  id: string;
  name: string;
  source: 'csv' | 'excel' | 'google_sheets';
  description: string;
  tags: string[];
  columns: DataColumn[];
  rowCount: number;
  createdAt: string;
  updatedAt: string;
  googleSheets?: GoogleSheetsMetadata;
  original_filename?: string;
};
