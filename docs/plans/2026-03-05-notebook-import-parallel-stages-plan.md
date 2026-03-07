# Notebook Import Parallel Stage Generation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make large notebook imports faster by generating notebook stages concurrently with a bounded worker cap while preserving deterministic final graph ordering and readable stage progress.

**Architecture:** Keep notebook analysis, section planning, and workflow synthesis sequential. Convert stage generation into capped parallel tasks coordinated by the notebook route, serialize SSE emission in the main event loop, and reassemble stage results back into planned stage order before stitching and synthesis.

**Tech Stack:** FastAPI, asyncio, Pydantic, Pytest

---

### Task 1: Add a failing backend test for out-of-order stage completion

**Files:**
- Modify: `backend/tests/unit/test_notebook_api.py`

**Step 1: Write the failing test**

Add a test where stage-generation calls complete in a different order than the section plan, but the final stitched response still returns nodes in planned section order.

**Step 2: Run test to verify it fails**

Run: `pytest backend/tests/unit/test_notebook_api.py::test_transform_notebook_preserves_section_order_when_stage_generation_completes_out_of_order -q`
Expected: FAIL because stage generation is currently sequential and does not exercise out-of-order completion.

**Step 3: Write the minimal implementation**

Introduce parallel stage execution while preserving planned-order assembly for the final response.

**Step 4: Run test to verify it passes**

Run: `pytest backend/tests/unit/test_notebook_api.py::test_transform_notebook_preserves_section_order_when_stage_generation_completes_out_of_order -q`
Expected: PASS

### Task 2: Add a failing backend test for partial stage failure tolerance

**Files:**
- Modify: `backend/tests/unit/test_notebook_api.py`

**Step 1: Write the failing test**

Add a test where one stage-generation call raises an exception, but other stages succeed and the stream still completes with warnings and usable nodes.

**Step 2: Run test to verify it fails**

Run: `pytest backend/tests/unit/test_notebook_api.py::test_transform_notebook_stream_continues_when_one_stage_generation_fails -q`
Expected: FAIL because the current multi-pass stream path aborts on stage-generation exceptions.

**Step 3: Write the minimal implementation**

Handle stage-generation failures per stage, mark failed stages as review-needed, and continue processing remaining stages.

**Step 4: Run test to verify it passes**

Run: `pytest backend/tests/unit/test_notebook_api.py::test_transform_notebook_stream_continues_when_one_stage_generation_fails -q`
Expected: PASS

### Task 3: Implement bounded parallel stage generation

**Files:**
- Modify: `backend/app/api/routes_notebook.py`
- Test: `backend/tests/unit/test_notebook_api.py`

**Step 1: Extract async stage-generation worker logic**

Add an async helper that wraps one stage-generation request, normalization, edge parsing, and warning collection.

**Step 2: Add a concurrency cap**

Use `asyncio.Semaphore(3)` around stage-generation execution so only a small number of stage requests run at once.

**Step 3: Keep SSE emission centralized**

Ensure worker tasks return structured results while the route’s main event loop remains the only place that emits `warning`, `node`, and `stage_progress` events.

**Step 4: Preserve deterministic final assembly**

Reorder successful stage results back into the original `sections` order before stitching and synthesis.

**Step 5: Run focused backend tests**

Run: `pytest backend/tests/unit/test_notebook_api.py -q`
Expected: PASS

### Task 4: Implement partial-failure handling in the streaming route

**Files:**
- Modify: `backend/app/api/routes_notebook.py`
- Test: `backend/tests/unit/test_notebook_api.py`

**Step 1: Continue past single-stage failures**

When a stage task fails, emit:
- `stage_progress: needs_review`
- a stage-scoped warning

Do not abort the whole import if other stage results remain usable.

**Step 2: Fail only when no usable stages remain**

If every stage fails, return the existing overall error behavior.

**Step 3: Run focused streaming verification**

Run: `pytest backend/tests/unit/test_notebook_api.py -q`
Expected: PASS

### Task 5: Verify notebook backend regressions

**Files:**
- No code changes expected

**Step 1: Run notebook/backend regression suite**

Run: `pytest backend/tests/unit/test_notebook_api.py backend/tests/unit/test_notebook_planner.py backend/tests/unit/test_analysis_api.py -q`
Expected: PASS

**Step 2: Run compile sanity**

Run: `python -m py_compile backend/app/api/routes_notebook.py backend/app/schemas/notebook.py backend/app/services/notebook_planner.py`
Expected: PASS

**Step 3: Review changed files**

Run: `git diff -- docs/plans/2026-03-05-notebook-import-parallel-stages-design.md docs/plans/2026-03-05-notebook-import-parallel-stages-plan.md backend/app/api/routes_notebook.py backend/tests/unit/test_notebook_api.py`
Expected: only parallel stage-generation and related regression changes appear.
