# Notebook Import UX Design

## Goal

Make notebook import feel visible, structured, and readable by improving progress feedback during AI import and replacing flat node dumps with smart grouped pipelines.

## Problems

### Progress visibility

The current notebook import flow often sits on “Calling AI...” because progress is only visible when Gemini emits usable stream chunks. If the stream stalls or the backend falls back to a non-streaming request, the user gets little or no intermediate feedback.

### Structural readability

The current notebook transform prompt converts an entire notebook into a single flat node/edge graph. For large notebooks, this loses stage boundaries and produces an analysis pipeline that is harder to follow than the original notebook.

## Architecture

Split notebook import into three concerns:

1. **Progress UX**: emit explicit notebook-import stage updates and show them live in the chat/import UI.
2. **Semantic structuring**: use a deterministic notebook pre-pass plus multiple AI passes to derive top-level workflow sections before generating detailed nodes.
3. **Imported graph presentation**: render notebook imports as grouped left-to-right workflows with lighter, smoother edges and adaptive collapsed groups.

This should remain backward-compatible with existing notebook import entry points while improving both reliability and readability.

## Progress UX

### Status stages

Notebook import should expose a clearer status progression:

- `Calling AI...`
- `Analyzing notebook structure...`
- `Receiving section plan...`
- `Generating nodes for section X/Y...`
- `Laying out imported pipeline...`
- `Import complete`

If streaming stalls:

- show `Streaming stalled; retrying without streaming...`
- keep the chat sidebar visibly active rather than frozen

### Streaming behavior

- Continue streaming raw AI text into the chat sidebar when available.
- Surface section-level progress even if node-level streaming is not yet possible.
- Treat fallback mode as a valid import path with explicit messaging, not as a silent black box.

### Notebook import event contract

Notebook import should emit notebook-specific SSE events instead of relying on a single generic status line:

- `status`: current phase label and human-readable message
- `analysis`: notebook cell counts, detected complexity tier, and workflow summary
- `stage_plan`: ordered stage list as soon as planning finishes
- `stage_progress`: per-stage state (`queued`, `building`, `done`, `needs_review`)
- `workflow`: main-path stage IDs and collapse recommendations
- `warning`: notebook-specific import caveats
- `complete`: final nodes, edges, sections, warnings

The frontend should still accept `text` and `node` events, but notebook understanding should no longer depend on raw token streaming.

## Semantic Grouping

### Deterministic pre-pass

Before calling AI, analyze notebook cells to extract:

- markdown heading structure
- likely stage boundaries
- data-load, visualization, and export boundaries
- lightweight code metadata such as variable reads/writes and source/export hints

Headings are hints, not hard rules.

### AI pass 1: section planning

Generate a flat section plan for the notebook:

- 4-10 top-level groups
- short names
- one-sentence purpose
- associated cell ranges or cell IDs
- warnings/confidence when grouping is uncertain

Grouping priority:

1. semantic dataflow stages
2. markdown headings
3. dataframe/business-concept continuity
4. output/export boundaries

### AI pass 2: node generation by section

Generate nodes and edges inside each section:

- merge tiny related cells
- avoid over-fragmenting simple chains
- preserve original cell references
- assign every node to a `group_id`

For now, render only one visible group level even if deeper hierarchy hints are available internally.

## Group Behavior

### Flat groups

Use a single visible group layer for imported notebooks.

Why:

- improves readability immediately
- avoids nested-container complexity
- still leaves room for hierarchical grouping later

### Default collapse policy

- `<= 8` non-note nodes: open all groups
- `9-20` non-note nodes: open all groups, emphasize boundaries
- `> 20` non-note nodes: collapse secondary groups by default

For large notebooks, keep open:

- the main input group
- the dominant transformation spine
- the final output/export group

## Visual Treatment

### Layout

- lay out imported notebook groups left-to-right by dependency
- lay out nodes inside each group as a compact local DAG
- place note nodes as annotations, not processing nodes

### Stage-first reading order

Imported notebook groups should read like workflow stages, not anonymous graph containers.

Each imported stage should expose:

- short verb+noun title
- one-line purpose
- key inputs
- key outputs
- step count

Users should be able to understand the imported notebook in this order:

1. overall summary
2. stage list
3. stage detail
4. individual node internals

### Stage overview UI

Add a lightweight stage overview around the existing canvas instead of introducing a second notebook-specific view:

- a compact post-import summary (`stages`, `steps`, `outputs`, `exports`)
- a stage rail listing imported stages in left-to-right order
- stage-level actions such as zoom-to-stage and collapse/expand

This keeps the canvas as the main workspace while giving users a much clearer mental map.

### In-progress notebook panel

While import is running, the right sidebar should show a notebook-specific progress panel above any raw AI debug text:

- current phase (`Reading notebook`, `Finding stages`, `Connecting workflow`, etc.)
- notebook summary (`58 cells`, `large workflow`, `7 stages`)
- ordered stage checklist with live state changes
- warnings only when relevant
- raw streamed AI text behind a disclosure

This makes the import feel like an editorial workflow rather than an opaque LLM request.

### Stage cards

Collapsed imported groups should show semantic summaries rather than only “N nodes collapsed”.

The visible container should read like a chapter card:

- stage title
- one-sentence purpose
- `Inputs: ...`
- `Outputs: ...`
- step count
- whether the stage belongs to the main path or a side branch

For now this semantic stage treatment applies only to imported notebook groups; manually created groups can continue to use the generic group presentation.

### Edges

- use lighter, smoother imported-pipeline edges
- avoid dominant perpendicular/elbow-heavy routing for notebook imports
- let group structure communicate organization more than wires do

### Main path emphasis

Imported workflows should visually distinguish the primary left-to-right story from secondary branches.

- compute a dominant stage path from source stages to terminal output/export stages
- emphasize stage headers and edges on that path slightly
- de-emphasize side branches without hiding them

The goal is not to remove graph fidelity; it is to make the main narrative obvious at a glance.

## Testing

- backend tests for staged status emission and fallback behavior
- backend tests for notebook-specific SSE events (`analysis`, `stage_plan`, `stage_progress`, `workflow`)
- backend tests for section-plan parsing logic
- frontend tests for grouping/layout utilities
- frontend tests for imported stage summary metadata and stage ordering
- frontend tests for notebook SSE parsing and progress-panel rendering
- focused integration tests for notebook import result shaping where practical

## Out of Scope

- full hierarchical notebook groups in the UI
- interactive notebook-section editing during import
- semantic summarization of each code node beyond naming/description
