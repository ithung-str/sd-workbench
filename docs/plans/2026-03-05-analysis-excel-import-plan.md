# Analysis Excel Import Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add `.xlsx` and `.xls` support to analysis-side data uploads and drag-and-drop, importing one data table per worksheet like Google Sheets tabs.

**Architecture:** Introduce a shared local spreadsheet import utility that returns `DataTable[]` for any supported file. CSV dispatches to the existing row parser as a single-table result, while Excel workbooks are parsed in-browser and expanded into one table per worksheet. Analysis UI surfaces then consume the shared utility instead of the current CSV-only parser.

**Tech Stack:** React 18, TypeScript, Vitest, Papa Parse, SheetJS (`xlsx`)

---

### Task 1: Add failing tests for shared spreadsheet import

**Files:**
- Create: `frontend/src/lib/spreadsheetImport.test.ts`

**Step 1: Write the failing test for CSV dispatch**

Add a test that imports a `.csv` `File` through the new shared utility and expects a single `DataTable` with `source === 'csv'`.

**Step 2: Run test to verify it fails**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/spreadsheetImport.test.ts`
Expected: FAIL because the module does not exist yet.

**Step 3: Write the failing test for `.xlsx` workbook fan-out**

Add a test that creates an in-memory workbook with two sheets and expects two imported tables named `<workbook> - <sheet>`.

**Step 4: Run test to verify it fails**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/spreadsheetImport.test.ts`
Expected: FAIL because Excel parsing behavior does not exist yet.

**Step 5: Write the failing test for `.xls` support**

Add a test that writes the same workbook as `.xls` and expects the same worksheet fan-out.

**Step 6: Run test to verify it fails**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/spreadsheetImport.test.ts`
Expected: FAIL because `.xls` support does not exist yet.

---

### Task 2: Implement the shared spreadsheet import utility

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/src/types/dataTable.ts`
- Modify: `frontend/src/lib/csvParser.ts`
- Create: `frontend/src/lib/spreadsheetImport.ts`

**Step 1: Install the Excel parsing dependency**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npm install xlsx`

**Step 2: Add `excel` to `DataTable.source`**

Update the shared data-table types so imported workbook tabs can be labeled as Excel-backed tables.

**Step 3: Refactor shared row-to-table logic if needed**

Keep CSV behavior stable while exposing reusable helpers for turning headers and rows into `DataTable` objects.

**Step 4: Implement `spreadsheetImport.ts`**

Add:
- `isSupportedSpreadsheetFile(file)`
- `importSpreadsheetTables(file): Promise<DataTable[]>`
- workbook parsing for `.xlsx` and `.xls`
- explicit error messages for unsupported files and empty worksheets

**Step 5: Run tests to verify green**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/spreadsheetImport.test.ts src/lib/csvParser.test.ts`
Expected: PASS

---

### Task 3: Switch analysis import surfaces to the shared utility

**Files:**
- Modify: `frontend/src/components/analysis/AnalysisDataPanel.tsx`
- Modify: `frontend/src/components/analysis/flyouts/AnalysisDataFlyout.tsx`
- Modify: `frontend/src/components/analysis/AnalysisPage.tsx`

**Step 1: Write the failing behavior check if a practical test exists**

If there is an existing analysis import test harness, add a targeted failing test for workbook upload acceptance. Otherwise keep this step manual and proceed with minimal UI edits backed by parser tests.

**Step 2: Replace CSV-only imports with shared import**

Update upload handlers, drop handlers, accept attributes, copy text, and alert messages to recognize CSV / Excel imports.

**Step 3: Preserve canvas drop behavior**

On canvas drop, save every imported table and create a `data_source` node for the first table returned.

**Step 4: Run focused verification**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/spreadsheetImport.test.ts src/lib/csvParser.test.ts`
Expected: PASS

---

### Task 4: Verify the full frontend build

**Files:**
- No code changes expected

**Step 1: Run type-check/build verification**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npm run build`
Expected: PASS

**Step 2: Review changed files**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models && git diff -- docs/plans/2026-03-05-analysis-excel-import-design.md docs/plans/2026-03-05-analysis-excel-import-plan.md frontend/package.json frontend/package-lock.json frontend/src/types/dataTable.ts frontend/src/lib/csvParser.ts frontend/src/lib/spreadsheetImport.ts frontend/src/lib/spreadsheetImport.test.ts frontend/src/components/analysis/AnalysisDataPanel.tsx frontend/src/components/analysis/flyouts/AnalysisDataFlyout.tsx frontend/src/components/analysis/AnalysisPage.tsx`
Expected: Only the planned import-related changes appear.
