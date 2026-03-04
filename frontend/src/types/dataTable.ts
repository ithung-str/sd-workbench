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

export type DataTable = {
  id: string;
  name: string;
  source: 'csv' | 'google_sheets';
  columns: DataColumn[];
  rows: (string | number | null)[][];
  createdAt: string;
  updatedAt: string;
  googleSheets?: GoogleSheetsMetadata;
};

export type DataTableMeta = {
  id: string;
  name: string;
  source: 'csv' | 'google_sheets';
  columns: DataColumn[];
  rowCount: number;
  createdAt: string;
  updatedAt: string;
  googleSheets?: GoogleSheetsMetadata;
};
