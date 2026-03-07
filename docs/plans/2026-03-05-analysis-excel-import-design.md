# Analysis Excel Import Design

## Goal

Extend the analysis data import surfaces so users can drag-and-drop or upload Excel workbooks in the same places that already accept CSV, and import workbook sheets with the same one-table-per-tab behavior used for Google Sheets.

## Architecture

Keep this feature frontend-driven. Add a shared spreadsheet import utility that normalizes local file imports into `DataTable` objects. CSV remains a single-table import. Excel workbooks (`.xlsx` and `.xls`) are parsed in-browser and expanded into one `DataTable` per worksheet, using workbook-and-sheet naming consistent with Google Sheets imports.

This keeps analysis data imports local, preserves existing IndexedDB storage behavior, avoids coupling to the model spreadsheet backend import endpoint, and gives every analysis entry point a single import contract.

## Data Model

Update `DataTable` to recognize Excel as a first-class source:

```ts
type DataTable = {
  source: 'csv' | 'excel' | 'google_sheets';
  // existing fields unchanged
};
```

Excel imports do not store reconnect metadata because they are local snapshots, unlike Google Sheets.

## Import Flow

### Shared spreadsheet import utility

Create a shared utility that:

1. Detects file type from extension
2. Parses CSV into one `DataTable`
3. Parses Excel workbook bytes into one `DataTable` per worksheet
4. Rejects unsupported file types, empty workbooks, and empty worksheets with explicit errors

### Analysis sidebar and flyout

Update the right-side analysis data panel and analysis data flyout to:

- accept `.csv`, `.xlsx`, and `.xls`
- save all imported tables from one file
- refresh the table list once after import
- update copy from “CSV” to “CSV / Excel”

### Analysis canvas drop behavior

Update the analysis page canvas drop handler to:

- accept `.csv`, `.xlsx`, and `.xls`
- save every imported table
- create a `data_source` node for the first imported table, matching the existing single-drop workflow
- keep the remaining imported tables available in the analysis data list for manual placement

## Naming

- CSV: base filename
- Excel: `<workbook name> - <sheet name>`
- Google Sheets: unchanged

This makes Excel workbook imports behave the same way as Google Sheets tab imports from the user’s perspective.

## Error Handling

- Unsupported extensions: show a clear import failure alert
- Empty workbook: fail import
- Empty worksheet: fail import
- Mixed column typing: keep current number-or-string inference rules

## Testing

- Parser tests for CSV dispatch, `.xlsx` multi-sheet import, `.xls` multi-sheet import, and empty-sheet failure
- Focused analysis UI tests only if needed; otherwise cover import fan-out via the shared utility and keep UI changes minimal

## Out of Scope

- Refresh/reconnect for Excel files
- Import progress UI
- Partial worksheet selection for local Excel files
- Non-Excel spreadsheet formats beyond `.csv`, `.xls`, `.xlsx`
