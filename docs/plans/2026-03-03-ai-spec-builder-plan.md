# Plan: Make AI Tool Build Models from SD Specifications

## Context

We have 56 SD model specification files (`frontend/models/SD_Model_Specifications/`). These are structured Markdown documents with tables defining stocks, flows, parameters, lookup tables, scenarios, and sensitivity configs.

We want the AI chat tool to be able to take one of these specs and produce a complete, runnable model. After auditing all 56 specs against current capabilities, **50 are fully buildable today**, 5 have minor workarounds needed, and 1 (22_05 Evidence-Based HIC) is infeasible without array/subscript support.

This plan covers the changes needed to make spec→model generation reliable and accessible.

---

## Gap Analysis

### Gap 1: Missing `sin`/`cos` functions

**Problem:** Model 18_06 (Seasonal Flu) requires sinusoidal seasonal immunity. Any future model with seasonal/cyclical forcing will need this too.

**Impact:** 1 model blocked, general capability gap.

**Fix:**
- Backend: Add `sin` and `cos` to the equation parser's allowed function list (`backend/app/equations/parser.py`)
- Backend: Add `sin` and `cos` evaluation in `backend/app/equations/evaluator.py` (wrapping `math.sin` / `math.cos`)
- Frontend: Add `sin` and `cos` entries to `functionCatalog.ts`
- Backend AI: Add `sin(x)` and `cos(x)` to the system prompt's "Math functions" section

### Gap 2: Frontend function catalog is incomplete

**Problem:** `functionCatalog.ts` only lists 8 of the 18 supported functions. Missing: `pulse_train`, `if_then_else`, `smooth`, `smooth3`, `delay1`, `delay3`, `delayn`, `delay_fixed`, and (after Gap 1) `sin`/`cos`. Users on the Formulas page and Inspector don't know these functions exist.

**Impact:** Discoverability — users can't find functions they need when writing equations manually.

**Fix:**
- Add all missing functions to `CORE_FUNCTIONS` array in `functionCatalog.ts`:
  ```
  if_then_else(cond, true_val, false_val) — category: "Conditional"
  pulse_train(height, first, interval, last) — category: "Time Inputs"
  delay1(input, delay_time) — category: "Delays"
  delay3(input, delay_time) — category: "Delays"
  delayn(input, delay_time, order) — category: "Delays"
  smooth(input, smooth_time) — category: "Delays"
  smooth3(input, smooth_time) — category: "Delays"
  delay_fixed(input, delay_time, initial) — category: "Delays"
  sin(x) — category: "Math"
  cos(x) — category: "Math"
  ```

### Gap 3: AI system prompt improvements for spec-based model building

**Problem:** The AI system prompt is optimized for incremental edits ("add a stock", "change equation"). When given a full spec document, it needs more guidance on:
1. How to structure a complete model from a spec table
2. How to set simulation config (start/stop/dt) from spec metadata
3. How to create scenarios and sensitivity configs from spec definitions
4. How to layout nodes in a readable arrangement (not all stacked at 0,0)

**Impact:** Reliability of full-model generation from specs.

**Fix — Update `_system_instructions()` in `ai_model_service.py`:**

Add a new section to the system prompt:

```
When building a COMPLETE model from a specification or description:
1. Set simulation config via actions: update_sim_config with start, stop, dt from the spec.
2. Layout nodes in a grid pattern — stocks in a row, flows between their source/target stocks,
   aux variables below the flows they influence. Use ~200px spacing between nodes.
   Example layout for a stock-flow pair:
   - Cloud at (x, y), Flow at (x+200, y), Stock at (x+400, y), Cloud at (x+600, y)
   - Aux parameters at (x+200, y+150) or (x+400, y+150)
3. Always create flow_link edges connecting stocks↔flows and cloud↔flows.
4. Always create influence edges from aux/parameters to the flows that use them.
5. Set all outputs to include every stock and flow variable name.
6. If the spec defines scenarios, emit create_scenario actions with the parameter overrides.
7. If the spec defines sensitivity ranges, emit create_sensitivity_config actions.
8. After building the model, emit a run_simulate action so results appear immediately.
```

### Gap 4: "Build from spec" UI entry point

**Problem:** Users have no way to load a spec and send it to the AI. They'd have to manually copy-paste the entire spec into the chat input (which has a small textarea).

**Impact:** UX friction — the primary use case (build model from spec) is awkward.

**Fix — Add a "Build from Spec" action in the AI chat or model picker:**

**Option A (recommended): Spec picker in the model picker dropdown.**
- Add a "From Specification..." section in the existing model picker (`WorkbenchLayoutMantine.tsx`), grouping the 56 specs by chapter (06=Intro, 10=Physics, 14=Simple, 18=Intermediate, 22=Advanced).
- When user selects a spec, load the markdown content and send it to the AI as a prompt: `"Build a complete SD model from this specification:\n\n{spec_content}"`.
- This reuses the existing AI pipeline with no new backend routes needed.

**Implementation:**
1. Create a new file `frontend/src/lib/specCatalog.ts` that exports a list of `{id, title, chapter, filename}` entries for all 56 specs.
2. Embed the spec markdown files as static assets (or use `import.meta.glob`).
3. Add a "Specifications" group to the model picker Select component.
4. When selected, call `runAiCommand()` with the spec content as the prompt.

### Gap 5: Auto-layout for AI-generated models

**Problem:** The AI tries to place nodes at reasonable positions, but for complex models (10+ nodes), the results often overlap or are hard to read. The repair function defaults to `(0, 0)` for missing positions.

**Impact:** Usability — generated models need manual rearranging.

**Fix — Post-generation auto-layout:**
- After the AI generates a full model, run an auto-layout pass before applying it to the store.
- Use the existing `autoLayoutModel()` function (if available) or implement a simple force-directed / grid layout:
  - Place stocks in a horizontal row with 250px spacing
  - Place flows between their connected stocks
  - Place aux variables in rows below, aligned to the flows they influence
  - Place clouds at the ends of flow chains
- This can be done client-side in `editorStore.ts` when receiving a full-model AI response.

### Gap 6: Larger context / multi-step generation for complex models

**Problem:** Models with 10+ stocks (e.g., Beer Game with 12 stocks) may exceed what the AI can reliably produce in a single prompt. The current 3-retry pipeline helps but may not be enough for 40+ node models.

**Impact:** Reliability for Chapter 18/22 models.

**Fix — Two approaches (implement both):**

**A. Spec pre-processing on the backend:**
- Before sending to Gemini, parse the spec markdown to extract structured data (stocks table, flows table, parameters, etc.)
- Send both the raw spec AND a structured summary to Gemini, reducing ambiguity
- Add to the system prompt: "When given a structured spec, follow it exactly — do not invent additional variables."

**B. Chunked generation (future, if needed):**
- For specs with >10 stocks: first generate the stock-flow skeleton (stocks + flows + flow_links), then in a follow-up prompt add aux variables and influences.
- This leverages the existing multi-turn conversation capability.
- Only implement if Gap 3+5 fixes don't achieve sufficient reliability.

### Gap 7: Validation/test harness for spec coverage

**Problem:** No automated way to verify the AI can build all 56 specs. Manual testing is tedious.

**Impact:** Confidence in the feature.

**Fix — Create a spec validation script:**
- `backend/scripts/test_spec_generation.py` (or similar)
- For each spec file: send it to the AI endpoint, validate the returned model, check that it simulates without errors
- Report: which specs pass/fail, what errors occur
- This is a developer tool, not a user-facing feature
- Can run against real Gemini API (costs money) or with mocked responses for CI

---

## Summary of Changes

| # | Area | Change | Priority |
|---|------|--------|----------|
| 1 | Backend equation engine | Add `sin`/`cos` to parser + evaluator | High |
| 2 | Frontend function catalog | Add 10 missing functions to `functionCatalog.ts` | High |
| 3 | Backend AI system prompt | Add spec-building guidelines, layout hints, action chaining | High |
| 4 | Frontend UX | Add spec picker in model picker dropdown | High |
| 5 | Frontend/store | Post-generation auto-layout for AI models | Medium |
| 6 | Backend AI | Spec pre-processing for structured extraction | Medium |
| 7 | Backend scripts | Spec validation test harness | Low |

## Execution Order

1. **Gap 1 + Gap 2** (sin/cos + function catalog) — unblocks all 56 models functionally
2. **Gap 3** (system prompt) — makes spec generation reliable
3. **Gap 4** (spec picker UI) — makes the feature accessible
4. **Gap 5** (auto-layout) — makes results usable without manual cleanup
5. **Gap 6** (pre-processing) — improves reliability for complex models
6. **Gap 7** (test harness) — validates the full pipeline

## Models NOT feasible (out of scope)

| Model | Reason |
|-------|--------|
| 22_05 Evidence-Based HIC | Requires 2D subscripts (20×3), random functions, Excel integration, cross-subscript SUM — fundamental engine limitation |

This model would require adding array/subscript support to the entire stack (schema, parser, evaluator, translator, integrator, frontend types) — a major feature beyond the scope of this plan.
</content>
</invoke>