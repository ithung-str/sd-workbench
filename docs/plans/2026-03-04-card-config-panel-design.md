# Card Configuration Panel — Design

## Summary

Replace the per-card edit popover with a Hex-style right-side configuration panel. Full column/axis/filter/aggregation config for data-table cards, plus visual and display options for simulation cards.

## Layout

```
[ListPanel 220px] [Toolbar + Canvas flex:1] [ConfigPanel 300px]
```

- Click a card → selected outline, config panel opens on right
- Click canvas background or Escape → deselect, panel closes
- `selectedCardId` state lives in DashboardPage (shared between canvas and panel)
- Changes apply immediately (live preview)
- Existing edit popover on cards is removed

## Data Card Config (data_bar, data_stacked_bar, data_area, data_pie, data_table, data_pivot)

### Data Section
- Title (TextInput)
- Card type (Select, grouped)
- Data table picker (Select)
- X-axis column (Select)
- Y-axis columns (MultiSelect, numeric) — or Value column for pie
- Series/Color column (Select, optional — groups data by this column)
- Aggregation (Select: sum/avg/count/min/max) — for pivot and grouped series

### Filters Section
- Active filters shown as removable pills
- "+ Add filter" → inline row: [Column] [Operator] [Value]
- Operators vary by column type:
  - String: equals, not equals, contains, is one of
  - Numeric: equals, not equals, >, <, >=, <=
- `is one of` shows MultiSelect of unique column values
- Stored as `filters: Array<{column, operator, value}>`

### Style Section
- Show legend (Switch)
- Show grid (Switch)
- Color palette (Select from presets)

## Sim Card Config (kpi, line, table, sparkline, comparison, heatmap, map)

### Data Section
- Title (TextInput)
- Card type (Select)
- Variable(s) picker (Select or MultiSelect)
- Table rows (NumberInput, `table` only)
- Scale nodes (Checkbox, `map` only)

### Display Section
- Y-axis range: Auto / Manual min-max (NumberInputs)
- Number format: decimals (0-6), unit suffix (TextInput)
- Show data points (Switch, line/comparison)
- Reference line (NumberInput, optional horizontal line)

### Style Section
- Line color (ColorInput)
- Line style (Select: solid/dashed/dotted)
- Show legend (Switch)
- Show grid (Switch)

## New DashboardCard Fields

All optional, defaults to undefined (backwards compatible). Stored in model.metadata.analysis (no backend schema changes).

```ts
// Filters (data cards)
filters?: Array<{ column: string; operator: string; value: string | string[] }>;
series_column?: string;

// Display (sim cards)
y_min?: number;
y_max?: number;
decimals?: number;
unit_suffix?: string;
show_data_points?: boolean;
reference_line?: number;

// Style (both)
line_color?: string;
line_style?: 'solid' | 'dashed' | 'dotted';
show_legend?: boolean;
show_grid?: boolean;
color_palette?: string;
```
