import type { DataTable, DataTableMeta } from '../types/dataTable';

const DB_NAME = 'sd_workbench';
const DB_VERSION = 1;
const STORE_NAME = 'dataTables';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function tx(mode: IDBTransactionMode): Promise<{ store: IDBObjectStore; done: Promise<void> }> {
  return openDB().then((db) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    const done = new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
    return { store, done };
  });
}

function req<T>(idbReq: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    idbReq.onsuccess = () => resolve(idbReq.result);
    idbReq.onerror = () => reject(idbReq.error);
  });
}

export async function saveDataTable(table: DataTable): Promise<void> {
  const { store, done } = await tx('readwrite');
  store.put(table);
  await done;
}

export async function loadDataTable(id: string): Promise<DataTable | null> {
  const { store } = await tx('readonly');
  const result = await req<DataTable | undefined>(store.get(id));
  return result ?? null;
}

export async function listDataTables(): Promise<DataTableMeta[]> {
  const { store } = await tx('readonly');
  const all = await req<DataTable[]>(store.getAll());
  return all
    .map((t) => ({
      id: t.id,
      name: t.name,
      source: t.source,
      columns: t.columns,
      rowCount: t.rows.length,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      googleSheets: t.googleSheets,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteDataTable(id: string): Promise<void> {
  const { store, done } = await tx('readwrite');
  store.delete(id);
  await done;
}
