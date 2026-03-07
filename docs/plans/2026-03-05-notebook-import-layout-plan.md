# Notebook Import Layout Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the notebook importer’s fixed grid placement with a readable left-to-right DAG layout and a separate annotation lane for note nodes.

**Architecture:** Add a pure layout utility for notebook-imported analysis nodes that computes deterministic positions from imported nodes and edges. Update the notebook import flow to create nodes first, then apply this layout to the imported subgraph before persisting positions to the active pipeline. Notes are excluded from DAG ranking and positioned in a left-side annotation lane.

**Tech Stack:** React 18, TypeScript, Vitest

---

### Task 1: Add failing tests for notebook import layout

**Files:**
- Create: `frontend/src/lib/notebookImportLayout.test.ts`

**Step 1: Write the failing test for a linear pipeline**

Add a test that lays out `data_source -> code -> output` and expects x positions to increase monotonically left-to-right.

**Step 2: Run test to verify it fails**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/notebookImportLayout.test.ts`
Expected: FAIL because the layout module does not exist yet.

**Step 3: Write the failing test for branching**

Add a test with one upstream transform feeding two downstream outputs and expect both outputs to land in later ranks than the shared parent.

**Step 4: Run test to verify it fails**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/notebookImportLayout.test.ts`
Expected: FAIL because branching placement behavior is not implemented yet.

**Step 5: Write the failing test for note-node placement**

Add a test that includes a `note` node and expects it to sit in a separate lane to the left of the ranked non-note nodes.

**Step 6: Run test to verify it fails**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/notebookImportLayout.test.ts`
Expected: FAIL because note-lane placement does not exist yet.

---

### Task 2: Implement the notebook import layout utility

**Files:**
- Create: `frontend/src/lib/notebookImportLayout.ts`
- Test: `frontend/src/lib/notebookImportLayout.test.ts`

**Step 1: Implement explicit node sizing for analysis node types**

Add a small local size map for imported analysis node types so layout can run deterministically without DOM measurement.

**Step 2: Implement DAG ranking**

Create a pure function that:
- accepts imported nodes plus imported edges
- ignores broken edges
- computes dependency depth for non-note nodes
- biases output/export node types toward later ranks where valid

**Step 3: Implement rank and note-lane positioning**

Place non-note nodes by rank and vertical index. Place `note` nodes in a dedicated lane to the left, aligned by related import order where practical.

**Step 4: Run tests to verify green**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/notebookImportLayout.test.ts`
Expected: PASS

---

### Task 3: Apply the layout in notebook import flow

**Files:**
- Modify: `frontend/src/components/analysis/AnalysisPage.tsx`

**Step 1: Write the failing behavior check if practical**

If there is an existing import-layout test harness, add a focused failing test. Otherwise rely on the pure layout tests and keep the integration edit minimal.

**Step 2: Replace fixed grid placement with post-import layout**

Update notebook import handling so:
- imported nodes are created from the AI result
- imported edges are built
- the layout utility computes final positions
- the pipeline is updated once with the laid-out imported subgraph

**Step 3: Preserve fallback behavior**

If layout throws, keep the current simple imported positions instead of failing the import.

**Step 4: Run focused verification**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/notebookImportLayout.test.ts`
Expected: PASS

---

### Task 4: Verify notebook-related frontend paths

**Files:**
- No code changes expected

**Step 1: Run relevant frontend tests**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/notebookImportLayout.test.ts src/lib/spreadsheetImport.test.ts src/lib/csvParser.test.ts`
Expected: PASS

**Step 2: Review changed files**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models && git diff -- docs/plans/2026-03-05-notebook-import-layout-design.md docs/plans/2026-03-05-notebook-import-layout-plan.md frontend/src/lib/notebookImportLayout.ts frontend/src/lib/notebookImportLayout.test.ts frontend/src/components/analysis/AnalysisPage.tsx`
Expected: Only notebook import layout changes appear.
