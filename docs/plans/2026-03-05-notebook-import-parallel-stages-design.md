# Notebook Import Parallel Stage Generation Design

## Goal

Reduce large-notebook import latency by generating independent notebook stages concurrently while preserving stable progress UX, deterministic final graph ordering, and a single synthesis pass.

## Problem

The notebook importer now uses multiple passes, but stage generation still runs strictly sequentially. For large notebooks this makes the import feel serialized and slow even when the stage plan is already known and the stages are largely independent.

The current UX and canvas model are already prepared for multiple stages to exist at once. The backend execution model is the bottleneck.

## Recommended Approach

Run notebook stage generation in parallel with a small concurrency cap, while keeping:

- notebook analysis sequential
- section planning sequential
- workflow synthesis sequential
- SSE emission serialized from the main event loop

This gives a meaningful latency reduction without turning the backend into a rate-limit or event-ordering problem.

## Why Capped Parallelism

### Sequential stage generation

Pros:
- simplest control flow
- deterministic stage completion order

Cons:
- poor latency on large notebooks
- visibly serialized progress
- does not match the UI’s stage-first workflow model

### Full fan-out parallelism

Pros:
- lowest theoretical latency

Cons:
- high risk of Gemini rate-limit bursts
- noisier retries and failures
- harder to present clearly in the UI

### Recommended: capped parallelism

Use a small worker cap such as `3` concurrent stage generations.

This balances:

- noticeably faster imports
- manageable request volume
- readable progress behavior
- lower retry amplification

## Execution Model

### Phase 1: planning

Keep these steps unchanged and sequential:

- read notebook
- plan sections
- compute notebook analysis
- emit `analysis`
- emit `stage_plan`
- initialize all stages as `queued`

### Phase 2: stage generation

Generate stages concurrently with a bounded worker pool:

- one async task per section
- guarded by `asyncio.Semaphore(3)`
- each task runs the existing stage-generation prompt and normalization/parsing path
- each task returns a structured stage result object or a stage-scoped failure

Tasks should not write to SSE directly.

### Phase 3: result emission

Worker completion may happen out of stage order. That is fine.

When a stage task finishes, the main event loop should:

- emit any stage warnings
- emit `node` events for that stage
- emit `stage_progress: done` or `needs_review`

This preserves a readable SSE stream even though the underlying work is concurrent.

### Phase 4: synthesis

After all stage tasks settle:

- collect successful stage results
- restore planned section order before stitching
- run workflow synthesis once on the ordered successful stages
- emit `workflow`
- emit final `complete`

## Determinism

Parallel stage completion must not change final graph ordering.

Rules:

- store results keyed by `section.id`
- reassemble stage results in the original `sections` order before stitching
- build global node indices from planned order, not completion order

This preserves:

- deterministic edges
- stable final layout
- predictable tests

## Failure Handling

Stage failure should be stage-scoped by default.

Recommended behavior:

- emit `stage_progress: needs_review`
- emit a warning containing the stage name and failure message
- continue other stage tasks

Only fail the entire notebook import if:

- every stage generation fails, or
- too few usable stage results remain to produce any coherent workflow

This is a better trust model than aborting the whole import when one stage request fails.

## UX Behavior

The frontend already supports stage placeholders and stage states, so the main UX changes are behavioral rather than structural.

Expected user-visible differences:

- several stages can be `building` at once
- stages may complete out of strict planned order
- stage placeholders still remain in planned left-to-right order
- final workflow still appears in deterministic stage order after synthesis

The import should feel active instead of serialized.

## Testing

- backend regression test showing stage generation tasks can complete out of order while final node order remains in planned section order
- backend regression test showing one stage failure produces `needs_review`/warning but does not kill the whole stream when other stages succeed
- existing notebook streaming/progress tests remain green
- compile sanity for the updated route module

## Out of Scope

- parallelizing section planning
- parallelizing workflow synthesis
- changing frontend stage ordering to completion order
- introducing provider-specific batching APIs
- increasing concurrency dynamically based on notebook size or provider telemetry
