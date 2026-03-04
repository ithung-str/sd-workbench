export type DataColumnType = 'number' | 'string' | 'date';

export type DataColumn = {
  key: string;
  label: string;
  type: DataColumnType;
};

export type DataTable = {
  id: string;
  name: string;
  source: 'csv';
  columns: DataColumn[];
  rows: (string | number | null)[][];
  createdAt: string;
  updatedAt: string;
};

export type DataTableMeta = {
  id: string;
  name: string;
  source: 'csv';
  columns: DataColumn[];
  rowCount: number;
  createdAt: string;
  updatedAt: string;
};
