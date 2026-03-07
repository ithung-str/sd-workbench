# Notebook Import Placeholder Stages Design

## Goal

Make notebook import feel tangible on the canvas while it is still running by rendering the planned stage structure immediately and progressively filling it as stage results arrive.

## Problem

The sidebar already shows notebook import progress, but the canvas still behaves in an all-or-nothing way. Users can see that the importer has planned stages, but the main workspace does not reflect that structure until the final assembled graph is ready. That weakens trust because the artifact itself appears late.

## Recommended Approach

Render all planned imported stages as lightweight placeholder group nodes as soon as the `stage_plan` event arrives. Keep those containers fixed in a deterministic left-to-right layout, update their state as the import progresses, and attach streamed stage nodes into the matching container when each stage finishes.

This is better than revealing stage containers one at a time because it shows the full outline immediately and avoids structural jumps in the canvas.

## UX Model

### Canvas behavior

After the stage plan arrives, the canvas should show:

- one placeholder stage container per planned stage
- stable left-to-right ordering based on stage order alone
- stage title and purpose
- a clear transient state: `Queued`, `Building`, `Done`, or `Needs review`
- an empty-state body for queued stages

As stage-local node batches arrive:

- the matching placeholder stays in place
- child nodes are attached inside that stage
- the stage resizes to fit the streamed nodes
- the rest of the stage skeleton remains unchanged

Cross-stage edges should still wait for the later `workflow` event so the graph does not appear to change its mind.

### Human-readable progression

The user should experience the import in this order:

1. full workflow outline
2. one completed stage at a time
3. final workflow stitching

That matches how people understand complex processes: first the chapters, then the chapter content, then the full connected story.

## Data Model

Imported stage group nodes need transient import-state fields in the frontend model:

- `placeholder`: whether the stage exists only as an import skeleton
- `importStageState`: `queued | building | done | needs_review`
- existing imported-stage metadata should remain the main source of truth for title, purpose, inputs, outputs, and stage order

No second notebook-specific canvas object should be introduced. Placeholder stages should be ordinary imported stage group nodes with extra transient state.

## Layout

### Placeholder stage layout

Add a small pure helper that places placeholder stages deterministically from the planned stage order:

- left-to-right columns by stage order
- shared baseline and spacing
- a consistent placeholder width and minimum height
- no dependence on streamed child nodes

This helper should be separate from the final imported-notebook layout logic. Its job is not to compute the final polished graph, only to reserve stable stage slots while import is in progress.

### Finalization

When the import completes:

- run the existing final imported-notebook layout/grouping pass
- replace the temporary placeholder-stage arrangement with the final grouped graph
- preserve stage order and avoid large jumps where practical

The final layout may refine sizing and spacing, but it should not reorder the visible stages.

## Update Rules

- `stage_plan` is the only event that creates placeholder stages on the canvas.
- `stage_progress` updates placeholder stage state only if the stage already exists.
- streamed `node` results attach only to known planned stages using `group_id` / `group_name`.
- unknown stage IDs should be ignored and logged, not used to create ad hoc groups.
- synthesis or completion failures should not wipe unrelated pipeline nodes.

If a stage ends in review-needed state, keep its placeholder and any streamed child nodes visible with warning styling.

## UI Treatment

Imported stage cards should have distinct transient states:

- `queued`: faint header, empty-state copy such as `Waiting for step details`
- `building`: stronger header and subtle loading affordance
- `done`: normal imported stage treatment
- `needs_review`: warning accent with preserved contents

This transient state treatment applies only during active notebook import.

## Testing

- unit tests for placeholder stage layout helper
- UI/store coverage for creating placeholders on `stage_plan`
- UI/store coverage for updating placeholder state on `stage_progress`
- coverage that streamed nodes attach to the correct placeholder stage
- regression coverage that final completion still replaces the temporary skeleton with the grouped imported workflow

## Out of Scope

- rendering cross-stage edges before synthesis
- creating a second notebook-specific canvas mode
- changing the stage rail or sidebar progress model beyond keeping it synchronized with placeholders
- adding nested placeholder groups
