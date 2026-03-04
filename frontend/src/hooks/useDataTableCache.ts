import { useEffect, useRef, useState } from 'react';
import { loadDataTable } from '../lib/dataTableStorage';
import type { DataTable } from '../types/dataTable';

export type DataTableCacheEntry = {
  data: DataTable | null;
  loading: boolean;
  error: string | null;
};

/**
 * Loads DataTables from IndexedDB by ID and caches them in memory.
 * Only fetches each ID once per component lifetime.
 */
export function useDataTableCache(ids: string[]): Map<string, DataTableCacheEntry> {
  const cache = useRef(new Map<string, DataTable | null>());
  const inflight = useRef(new Set<string>());
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const toFetch = ids.filter((id) => !cache.current.has(id) && !inflight.current.has(id));

    for (const id of toFetch) {
      inflight.current.add(id);
      loadDataTable(id)
        .then((table) => {
          if (cancelled) return;
          cache.current.set(id, table);
          inflight.current.delete(id);
          forceUpdate((n) => n + 1);
        })
        .catch(() => {
          if (cancelled) return;
          cache.current.set(id, null);
          inflight.current.delete(id);
          forceUpdate((n) => n + 1);
        });
    }

    return () => {
      cancelled = true;
    };
  }, [ids.join(',')]);

  const result = new Map<string, DataTableCacheEntry>();
  for (const id of ids) {
    if (cache.current.has(id)) {
      const data = cache.current.get(id) ?? null;
      result.set(id, { data, loading: false, error: data ? null : 'Data table not found' });
    } else {
      result.set(id, { data: null, loading: true, error: null });
    }
  }
  return result;
}
