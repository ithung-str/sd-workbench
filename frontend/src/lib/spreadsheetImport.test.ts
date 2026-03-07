import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { importSpreadsheetTables } from './spreadsheetImport';

function makeWorkbookFile(
  name: string,
  bookType: 'xlsx' | 'xls',
  sheets: Array<{ name: string; rows: Array<Array<string | number>> }>,
): File {
  const workbook = XLSX.utils.book_new();
  for (const sheet of sheets) {
    const worksheet = XLSX.utils.aoa_to_sheet(sheet.rows);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  }
  const bytes = XLSX.write(workbook, { type: 'array', bookType });
  const mime = bookType === 'xlsx'
    ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    : 'application/vnd.ms-excel';
  return new File([bytes], `${name}.${bookType}`, { type: mime });
}

describe('importSpreadsheetTables', () => {
  it('imports a csv file as one table', async () => {
    const file = new File(['Name,Value\nAlpha,1\nBeta,2\n'], 'metrics.csv', { type: 'text/csv' });

    const tables = await importSpreadsheetTables(file);

    expect(tables).toHaveLength(1);
    expect(tables[0].name).toBe('metrics');
    expect(tables[0].source).toBe('csv');
    expect(tables[0].rows).toEqual([
      ['Alpha', 1],
      ['Beta', 2],
    ]);
  });

  it('imports each xlsx worksheet as its own table', async () => {
    const file = makeWorkbookFile('quarterly-report', 'xlsx', [
      { name: 'Revenue', rows: [['Month', 'Value'], ['Jan', 10], ['Feb', 12]] },
      { name: 'Costs', rows: [['Month', 'Value'], ['Jan', 4], ['Feb', 5]] },
    ]);

    const tables = await importSpreadsheetTables(file);

    expect(tables).toHaveLength(2);
    expect(tables.map((table) => table.name)).toEqual([
      'quarterly-report - Revenue',
      'quarterly-report - Costs',
    ]);
    expect(tables.map((table) => table.rows)).toEqual([
      [['Jan', 10], ['Feb', 12]],
      [['Jan', 4], ['Feb', 5]],
    ]);
    expect((tables[0] as { source: string }).source).toBe('excel');
  });

  it('imports each xls worksheet as its own table', async () => {
    const file = makeWorkbookFile('legacy-report', 'xls', [
      { name: 'SheetA', rows: [['Code', 'Amount'], ['A', 7], ['B', 9]] },
      { name: 'SheetB', rows: [['Code', 'Amount'], ['C', 3], ['D', 8]] },
    ]);

    const tables = await importSpreadsheetTables(file);

    expect(tables).toHaveLength(2);
    expect(tables.map((table) => table.name)).toEqual([
      'legacy-report - SheetA',
      'legacy-report - SheetB',
    ]);
    expect((tables[1] as { source: string }).source).toBe('excel');
  });

  it('rejects empty worksheets', async () => {
    const file = makeWorkbookFile('empty-workbook', 'xlsx', [
      { name: 'Blank', rows: [] },
    ]);

    await expect(importSpreadsheetTables(file)).rejects.toThrow('Worksheet "Blank" is empty');
  });
});
