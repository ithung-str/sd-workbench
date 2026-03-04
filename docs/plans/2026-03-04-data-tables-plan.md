# Data Tables Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add CSV upload, IndexedDB storage, and table viewing — workspace-level data tables accessible via a flyout panel and a dedicated `/data` page.

**Architecture:** Frontend-only. CSV parsed in browser with Papa Parse. Stored in IndexedDB (async, large capacity). New `'data'` tab in WorkbenchTab union. Flyout in icon strip for quick access, full page for detailed viewing. No backend changes.

**Tech Stack:** Papa Parse (CSV), IndexedDB (storage), Mantine UI, Tabler Icons, Vitest (tests)

---

### Task 1: Install papaparse + create types

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/types/dataTable.ts`

**Step 1: Install papaparse**

```bash
cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npm install papaparse @types/papaparse
```

**Step 2: Create DataTable types**

Create `frontend/src/types/dataTable.ts`:

```typescript
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
```

**Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/types/dataTable.ts
git commit -m "feat: add papaparse dependency and DataTable types"
```

---

### Task 2: IndexedDB storage layer

**Files:**
- Create: `frontend/src/lib/dataTableStorage.ts`
- Create: `frontend/src/lib/dataTableStorage.test.ts`

**Step 1: Write the tests**

Create `frontend/src/lib/dataTableStorage.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import type { DataTable } from '../types/dataTable';
import {
  saveDataTable,
  listDataTables,
  loadDataTable,
  deleteDataTable,
} from './dataTableStorage';

const makeSample = (id = 'dt_test_1', name = 'Test Table'): DataTable => ({
  id,
  name,
  source: 'csv',
  columns: [
    { key: 'col_a', label: 'Col A', type: 'number' },
    { key: 'col_b', label: 'Col B', type: 'string' },
  ],
  rows: [
    [1, 'alpha'],
    [2, 'beta'],
  ],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

beforeEach(async () => {
  // Clean up any leftover data
  const list = await listDataTables();
  for (const entry of list) {
    await deleteDataTable(entry.id);
  }
});

describe('dataTableStorage', () => {
  it('saves and loads a table', async () => {
    const sample = makeSample();
    await saveDataTable(sample);
    const loaded = await loadDataTable(sample.id);
    expect(loaded).not.toBeNull();
    expect(loaded!.name).toBe('Test Table');
    expect(loaded!.rows).toHaveLength(2);
  });

  it('lists tables without row data', async () => {
    await saveDataTable(makeSample('dt_1', 'First'));
    await saveDataTable(makeSample('dt_2', 'Second'));
    const list = await listDataTables();
    expect(list).toHaveLength(2);
    expect(list[0]).toHaveProperty('rowCount');
    expect(list[0]).not.toHaveProperty('rows');
  });

  it('deletes a table', async () => {
    await saveDataTable(makeSample());
    await deleteDataTable('dt_test_1');
    const loaded = await loadDataTable('dt_test_1');
    expect(loaded).toBeNull();
  });

  it('upserts on save', async () => {
    const sample = makeSample();
    await saveDataTable(sample);
    const updated = { ...sample, name: 'Updated Name' };
    await saveDataTable(updated);
    const loaded = await loadDataTable(sample.id);
    expect(loaded!.name).toBe('Updated Name');
    const list = await listDataTables();
    expect(list).toHaveLength(1);
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/dataTableStorage.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement the storage layer**

Create `frontend/src/lib/dataTableStorage.ts`:

```typescript
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
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function deleteDataTable(id: string): Promise<void> {
  const { store, done } = await tx('readwrite');
  store.delete(id);
  await done;
}
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/dataTableStorage.test.ts
```

Expected: PASS (4 tests). Note: jsdom provides a `fake-indexeddb` compatible environment; if not, we may need to add `fake-indexeddb` as a dev dependency and import it in the test setup.

**Step 5: Commit**

```bash
git add frontend/src/lib/dataTableStorage.ts frontend/src/lib/dataTableStorage.test.ts
git commit -m "feat: add IndexedDB storage layer for data tables"
```

---

### Task 3: CSV parser

**Files:**
- Create: `frontend/src/lib/csvParser.ts`
- Create: `frontend/src/lib/csvParser.test.ts`

**Step 1: Write the tests**

Create `frontend/src/lib/csvParser.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseCSV } from './csvParser';

describe('parseCSV', () => {
  it('parses a simple CSV string', async () => {
    const csv = 'Name,Age,Score\nAlice,30,95.5\nBob,25,87.2\n';
    const file = new File([csv], 'test.csv', { type: 'text/csv' });
    const table = await parseCSV(file);

    expect(table.name).toBe('test');
    expect(table.source).toBe('csv');
    expect(table.columns).toHaveLength(3);
    expect(table.columns[0]).toEqual({ key: 'Name', label: 'Name', type: 'string' });
    expect(table.columns[1]).toEqual({ key: 'Age', label: 'Age', type: 'number' });
    expect(table.columns[2]).toEqual({ key: 'Score', label: 'Score', type: 'number' });
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toEqual(['Alice', 30, 95.5]);
    expect(table.rows[1]).toEqual(['Bob', 25, 87.2]);
  });

  it('handles missing values as null', async () => {
    const csv = 'A,B\n1,\n,hello\n';
    const file = new File([csv], 'gaps.csv', { type: 'text/csv' });
    const table = await parseCSV(file);

    expect(table.rows[0]).toEqual([1, null]);
    expect(table.rows[1]).toEqual([null, 'hello']);
  });

  it('auto-detects number columns', async () => {
    const csv = 'id,value\n1,100\n2,200\n3,300\n';
    const file = new File([csv], 'numbers.csv', { type: 'text/csv' });
    const table = await parseCSV(file);

    expect(table.columns[0].type).toBe('number');
    expect(table.columns[1].type).toBe('number');
  });

  it('marks mixed columns as string', async () => {
    const csv = 'label,value\nfoo,100\nbar,baz\n';
    const file = new File([csv], 'mixed.csv', { type: 'text/csv' });
    const table = await parseCSV(file);

    expect(table.columns[0].type).toBe('string');
    expect(table.columns[1].type).toBe('string');
  });
});
```

**Step 2: Run tests to verify they fail**

```bash
cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/csvParser.test.ts
```

Expected: FAIL — module not found.

**Step 3: Implement the parser**

Create `frontend/src/lib/csvParser.ts`:

```typescript
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

        // Build column definitions with type detection
        const columns: DataColumn[] = headers.map((header) => {
          const values = rawRows.map((row) => row[header] as string | number | null);
          return {
            key: header,
            label: header,
            type: detectColumnType(values),
          };
        });

        // Convert to row-major array format
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
```

**Step 4: Run tests to verify they pass**

```bash
cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/csvParser.test.ts
```

Expected: PASS (4 tests).

**Step 5: Commit**

```bash
git add frontend/src/lib/csvParser.ts frontend/src/lib/csvParser.test.ts
git commit -m "feat: add CSV parser with type detection"
```

---

### Task 4: Register data tab in app shell

**Files:**
- Modify: `frontend/src/state/editorStore.ts` (line ~49, WorkbenchTab type)
- Modify: `frontend/src/App.tsx` (line 7-12, PATH_TO_TAB)
- Modify: `frontend/src/lib/navigation.ts` (line 4-10, TAB_MAP)
- Modify: `frontend/src/components/workbench/BottomNavBar.tsx` (line 14-26, TABS array)
- Modify: `frontend/src/state/uiStore.ts` (line 4, FlyoutPanel type)
- Modify: `frontend/src/components/workbench/IconStrip.tsx` (line 12-18, ICONS array)
- Modify: `frontend/src/components/workbench/FlyoutPanel.tsx` (line 11-16, PANEL_TITLES + render)

**Step 1: Add `'data'` to WorkbenchTab type**

In `frontend/src/state/editorStore.ts`, find:

```typescript
export type WorkbenchTab = 'canvas' | 'formulas' | 'dashboard' | 'scenarios' | 'sensitivity' | 'optimisation';
```

Replace with:

```typescript
export type WorkbenchTab = 'canvas' | 'formulas' | 'dashboard' | 'scenarios' | 'sensitivity' | 'optimisation' | 'data';
```

**Step 2: Register in PATH_TO_TAB and TAB_MAP**

In `frontend/src/App.tsx`, add to `PATH_TO_TAB`:

```typescript
'/data': 'data',
```

In `frontend/src/lib/navigation.ts`, add to `TAB_MAP`:

```typescript
'/data': 'data',
```

**Step 3: Add tab to BottomNavBar**

In `frontend/src/components/workbench/BottomNavBar.tsx`, add the import:

```typescript
import { IconTable } from '@tabler/icons-react';
```

Add to the `TABS` array (after `optimisation`):

```typescript
{ value: 'data', label: 'Data', icon: <IconTable size={14} />, activeColor: '#0b7285' },
```

**Step 4: Add `'data'` to FlyoutPanel type**

In `frontend/src/state/uiStore.ts`, change:

```typescript
export type FlyoutPanel = 'components' | 'outline' | 'variables' | 'settings' | 'search' | null;
```

To:

```typescript
export type FlyoutPanel = 'components' | 'outline' | 'variables' | 'settings' | 'search' | 'data' | null;
```

**Step 5: Add data icon to IconStrip**

In `frontend/src/components/workbench/IconStrip.tsx`, add `IconTable` to imports:

```typescript
import { IconPlus, IconListDetails, IconVariable, IconSettings, IconSearch, IconTable } from '@tabler/icons-react';
```

Add to `ICONS` array (after `search`):

```typescript
{ panel: 'data', icon: IconTable, label: 'Data Tables' },
```

**Step 6: Add data panel to FlyoutPanel**

In `frontend/src/components/workbench/FlyoutPanel.tsx`, add import (will create the component in next task):

```typescript
import { DataTablesFlyout } from './flyouts/DataTablesFlyout';
```

Add to `PANEL_TITLES`:

```typescript
data: 'Data Tables',
```

Add render branch after `search`:

```typescript
{activeFlyout === 'data' && <DataTablesFlyout />}
```

**Step 7: Add placeholder DataTablesFlyout**

Create a minimal placeholder so the app compiles. Create `frontend/src/components/workbench/flyouts/DataTablesFlyout.tsx`:

```typescript
import { Text } from '@mantine/core';

export function DataTablesFlyout() {
  return <Text size="sm" c="dimmed">Data tables — coming soon</Text>;
}
```

**Step 8: Verify compilation**

```bash
cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx tsc -b --noEmit 2>&1 | grep -v 'imported\|InspectorPanel\.tsx\|functionCatalog'
```

Expected: no new errors.

**Step 9: Commit**

```bash
git add frontend/src/state/editorStore.ts frontend/src/App.tsx frontend/src/lib/navigation.ts frontend/src/components/workbench/BottomNavBar.tsx frontend/src/state/uiStore.ts frontend/src/components/workbench/IconStrip.tsx frontend/src/components/workbench/FlyoutPanel.tsx frontend/src/components/workbench/flyouts/DataTablesFlyout.tsx
git commit -m "feat: register data tab in app shell with flyout and bottom nav"
```

---

### Task 5: DataTables flyout panel

**Files:**
- Modify: `frontend/src/components/workbench/flyouts/DataTablesFlyout.tsx`

**Step 1: Implement the flyout**

Replace the placeholder with the full implementation:

```typescript
import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Badge, Group, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconTrash, IconUpload } from '@tabler/icons-react';
import type { DataTableMeta } from '../../../types/dataTable';
import { listDataTables, deleteDataTable, saveDataTable } from '../../../lib/dataTableStorage';
import { parseCSV } from '../../../lib/csvParser';
import { useEditorStore } from '../../../state/editorStore';

export function DataTablesFlyout() {
  const [tables, setTables] = useState<DataTableMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);

  const refresh = async () => {
    setLoading(true);
    const list = await listDataTables();
    setTables(list);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const table = await parseCSV(file);
      await saveDataTable(table);
      await refresh();
    } catch (err) {
      window.alert(`CSV import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    e.target.value = '';
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    await deleteDataTable(id);
    await refresh();
  };

  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Tooltip label="Upload CSV">
          <ActionIcon variant="light" size="sm" onClick={() => fileRef.current?.click()}>
            <IconUpload size={14} />
          </ActionIcon>
        </Tooltip>
        <Text size="xs" c="dimmed">{tables.length} table{tables.length !== 1 ? 's' : ''}</Text>
      </Group>
      <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} hidden />

      {loading && <Text size="xs" c="dimmed">Loading...</Text>}

      {!loading && tables.length === 0 && (
        <Text size="xs" c="dimmed">No data tables yet. Upload a CSV to get started.</Text>
      )}

      {tables.map((t) => (
        <Group key={t.id} gap={4} className="flyout-list-item" wrap="nowrap">
          <UnstyledButton
            style={{ flex: 1, overflow: 'hidden' }}
            onClick={() => setActiveTab('data')}
          >
            <Text size="xs" truncate fw={500}>{t.name}</Text>
            <Group gap={4}>
              <Badge size="xs" variant="light">{t.rowCount} rows</Badge>
              <Badge size="xs" variant="light" color="gray">{t.columns.length} cols</Badge>
            </Group>
          </UnstyledButton>
          <ActionIcon size="xs" variant="subtle" color="red" onClick={() => handleDelete(t.id, t.name)}>
            <IconTrash size={12} />
          </ActionIcon>
        </Group>
      ))}
    </Stack>
  );
}
```

**Step 2: Verify compilation**

```bash
cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx tsc -b --noEmit 2>&1 | grep -v 'imported\|InspectorPanel\.tsx\|functionCatalog'
```

**Step 3: Commit**

```bash
git add frontend/src/components/workbench/flyouts/DataTablesFlyout.tsx
git commit -m "feat: implement data tables flyout panel with upload and list"
```

---

### Task 6: Data page

**Files:**
- Create: `frontend/src/components/data/DataPage.tsx`
- Modify: `frontend/src/components/workbench/WorkbenchLayoutMantine.tsx`

**Step 1: Create the DataPage component**

Create `frontend/src/components/data/DataPage.tsx`:

```typescript
import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconTrash, IconUpload } from '@tabler/icons-react';
import type { DataTable, DataTableMeta } from '../../types/dataTable';
import {
  listDataTables,
  loadDataTable,
  deleteDataTable,
  saveDataTable,
} from '../../lib/dataTableStorage';
import { parseCSV } from '../../lib/csvParser';

export function DataPage() {
  const [tables, setTables] = useState<DataTableMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<DataTable | null>(null);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    setLoading(true);
    const list = await listDataTables();
    setTables(list);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedTable(null);
      return;
    }
    void loadDataTable(selectedId).then(setSelectedTable);
  }, [selectedId]);

  // Auto-select first table
  useEffect(() => {
    if (!selectedId && tables.length > 0) {
      setSelectedId(tables[0].id);
    }
  }, [tables, selectedId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const table = await parseCSV(file);
      await saveDataTable(table);
      await refresh();
      setSelectedId(table.id);
    } catch (err) {
      window.alert(`CSV import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    e.target.value = '';
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    await deleteDataTable(id);
    if (selectedId === id) setSelectedId(null);
    await refresh();
  };

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Group
        justify="space-between"
        px="md"
        py="xs"
        style={{ borderBottom: '1px solid var(--mantine-color-gray-3)', flexShrink: 0 }}
      >
        <Title order={4}>Data Tables</Title>
        <Button
          size="compact-sm"
          variant="light"
          leftSection={<IconUpload size={14} />}
          onClick={() => fileRef.current?.click()}
        >
          Upload CSV
        </Button>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} hidden />
      </Group>

      {/* Body: list + viewer */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left: table list */}
        <Box
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: '1px solid var(--mantine-color-gray-3)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <ScrollArea style={{ flex: 1 }} type="auto">
            <Stack gap={2} p="xs">
              {loading && <Text size="xs" c="dimmed">Loading...</Text>}
              {!loading && tables.length === 0 && (
                <Text size="xs" c="dimmed" p="xs">No data tables. Upload a CSV to get started.</Text>
              )}
              {tables.map((t) => (
                <Group
                  key={t.id}
                  gap={4}
                  wrap="nowrap"
                  style={{
                    padding: '6px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: selectedId === t.id ? 'var(--mantine-color-violet-0)' : undefined,
                  }}
                >
                  <UnstyledButton
                    style={{ flex: 1, overflow: 'hidden' }}
                    onClick={() => setSelectedId(t.id)}
                  >
                    <Text size="xs" fw={500} truncate>{t.name}</Text>
                    <Group gap={4}>
                      <Badge size="xs" variant="light">{t.rowCount} rows</Badge>
                      <Badge size="xs" variant="light" color="gray">{t.columns.length} cols</Badge>
                    </Group>
                  </UnstyledButton>
                  <Tooltip label="Delete">
                    <ActionIcon size="xs" variant="subtle" color="red" onClick={() => handleDelete(t.id, t.name)}>
                      <IconTrash size={12} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              ))}
            </Stack>
          </ScrollArea>
        </Box>

        {/* Right: table viewer */}
        <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!selectedTable && (
            <Box p="xl" style={{ display: 'grid', placeItems: 'center', flex: 1 }}>
              <Text c="dimmed">Select a table to view its contents</Text>
            </Box>
          )}
          {selectedTable && (
            <>
              <Group px="md" py="xs" gap="sm" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', flexShrink: 0 }}>
                <Text size="sm" fw={600}>{selectedTable.name}</Text>
                <Badge size="xs" variant="light">{selectedTable.rows.length} rows</Badge>
                <Badge size="xs" variant="light" color="gray">{selectedTable.columns.length} columns</Badge>
                <Text size="xs" c="dimmed">Source: {selectedTable.source}</Text>
              </Group>
              <ScrollArea style={{ flex: 1 }} type="auto">
                <Table striped highlightOnHover withTableBorder withColumnBorders style={{ fontSize: '0.8rem' }}>
                  <Table.Thead style={{ position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 1 }}>
                    <Table.Tr>
                      <Table.Th style={{ width: 50, textAlign: 'center', color: '#999', fontSize: '0.72rem' }}>#</Table.Th>
                      {selectedTable.columns.map((col) => (
                        <Table.Th key={col.key}>
                          <Group gap={4} wrap="nowrap">
                            <span>{col.label}</span>
                            <Badge size="xs" variant="light" color={col.type === 'number' ? 'blue' : 'gray'}>
                              {col.type}
                            </Badge>
                          </Group>
                        </Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {selectedTable.rows.map((row, rowIdx) => (
                      <Table.Tr key={rowIdx}>
                        <Table.Td style={{ textAlign: 'center', color: '#999', fontSize: '0.72rem' }}>{rowIdx + 1}</Table.Td>
                        {row.map((cell, colIdx) => (
                          <Table.Td
                            key={colIdx}
                            style={{
                              textAlign: selectedTable.columns[colIdx]?.type === 'number' ? 'right' : 'left',
                              fontVariantNumeric: selectedTable.columns[colIdx]?.type === 'number' ? 'tabular-nums' : undefined,
                            }}
                          >
                            {cell == null ? <Text span size="xs" c="dimmed">—</Text> : String(cell)}
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </>
          )}
        </Box>
      </div>
    </Box>
  );
}
```

**Step 2: Wire DataPage into WorkbenchLayout**

In `frontend/src/components/workbench/WorkbenchLayoutMantine.tsx`:

Add import:

```typescript
import { DataPage } from '../data/DataPage';
```

Add render branch after the optimisation line (around line 222):

```typescript
{activeTab === 'data' && <DataPage />}
```

**Step 3: Verify compilation**

```bash
cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx tsc -b --noEmit 2>&1 | grep -v 'imported\|InspectorPanel\.tsx\|functionCatalog'
```

**Step 4: Run all frontend tests**

```bash
cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run
```

Expected: all tests pass.

**Step 5: Commit**

```bash
git add frontend/src/components/data/DataPage.tsx frontend/src/components/workbench/WorkbenchLayoutMantine.tsx
git commit -m "feat: add data page with table list and viewer"
```

---

### Task 7: Final verification

**Step 1: Type check**

```bash
cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx tsc -b --noEmit 2>&1 | grep -v 'imported\|InspectorPanel\.tsx\|functionCatalog'
```

Expected: no new errors.

**Step 2: Run all tests**

```bash
cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run
```

Expected: all tests pass, including new dataTableStorage and csvParser tests.

**Step 3: Manual verification checklist**

- [ ] Bottom nav shows "Data" tab with table icon
- [ ] Clicking "Data" tab shows the data page with empty state
- [ ] Icon strip on canvas shows a table icon
- [ ] Clicking table icon opens the Data Tables flyout
- [ ] Upload CSV from flyout → table appears in list
- [ ] Upload CSV from data page → table appears in list, viewer shows contents
- [ ] Table viewer shows row numbers, column types, and data
- [ ] Number columns are right-aligned
- [ ] Delete a table → removed from list
- [ ] Refresh the page → uploaded tables persist (IndexedDB)
