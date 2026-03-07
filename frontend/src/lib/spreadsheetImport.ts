import * as XLSX from 'xlsx';
import type { DataTable } from '../types/dataTable';
import { buildDataTableFromGrid, parseCSV } from './csvParser';

const SUPPORTED_EXTENSIONS = new Set(['csv', 'xls', 'xlsx']);

function fileExtension(name: string): string {
  const match = name.toLowerCase().match(/\.([^.]+)$/);
  return match?.[1] ?? '';
}

export function isSupportedSpreadsheetFile(file: File): boolean {
  return SUPPORTED_EXTENSIONS.has(fileExtension(file.name));
}

async function readFileBytes(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error ?? new Error(`Failed to read ${file.name}`));
    reader.readAsArrayBuffer(file);
  });
}

async function importExcelTables(file: File): Promise<DataTable[]> {
  const workbook = XLSX.read(await readFileBytes(file), { type: 'array' });
  if (workbook.SheetNames.length === 0) {
    throw new Error('Workbook has no worksheets');
  }

  const workbookName = file.name.replace(/\.[^.]+$/, '');

  return workbook.SheetNames.map((sheetName) => {
    const worksheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      raw: true,
      defval: null,
      blankrows: false,
    });

    if (rawRows.length === 0) {
      throw new Error(`Worksheet "${sheetName}" is empty`);
    }

    return buildDataTableFromGrid({
      name: `${workbookName} - ${sheetName}`,
      source: 'excel',
      headers: rawRows[0] ?? [],
      rawRows: rawRows.slice(1),
    });
  });
}

export async function importSpreadsheetTables(file: File): Promise<DataTable[]> {
  const extension = fileExtension(file.name);
  if (extension === 'csv') {
    return [await parseCSV(file)];
  }
  if (extension === 'xls' || extension === 'xlsx') {
    return importExcelTables(file);
  }
  throw new Error(`Unsupported file type: ${file.name}`);
}
