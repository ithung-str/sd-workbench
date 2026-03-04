import type { DataTable } from '../types/dataTable';

export type CardFilter = {
  column: string;
  operator: string;
  value: string | string[];
};

type Row = (string | number | null)[];

export function applyFilters(table: DataTable, filters: CardFilter[]): Row[] {
  if (filters.length === 0) return table.rows;

  const colIndexMap = new Map(table.columns.map((c, i) => [c.key, i]));

  return table.rows.filter((row) =>
    filters.every((f) => {
      const idx = colIndexMap.get(f.column);
      if (idx === undefined) return true;
      const cell = row[idx];
      const cellStr = cell != null ? String(cell) : '';
      const cellNum = typeof cell === 'number' ? cell : Number(cell);

      switch (f.operator) {
        case 'equals':
          return cellStr === String(f.value);
        case 'not_equals':
          return cellStr !== String(f.value);
        case 'contains':
          return cellStr.toLowerCase().includes(String(f.value).toLowerCase());
        case 'is_one_of':
          return Array.isArray(f.value) && f.value.includes(cellStr);
        case '>':
          return Number.isFinite(cellNum) && cellNum > Number(f.value);
        case '<':
          return Number.isFinite(cellNum) && cellNum < Number(f.value);
        case '>=':
          return Number.isFinite(cellNum) && cellNum >= Number(f.value);
        case '<=':
          return Number.isFinite(cellNum) && cellNum <= Number(f.value);
        default:
          return true;
      }
    }),
  );
}

export function getUniqueColumnValues(table: DataTable, columnKey: string): string[] {
  const idx = table.columns.findIndex((c) => c.key === columnKey);
  if (idx < 0) return [];
  const unique = new Set<string>();
  for (const row of table.rows) {
    const val = row[idx];
    if (val != null) unique.add(String(val));
  }
  return Array.from(unique).sort();
}
