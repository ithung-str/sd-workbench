# Notebook Import Placeholder Stages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Render imported notebook stages as placeholder containers on the canvas as soon as the stage plan arrives, then progressively fill those stages as node batches stream in.

**Architecture:** Reuse imported stage group nodes as the temporary placeholder representation instead of inventing a second canvas object. Create placeholder stage slots from `stage_plan`, update their transient state from `stage_progress`, and attach streamed stage nodes into those containers before replacing the temporary arrangement with the existing final grouped layout on completion.

**Tech Stack:** TypeScript, React 18, Zustand, Vitest

---

### Task 1: Add failing layout tests for placeholder stage slots

**Files:**
- Modify: `frontend/src/lib/notebookImportLayout.test.ts`
- Modify: `frontend/src/lib/notebookImportLayout.ts`

**Step 1: Write the failing test**

Add a test for a new placeholder-stage layout helper that expects:
- one slot per planned stage
- deterministic left-to-right order
- stable spacing independent of streamed nodes

**Step 2: Run test to verify it fails**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/notebookImportLayout.test.ts`
Expected: FAIL because placeholder stage layout does not exist yet.

**Step 3: Write the minimal implementation**

Add a pure helper that maps planned stages to deterministic placeholder positions and minimum sizes.

**Step 4: Run test to verify it passes**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/notebookImportLayout.test.ts`
Expected: PASS

### Task 2: Add failing tests for transient imported stage state

**Files:**
- Modify: `frontend/src/components/workbench/AIChatSidebar.test.tsx`
- Modify: `frontend/src/components/analysis/ImportedStageRail.test.tsx`
- Modify: `frontend/src/types/model.ts`

**Step 1: Write the failing test**

Add or extend a test so imported stages can carry transient placeholder state without breaking existing imported-stage rendering assumptions.

**Step 2: Run test to verify it fails**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/components/analysis/ImportedStageRail.test.tsx src/components/workbench/AIChatSidebar.test.tsx`
Expected: FAIL because the transient placeholder state is not yet modeled.

**Step 3: Write the minimal implementation**

Extend the imported stage node metadata with:
- `placeholder`
- `importStageState`

**Step 4: Run test to verify it passes**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/components/analysis/ImportedStageRail.test.tsx src/components/workbench/AIChatSidebar.test.tsx`
Expected: PASS

### Task 3: Add failing canvas-progress tests for placeholder creation

**Files:**
- Modify: existing frontend analysis-page/store tests if present
- If no direct test exists, create focused coverage near `frontend/src/components/analysis/AnalysisPage.tsx`

**Step 1: Write the failing test**

Add a test that simulates notebook import progress and expects placeholder stage groups to appear on `stage_plan` before any `node` events.

**Step 2: Run test to verify it fails**

Run: the narrow Vitest command for the chosen test file
Expected: FAIL because the canvas is still populated only by streamed nodes and final completion.

**Step 3: Write the minimal implementation**

Update the import event handling so `stage_plan` creates temporary imported stage groups in the active pipeline using deterministic placeholder positions.

**Step 4: Run test to verify it passes**

Run: the same narrow Vitest command
Expected: PASS

### Task 4: Add failing tests for stage-progress state updates

**Files:**
- Modify: the same analysis-page/store test file used in Task 3
- Modify: `frontend/src/components/analysis/nodes/GroupNode.tsx`

**Step 1: Write the failing test**

Add a test that sends `stage_progress` updates and expects the corresponding placeholder stage to move through `queued -> building -> done` or `needs_review`.

**Step 2: Run test to verify it fails**

Run: the narrow Vitest command for that test file
Expected: FAIL because stage-progress events do not yet update canvas-stage state.

**Step 3: Write the minimal implementation**

Update the placeholder stage node in the pipeline when `stage_progress` arrives and teach `GroupNode` to render the transient stage states and empty-state copy.

**Step 4: Run test to verify it passes**

Run: the same narrow Vitest command
Expected: PASS

### Task 5: Add failing tests for streamed node attachment

**Files:**
- Modify: the same analysis-page/store test file used above
- Modify: `frontend/src/components/analysis/AnalysisPage.tsx`

**Step 1: Write the failing test**

Add a test that streams a node with `group_id` / `group_name` and expects it to be attached to the matching placeholder stage instead of remaining an ungrouped temporary node.

**Step 2: Run test to verify it fails**

Run: the narrow Vitest command for that test file
Expected: FAIL because streamed nodes are not yet reconciled against placeholder groups.

**Step 3: Write the minimal implementation**

Update the streaming node handler to:
- keep temporary import nodes grouped by planned stage
- preserve placeholder stage position
- resize or finalize that stage container without moving the rest of the skeleton

**Step 4: Run test to verify it passes**

Run: the same narrow Vitest command
Expected: PASS

### Task 6: Preserve final grouped completion behavior

**Files:**
- Modify: `frontend/src/components/analysis/AnalysisPage.tsx`
- Modify: `frontend/src/lib/notebookImportGroups.ts` only if needed

**Step 1: Add or extend a regression test**

Ensure the final `complete` path still replaces temporary placeholder artifacts with the grouped imported workflow and does not leave duplicate temporary nodes behind.

**Step 2: Run test to verify it fails if necessary**

Run: the narrow Vitest command for the relevant file
Expected: FAIL if duplicates or stale placeholders remain.

**Step 3: Write the minimal implementation**

Keep the current final grouping/layout pass, but cleanly swap out placeholder-only artifacts from this import session before inserting the final grouped nodes.

**Step 4: Run test to verify it passes**

Run: the same narrow Vitest command
Expected: PASS

### Task 7: Verify focused notebook import UI regressions

**Files:**
- No code changes expected

**Step 1: Run focused frontend verification**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/notebookImportLayout.test.ts src/components/analysis/ImportedStageRail.test.tsx src/components/workbench/AIChatSidebar.test.tsx`
Expected: PASS

**Step 2: Run broader frontend notebook-import verification**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/api.test.ts src/components/workbench/AIChatSidebar.test.tsx src/components/analysis/ImportedStageRail.test.tsx src/lib/notebookImportGroups.test.ts src/lib/notebookImportLayout.test.ts src/lib/spreadsheetImport.test.ts src/lib/csvParser.test.ts`
Expected: PASS

**Step 3: Review changed files**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models && git diff -- docs/plans/2026-03-05-notebook-import-placeholder-stages-design.md docs/plans/2026-03-05-notebook-import-placeholder-stages-plan.md frontend/src/lib/notebookImportLayout.ts frontend/src/lib/notebookImportLayout.test.ts frontend/src/components/analysis/AnalysisPage.tsx frontend/src/components/analysis/nodes/GroupNode.tsx frontend/src/types/model.ts`
Expected: only placeholder-stage canvas updates and related tests/docs appear.
