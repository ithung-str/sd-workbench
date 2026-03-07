# Notebook Import Layout Design

## Goal

Make notebook imports land in a readable analysis-canvas layout by arranging imported nodes as a left-to-right DAG and treating notebook markdown as annotations rather than regular processing nodes.

## Problem

The current notebook import path places nodes on a fixed three-column grid based only on arrival order. That ignores dependencies and produces crossings, overlaps in visual flow, and output nodes that feel arbitrarily placed.

## Architecture

Keep notebook import mapping as-is, but add a dedicated post-import layout step for the imported subgraph. Non-note nodes participate in a deterministic DAG layout based on imported edges. Note nodes are excluded from dependency ranking and placed in a separate annotation lane. Only newly imported notebook nodes are repositioned; existing analysis pipeline nodes remain untouched.

The layout should be implemented as a pure frontend utility so it can be unit tested directly and reused without ReactFlow or DOM measurements.

## Layout Rules

### Scope

- Layout only the nodes created by the current notebook import.
- Preserve existing pipeline nodes and edges.
- Run layout once after the import result is complete.

### Main DAG layout

- Build a dependency graph from imported edges.
- Compute layers left-to-right using dependency depth.
- Place root nodes in the leftmost rank.
- Place downstream nodes in progressively later ranks.
- Use explicit node dimensions per analysis node type so layout is deterministic before render.
- Stack nodes vertically within each rank with fixed spacing.

### Rank bias by node type

- `data_source` nodes should prefer the earliest ranks.
- `code` and `sql` nodes occupy middle ranks according to dependency depth.
- `output`, `publish`, and `sheets_export` should drift to the latest valid ranks so outputs read naturally on the right.

### Annotation lane

- `note` nodes do not participate in DAG ranking.
- Place notes in a dedicated lane to the left of the imported cluster.
- If a note can be associated with imported work via `original_cells`, align it near the earliest related non-note node.
- Otherwise, place notes top-to-bottom in import order.

## Placement Anchor

- Use a stable import origin near the existing default import region.
- Lay out the imported cluster relative to that origin.
- Keep spacing large enough to reduce crossings and avoid immediate overlaps with the annotation lane.

## Failure Behavior

- If layout input is incomplete or cyclic, degrade gracefully:
  - ignore broken edges
  - break ties by import order
  - still produce a deterministic left-to-right placement
- If layout computation fails entirely, keep the import and fall back to the current simple placement.

## Testing

- Unit test the layout utility with:
  - a simple linear chain
  - a branching DAG
  - mixed outputs and exports
  - notes in the annotation lane
  - broken edges and cyclic input

## Out of Scope

- Re-laying out the entire existing analysis pipeline
- Interactive layout controls
- Auto-layout of notes based on rendered edge labels or semantic clustering
