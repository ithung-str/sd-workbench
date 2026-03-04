# Data Tables — Design

## Goal

Add the ability to upload CSV files as persistent data tables in the workbench. Tables are workspace-level (shared across models), stored in IndexedDB, and viewable via a flyout panel and a dedicated `/data` page. This establishes the data layer that will later integrate with SD models (lookups, parameters, time series) and support transformations (notebook-style Python).

## Architecture

**Frontend-only MVP.** No backend changes. CSV parsing in the browser via Papa Parse. Storage in IndexedDB for large dataset support. Pure addition — no changes to the model schema or simulation engine.

### Data Model

```typescript
// types/dataTable.ts

type DataColumn = {
  key: string;             // machine-safe column ID (sanitized header)
  label: string;           // original header text
  type: 'number' | 'string' | 'date';  // auto-detected on import
};

type DataTable = {
  id: string;              // e.g. "dt_1709567890123"
  name: string;            // user-facing name (defaults to filename)
  source: 'csv';           // extensible: 'google-sheets' | 'database' | 'transform'
  columns: DataColumn[];
  rows: (string | number | null)[][];  // row-major
  createdAt: string;       // ISO timestamp
  updatedAt: string;
};
```

### Storage Layer — `lib/dataTableStorage.ts`

Thin async wrapper over raw IndexedDB (no external library). Database name: `sd_workbench`. Object store: `dataTables`, keyed by `id`.

Functions:
- `saveDataTable(dt)` — upsert
- `listDataTables()` — returns metadata only (id, name, source, columns, row count, timestamps) — no row data
- `loadDataTable(id)` — full table including rows
- `deleteDataTable(id)` — remove
- `getDataTableCount()` — count for UI badges

### CSV Parsing — `lib/csvParser.ts`

Uses `papaparse` npm package. Flow:

1. `File` → Papa Parse with `header: true`, `dynamicTyping: true`, `skipEmptyLines: true`
2. Extract column definitions from headers
3. Auto-detect column types: scan first 100 rows per column. If all non-empty values are numbers → `number`, else `string`. (Date detection deferred.)
4. Build `DataTable` object with unique ID and timestamps
5. Return `DataTable` ready for storage

### UI

**A. Flyout panel — `components/workbench/flyouts/DataTables.tsx`**
- List of uploaded tables (name, row count, source badge)
- "Upload CSV" button
- Click table → navigate to `/data` page with that table selected

**B. Full page — `components/data/DataPage.tsx` at `/data` route**
- Left panel: table list with upload + delete
- Right panel: sortable, scrollable table viewer showing the selected table's data
- Column headers show name + type badge
- Basic stats per numeric column (count, min, max) in header tooltips

**C. Icon strip entry — new table icon in `CanvasComponentsBar.tsx`**
- Opens the DataTables flyout

**D. Navigation — add `/data` route to `App.tsx` + `navigation.ts`**

## File Summary

| Action | File |
|--------|------|
| Create | `frontend/src/types/dataTable.ts` — DataTable, DataColumn types |
| Create | `frontend/src/lib/dataTableStorage.ts` — IndexedDB CRUD |
| Create | `frontend/src/lib/csvParser.ts` — Papa Parse wrapper + type detection |
| Create | `frontend/src/components/data/DataPage.tsx` — full /data route |
| Create | `frontend/src/components/workbench/flyouts/DataTables.tsx` — flyout panel |
| Edit   | `frontend/src/components/workbench/CanvasComponentsBar.tsx` — add data icon |
| Edit   | `frontend/src/App.tsx` — register /data route |
| Edit   | `frontend/src/lib/navigation.ts` — add /data to known routes |
| Add    | `papaparse` + `@types/papaparse` npm dependencies |

## Not in Scope (Future)

- SD model integration (lookup from table, parameter injection, time series input)
- Notebook-style Python transformations (run server-side, store derived tables)
- Google Sheets / database connectors
- Dashboard `data-table` card type
- Data table editing in-browser
