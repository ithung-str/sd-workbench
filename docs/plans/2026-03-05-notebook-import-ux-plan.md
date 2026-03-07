# Notebook Import UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Improve notebook import by showing clearer live progress, structuring large notebooks into smart flat groups, and rendering imported pipelines as more readable grouped left-to-right flows.

**Architecture:** Add a deterministic notebook-analysis pre-pass plus a multi-pass AI import pipeline: section planning first, then node generation by section. Extend notebook stream events to report phase-level progress and fallback state. Apply grouped import layout and smoother imported-edge styling on the frontend, with adaptive default collapse for large notebook imports.

**Tech Stack:** FastAPI, Pydantic, TypeScript, React 18, Vitest, Pytest

---

### Task 1: Add failing backend tests for notebook progress events

**Files:**
- Modify: `backend/tests/unit/test_notebook_api.py`

**Step 1: Write the failing test for explicit fallback status**

Add a test that forces notebook streaming to stall and expects the SSE stream to include the fallback status message before completion.

**Step 2: Run test to verify it fails**

Run: `pytest backend/tests/unit/test_notebook_api.py::test_transform_notebook_stream_reports_fallback_status -q`
Expected: FAIL because the route does not yet guarantee the richer staged progress output.

**Step 3: Write the failing test for staged status emission**

Add a test for a successful notebook transform path that expects at least one intermediate notebook-specific status beyond `Calling AI...`.

**Step 4: Run test to verify it fails**

Run: `pytest backend/tests/unit/test_notebook_api.py -q`
Expected: FAIL because the route currently emits minimal status transitions.

---

### Task 2: Implement richer backend notebook progress reporting

**Files:**
- Modify: `backend/app/api/routes_notebook.py`
- Test: `backend/tests/unit/test_notebook_api.py`

**Step 1: Add explicit notebook-import stage statuses**

Emit clear statuses for structure analysis, section planning, node generation, layout, and fallback retry.

**Step 2: Keep fallback behavior compatible**

Preserve the existing non-stream fallback path while making its progress visible to the frontend.

**Step 3: Run tests to verify green**

Run: `pytest backend/tests/unit/test_notebook_api.py -q`
Expected: PASS

---

### Task 3: Add failing tests for notebook section planning and layout helpers

**Files:**
- Create: `backend/tests/unit/test_notebook_planner.py`
- Create: `frontend/src/lib/notebookImportLayout.test.ts`

**Step 1: Write the failing backend test for section planning**

Add a test that feeds a notebook-like cell list into the future planner and expects a flat section outline with stable top-level groups.

**Step 2: Run test to verify it fails**

Run: `pytest backend/tests/unit/test_notebook_planner.py -q`
Expected: FAIL because the planner does not exist yet.

**Step 3: Write the failing frontend test for grouped notebook layout**

Add a test that expects grouped imported nodes to layout left-to-right and note nodes to sit outside the main flow.

**Step 4: Run test to verify it fails**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/notebookImportLayout.test.ts`
Expected: FAIL because grouped layout support is not implemented yet.

---

### Task 4: Implement deterministic notebook analysis and section planning

**Files:**
- Create: `backend/app/services/notebook_planner.py`
- Modify: `backend/app/schemas/notebook.py`
- Modify: `backend/app/api/routes_notebook.py`
- Test: `backend/tests/unit/test_notebook_planner.py`

**Step 1: Add notebook planning schemas**

Extend notebook transform-related schemas with flat grouping concepts such as section/group IDs, names, and purposes, while keeping the current response shape compatible where possible.

**Step 2: Implement deterministic pre-pass helpers**

Analyze notebook cells for heading boundaries, load/export/visualization markers, and lightweight variable metadata.

**Step 3: Implement the section-planning pass**

Add a planner that combines deterministic hints with an AI planning step to produce 4-10 flat semantic sections.

**Step 4: Run planner tests**

Run: `pytest backend/tests/unit/test_notebook_planner.py -q`
Expected: PASS

---

### Task 5: Implement node generation by section

**Files:**
- Modify: `backend/app/api/routes_notebook.py`
- Modify: `frontend/src/lib/api.ts`

**Step 1: Change notebook transform to multi-pass generation**

Update the backend notebook import flow so section planning happens first, followed by node generation per section rather than one monolithic notebook-to-graph prompt.

**Step 2: Include group assignment in node results**

Return enough metadata for the frontend to build flat groups and place nodes inside them.

**Step 3: Preserve compatibility for existing import consumers**

Keep the top-level transform response understandable to the current UI while extending it with grouping metadata.

**Step 4: Run focused backend tests**

Run: `pytest backend/tests/unit/test_notebook_api.py backend/tests/unit/test_notebook_planner.py -q`
Expected: PASS

---

### Task 6: Apply grouped notebook layout and adaptive collapse on the frontend

**Files:**
- Create: `frontend/src/lib/notebookImportLayout.ts`
- Modify: `frontend/src/components/analysis/AnalysisPage.tsx`
- Modify: `frontend/src/types/model.ts`
- Modify: `frontend/src/lib/api.ts`
- Test: `frontend/src/lib/notebookImportLayout.test.ts`

**Step 1: Implement grouped import layout**

Create a pure layout utility that:
- places groups left-to-right
- places nodes within each group in a compact local DAG
- parks note nodes as annotations

**Step 2: Apply adaptive collapse defaults**

Collapse secondary groups automatically for large notebook imports while keeping the main path open.

**Step 3: Run frontend tests**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/notebookImportLayout.test.ts`
Expected: PASS

---

### Task 7: Adjust imported notebook edge styling

**Files:**
- Modify: `frontend/src/components/analysis/AnalysisPage.tsx`
- Modify: any imported-edge rendering helper used by the analysis canvas

**Step 1: Write the failing test if an edge-style test harness exists**

If practical, add a small test for imported edge style selection. Otherwise keep this change narrow and verify visually.

**Step 2: Switch imported notebook edges away from heavy perpendicular routing**

Use smoother, less dominant edge styling for notebook-imported graphs.

**Step 3: Run focused verification**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/notebookImportLayout.test.ts`
Expected: PASS

---

### Task 8: Verify end-to-end targeted paths

**Files:**
- No code changes expected

**Step 1: Run backend verification**

Run: `pytest backend/tests/unit/test_notebook_api.py backend/tests/unit/test_notebook_planner.py backend/tests/unit/test_analysis_api.py -q`
Expected: PASS

**Step 2: Run frontend verification**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/notebookImportLayout.test.ts src/lib/spreadsheetImport.test.ts src/lib/csvParser.test.ts`
Expected: PASS

**Step 3: Review changed files**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models && git diff -- docs/plans/2026-03-05-notebook-import-ux-design.md docs/plans/2026-03-05-notebook-import-ux-plan.md backend/app/api/routes_notebook.py backend/app/schemas/notebook.py backend/app/services/notebook_planner.py backend/tests/unit/test_notebook_api.py backend/tests/unit/test_notebook_planner.py frontend/src/lib/notebookImportLayout.ts frontend/src/lib/notebookImportLayout.test.ts frontend/src/components/analysis/AnalysisPage.tsx frontend/src/lib/api.ts frontend/src/types/model.ts`
Expected: Only notebook import UX, grouping, and layout changes appear.

### Task 9: Add failing frontend tests for stage summaries

**Files:**
- Modify: `frontend/src/lib/notebookImportGroups.test.ts`

**Step 1: Write the failing test for imported stage metadata**

Add a test that expects imported notebook groups to expose purpose, input/output summaries, step counts, and stage ordering derived from grouped nodes.

**Step 2: Run test to verify it fails**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/notebookImportGroups.test.ts`
Expected: FAIL because imported groups currently only expose generic container fields.

### Task 10: Implement stage metadata and main-path classification

**Files:**
- Modify: `frontend/src/lib/notebookImportGroups.ts`
- Modify: `frontend/src/types/model.ts`
- Test: `frontend/src/lib/notebookImportGroups.test.ts`

**Step 1: Extend imported group nodes with stage metadata**

Add fields for purpose, key inputs, key outputs, step count, and main-path/branch role.

**Step 2: Derive summary data from imported nodes and edges**

Compute the stage summaries from grouped imported nodes rather than asking the backend for a second stage-specific response.

**Step 3: Run tests to verify green**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/notebookImportGroups.test.ts`
Expected: PASS

### Task 11: Add failing UI tests for stage rail presentation

**Files:**
- Create: `frontend/src/components/analysis/ImportedStageRail.test.tsx`

**Step 1: Write the failing test for stage rail rendering**

Add a test that renders imported stages in order and highlights the selected stage.

**Step 2: Run test to verify it fails**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/components/analysis/ImportedStageRail.test.tsx`
Expected: FAIL because the rail does not exist yet.

### Task 12: Build stage rail and richer stage cards

**Files:**
- Create: `frontend/src/components/analysis/ImportedStageRail.tsx`
- Modify: `frontend/src/components/analysis/AnalysisPage.tsx`
- Modify: `frontend/src/components/analysis/nodes/GroupNode.tsx`
- Test: `frontend/src/components/analysis/ImportedStageRail.test.tsx`

**Step 1: Add a stage rail to the analysis canvas**

Render imported stages in reading order with step counts and selection state, and wire clicks to zoom/select.

**Step 2: Upgrade imported group cards into stage cards**

Show purpose, key inputs/outputs, and branch role in collapsed imported groups while preserving generic group behavior elsewhere.

**Step 3: Add toolbar controls for imported stages**

Provide `Expand all`, `Collapse all`, and `Main path only` actions when notebook-imported stages are present.

**Step 4: Run focused UI verification**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/components/analysis/ImportedStageRail.test.tsx src/lib/notebookImportGroups.test.ts`
Expected: PASS

### Task 13: Run targeted notebook-import verification

**Files:**
- No code changes expected

**Step 1: Run frontend verification**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/components/analysis/ImportedStageRail.test.tsx src/lib/notebookImportGroups.test.ts src/lib/notebookImportLayout.test.ts src/lib/spreadsheetImport.test.ts src/lib/csvParser.test.ts`
Expected: PASS

**Step 2: Review changed files**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models && git diff -- docs/plans/2026-03-05-notebook-import-ux-design.md docs/plans/2026-03-05-notebook-import-ux-plan.md frontend/src/components/analysis/AnalysisPage.tsx frontend/src/components/analysis/ImportedStageRail.tsx frontend/src/components/analysis/ImportedStageRail.test.tsx frontend/src/components/analysis/nodes/GroupNode.tsx frontend/src/lib/notebookImportGroups.ts frontend/src/lib/notebookImportGroups.test.ts frontend/src/types/model.ts`
Expected: Only notebook-import stage UI changes appear.

### Task 14: Add failing backend tests for notebook-specific SSE events

**Files:**
- Modify: `backend/tests/unit/test_notebook_api.py`

**Step 1: Write the failing test for notebook analysis and stage plan events**

Add a streaming notebook import test that expects `analysis` and `stage_plan` SSE events before the final `complete`.

**Step 2: Write the failing test for stage progress and workflow events**

Add a streaming notebook import test that expects `stage_progress` events and a final `workflow` event containing main-path stage IDs.

**Step 3: Run test to verify it fails**

Run: `pytest backend/tests/unit/test_notebook_api.py -q`
Expected: FAIL because the route currently emits only generic `status`, `text`, `node`, and `complete`.

### Task 15: Add failing frontend tests for notebook stream parsing and progress rendering

**Files:**
- Modify: `frontend/src/lib/api.test.ts`
- Create: `frontend/src/components/workbench/AIChatSidebar.test.tsx`

**Step 1: Write the failing API client test**

Add a test that feeds notebook-import SSE events into `transformNotebookStream` and expects callbacks for `analysis`, `stage_plan`, `stage_progress`, and `workflow`.

**Step 2: Write the failing sidebar render test**

Render the AI sidebar with notebook-import progress state and verify that the stage checklist appears above raw AI debug text.

**Step 3: Run tests to verify they fail**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/api.test.ts src/components/workbench/AIChatSidebar.test.tsx`
Expected: FAIL because the client and sidebar do not yet support notebook-specific progress state.

### Task 16: Implement notebook analysis metadata and SSE event contract

**Files:**
- Modify: `backend/app/schemas/notebook.py`
- Modify: `backend/app/services/notebook_planner.py`
- Modify: `backend/app/api/routes_notebook.py`
- Test: `backend/tests/unit/test_notebook_api.py`

**Step 1: Add notebook analysis metadata**

Expose deterministic notebook-analysis output such as code cell counts, export counts, and complexity tier.

**Step 2: Emit notebook-specific SSE events**

Stream `analysis`, `stage_plan`, `stage_progress`, `workflow`, and `warning` events in addition to existing status/node events.

**Step 3: Preserve current notebook transform compatibility**

Keep the final `complete` payload and incremental node events intact so the current importer continues to build nodes.

**Step 4: Run backend tests**

Run: `pytest backend/tests/unit/test_notebook_api.py backend/tests/unit/test_notebook_planner.py -q`
Expected: PASS

### Task 17: Implement frontend notebook progress state and sidebar rendering

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/types/model.ts`
- Modify: `frontend/src/state/editorStore.ts`
- Modify: `frontend/src/components/analysis/AnalysisPage.tsx`
- Modify: `frontend/src/components/workbench/AIChatSidebar.tsx`
- Test: `frontend/src/lib/api.test.ts`
- Test: `frontend/src/components/workbench/AIChatSidebar.test.tsx`

**Step 1: Parse notebook SSE events in the client**

Extend `transformNotebookStream` to expose notebook-specific callbacks for analysis, stage plan, stage progress, workflow, and warnings.

**Step 2: Store notebook import progress explicitly**

Add notebook-import progress state to the editor store so the sidebar can render a real checklist rather than inferring from raw text.

**Step 3: Render the notebook progress panel**

Show the current phase, notebook summary, stage checklist, and warnings above any raw streamed AI text while notebook import is active.

**Step 4: Run focused frontend tests**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/api.test.ts src/components/workbench/AIChatSidebar.test.tsx`
Expected: PASS

### Task 18: Run targeted verification for notebook multi-pass progress UX

**Files:**
- No code changes expected

**Step 1: Run backend verification**

Run: `pytest backend/tests/unit/test_notebook_api.py backend/tests/unit/test_notebook_planner.py backend/tests/unit/test_analysis_api.py -q`
Expected: PASS

**Step 2: Run frontend verification**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/api.test.ts src/components/workbench/AIChatSidebar.test.tsx src/components/analysis/ImportedStageRail.test.tsx src/lib/notebookImportGroups.test.ts src/lib/notebookImportLayout.test.ts src/lib/spreadsheetImport.test.ts src/lib/csvParser.test.ts`
Expected: PASS

### Task 19: Add failing backend tests for true per-stage generation

**Files:**
- Modify: `backend/tests/unit/test_notebook_api.py`

**Step 1: Write the failing transform test for stage-local generation**

Add a notebook transform test that expects:
- section planning to run first
- one stage-generation AI call per section
- a separate workflow-synthesis AI call
- final node group assignment and cross-stage edges

**Step 2: Write the failing stream test for progressive stage completion**

Add a streaming notebook import test that expects each stage to move from `building` to `done` only after its local node batch has been produced, with cross-stage connections delayed until synthesis.

**Step 3: Run tests to verify they fail**

Run: `pytest backend/tests/unit/test_notebook_api.py -q`
Expected: FAIL because the backend still does monolithic graph generation after planning.

### Task 20: Implement adaptive per-stage generation and workflow synthesis

**Files:**
- Modify: `backend/app/api/routes_notebook.py`
- Modify: `backend/app/services/notebook_planner.py`
- Test: `backend/tests/unit/test_notebook_api.py`

**Step 1: Add stage-local prompt builders and synthesis prompt builders**

Create explicit helpers for:
- per-stage node generation
- workflow synthesis across completed stages

**Step 2: Implement adaptive generation mode**

Use the existing notebook analysis to keep tiny notebooks on the fast path and run true per-stage generation plus synthesis for medium/large notebooks.

**Step 3: Stream stage-complete node batches**

Emit stage-level progress and node events after each completed stage, then delay cross-stage wiring until the synthesis pass.

**Step 4: Preserve final response compatibility**

Return the same `TransformNotebookResponse` shape so the current frontend still works, while sourcing nodes and edges from the multi-pass backend.

**Step 5: Run backend verification**

Run: `pytest backend/tests/unit/test_notebook_api.py backend/tests/unit/test_notebook_planner.py -q`
Expected: PASS

### Task 21: Run targeted notebook-import verification after multi-pass backend

**Files:**
- No code changes expected

**Step 1: Run backend verification**

Run: `pytest backend/tests/unit/test_notebook_api.py backend/tests/unit/test_notebook_planner.py backend/tests/unit/test_analysis_api.py -q`
Expected: PASS

**Step 2: Run frontend regression verification**

Run: `cd /Users/ivanthung/code/structural/structural-sd-models/frontend && npx vitest run src/lib/api.test.ts src/components/workbench/AIChatSidebar.test.tsx src/components/analysis/ImportedStageRail.test.tsx src/lib/notebookImportGroups.test.ts src/lib/notebookImportLayout.test.ts src/lib/spreadsheetImport.test.ts src/lib/csvParser.test.ts`
Expected: PASS
