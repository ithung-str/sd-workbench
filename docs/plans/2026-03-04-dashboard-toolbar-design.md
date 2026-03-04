# Dashboard Toolbar & White Page Fix

## Problem

1. Clicking the purple "Edit Cards" toggle button on the dashboard causes a white page (flyout editor crash/layout issue).
2. The current "add card" flow requires opening a flyout panel, which is clunky and disconnected from the canvas.

## Design

### Layout

```
┌──────────────────────────────────────────────────────┐
│ Dashboard          [Scenario ▼] [Run Dashboard ▶]    │  header
├────────┬─────────────────────────────────────────────┤
│ Dash   │ [+ Add Card ▼]  dashboard-name-input        │  toolbar
│ list   ├─────────────────────────────────────────────┤
│        │                                             │
│        │  ┌─────┐  ┌──────────┐                      │  canvas
│        │  │ KPI │  │ Line     │                      │
│        │  └─────┘  └──────────┘                      │
│        │                                             │
└────────┴─────────────────────────────────────────────┘
```

### Add Card flow

1. Toolbar above canvas with "+ Add Card" button.
2. Click opens a Mantine `Menu` dropdown with card types grouped (Simulation / Data Table).
3. Selecting a type opens a `Popover` with required config fields:
   - Variable selector (single Select or MultiSelect depending on type)
   - Data table selector + column config (for data card types)
   - Optional title input
   - "Add" confirmation button
4. Card placed at first free position on canvas via existing `firstFreeRect` logic.

### Card editing

- Each card on canvas gets a small edit icon in the header (visible on hover).
- Clicking it opens a Popover anchored to the card with: title, type, variable, and type-specific fields.
- Delete button inside the popover (with confirm).
- Card reorder stays via drag handles (existing).

### Removed

- `editorOpen` state and flyout overlay div in DashboardPage.
- `IconCards` toggle button.
- `DashboardEditorPanel` component — replaced by toolbar Add Card popover + per-card edit popovers.

### Unchanged

- `DashboardListPanel` (left sidebar)
- `DashboardCanvasPanel` (canvas with drag/resize)
- Header with scenario select + Run button
- All card content renderers
