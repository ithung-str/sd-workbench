# UI Overhaul Design

**Date:** 2026-03-03
**Status:** Approved

## Problem

The current layout uses wide sidebars, a tall header with tabs, and a bottom results dock that all compete for canvas space. The settings panel (left sidebar) mixes too many concerns in accordion sections. The overall feel is functional but not polished compared to modern builder tools like Retool.

## Design

### Overall Layout

```
+------------------------------------------------------+
|  Header (48px): Logo, Model picker, New, Menu        |
+--+-----------+-----------------------+---------------+
|  |  Flyout   |                       |  Right        |
|I |  Panel    |      Canvas           |  Sidebar      |
|c |  (240px)  |                       |  (300px)      |
|o |  opens    |                       |  Inspector/   |
|n |  on icon  |                       |  Chat/        |
|  |  click    |   [align/nav tools    |  Simulation]  |
|S |           |    float at bottom    |               |
|t |           |    of canvas]         |               |
|r |           |                       |               |
|i |           |                       |               |
|p |           |                       |               |
|44|           |                       |               |
+--+-----------+-----------------------+---------------+
|  Bottom bar (32px): Canvas | Formulas | Dashboard    |
|  | Scenarios | Sensitivity          [status indicators]|
+------------------------------------------------------+
```

### 1. Left Icon Strip (44px) + Flyout Panels

**Icon strip** — always visible, dark background (~#1a1a2e), vertical icon buttons:

| Icon | Panel | Contents |
|---|---|---|
| + (IconPlus) | Components | 2-column grid of draggable primitives: Stock, Flow, Aux, Lookup, Phantom |
| List (IconListDetails) | Model Outline | Scrollable list of all nodes grouped by type, click to select on canvas, badge with count |
| Variable (IconVariable) | Global Variables | List of global vars with name/value, "Add" button at top |
| Settings (IconSettings) | Settings | Default styles (fill/stroke/text per node type), View options (toggles for minimap, function args, XML) |
| Search (IconSearch) | Search | Text input to search nodes/variables by name, filtered results list |

**Flyout behavior:**
- Click icon: flyout opens (240px), icon highlights
- Click same icon again: flyout closes
- Click different icon: flyout swaps content (stays open)
- Flyout overlays the canvas (does not push it), subtle shadow on right edge
- White background, same styling as current sidebar panels

### 2. Right Sidebar (300px, 3-mode toggle)

SegmentedControl with three modes: Inspector, AI Chat, Simulation.

**Inspector** — existing, no changes.

**AI Chat** — existing (just built), no changes.

**Simulation** (new, replaces bottom results dock):
- Sim config: Start time, Stop time, Time step (compact layout)
- Run buttons: Validate + Simulate
- Status text: last run time, validation error count
- Chart: compact Recharts line chart showing last simulation results, takes remaining vertical space
- Variable toggles below chart:
  - Type filter pill tabs: All | Stocks | Flows | Aux
  - Quick toggle: All | None
  - Scrollable list of variables with colored dot + name + checkbox
  - Compact rows (~20px height, 0.72rem text)
  - Toggling shows/hides lines in the chart

```
+-------------------------+
|  [Validate] [Simulate]  |
|  Start: 0  Stop: 100    |
|  dt: 0.5                |
+-------------------------+
|  Chart area             |
|  (flex, ~200px min)     |
|                         |
+-------------------------+
| All | Stocks | Flows | Aux |
|  All | None             |
|  * Population      [x] |
|  * Birth Rate      [x] |
|  * Death Rate      [ ] |
+-------------------------+
```

### 3. Bottom Navigation Bar (32px)

Slim status-bar style nav at the very bottom of the window.

- **Left side:** Tab pills — Canvas, Formulas, Dashboard, Scenarios, Sensitivity
- **Right side:** Status indicators (node count, validation status dot, sim status)
- Background: #f3f3f8, border-top: 1px solid #e7e7ee
- Active tab: bold text or subtle accent underline
- Small text (0.78rem)
- Clicking navigates to full-page views (same as current header tabs)

### 4. Header Simplification (60px -> 48px)

Remove tabs from header (moved to bottom bar).

**New header contents:** Logo | Model picker | New button | Menu

### 5. Canvas Toolbar

Align, distribute, zoom, and navigation tools float at the bottom of the canvas area (above the bottom nav bar). Compact horizontal toolbar, semi-transparent background.

### 6. Removals

- **Bottom results dock / footer tray** — removed from canvas view. Simulation moved to right sidebar. Chart/Table available via full-page tabs.
- **Left sidebar accordion** — replaced by icon strip + flyout panels.
- **Header tabs** — moved to bottom nav bar.
- **AI Assistant section in settings** — already moved to right sidebar chat.

## Summary

Retool-inspired layout with: dark icon strip + flyout panels on left, 3-mode right sidebar (Inspector/Chat/Simulation), slim bottom nav bar, simplified header, canvas toolbar for alignment tools. Maximizes canvas real estate while keeping all tools accessible.
