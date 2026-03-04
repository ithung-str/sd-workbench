# Card Configuration Panel — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the per-card edit popover with a Hex-style right-side configuration panel. Rich column/axis/filter/aggregation config for data-table cards, plus visual and display options for simulation cards.

**Architecture:** New `CardConfigPanel` component in `frontend/src/components/dashboard/` renders in a right-side panel (300px) within `DashboardPage`. Card selection state (`selectedCardId`) is lifted to DashboardPage and shared between the canvas and config panel. The existing per-card edit popover in `DashboardCanvasPanel` is replaced by clicking a card to select it.

**Tech Stack:** React, Mantine v7 (Accordion, Select, MultiSelect, Switch, NumberInput, ColorInput, Pill, ActionIcon), Recharts (existing), TypeScript

---

### Task 1: Extend DashboardCard type with new config fields

**Files:**
- Modify: `frontend/src/types/model.ts:262-284`

**Step 1: Add new fields to DashboardCard type**

In `frontend/src/types/model.ts`, add after line 283 (`data_table_rows?: number;`):

```typescript
  // Filters (data cards)
  filters?: Array<{ column: string; operator: string; value: string | string[] }>;
  series_column?: string;
  // Display options (sim cards)
  y_min?: number;
  y_max?: number;
  decimals?: number;
  unit_suffix?: string;
  show_data_points?: boolean;
  reference_line?: number;
  // Style options (both families)
  line_color?: string;
  line_style?: 'solid' | 'dashed' | 'dotted';
  show_legend?: boolean;
  show_grid?: boolean;
  color_palette?: string;
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No new errors (fields are all optional)

**Step 3: Commit**

```bash
git add frontend/src/types/model.ts
git commit -m "feat: add config fields to DashboardCard type for filters, display, and style"
```

---

### Task 2: Add filter utility for data table rows

**Files:**
- Create: `frontend/src/lib/dataTableFilters.ts`
- Create: `frontend/src/lib/dataTableFilters.test.ts`

**Step 1: Write failing tests**

Create `frontend/src/lib/dataTableFilters.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { applyFilters, getUniqueColumnValues, type CardFilter } from './dataTableFilters';
import type { DataTable } from '../types/dataTable';

const TABLE: DataTable = {
  id: 't1',
  name: 'Test',
  source: 'csv',
  columns: [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'age', label: 'Age', type: 'number' },
    { key: 'city', label: 'City', type: 'string' },
  ],
  rows: [
    ['Alice', 30, 'Amsterdam'],
    ['Bob', 25, 'Berlin'],
    ['Charlie', 35, 'Amsterdam'],
    ['Diana', 28, 'Copenhagen'],
  ],
  createdAt: '',
  updatedAt: '',
};

describe('applyFilters', () => {
  it('returns all rows when no filters', () => {
    expect(applyFilters(TABLE, [])).toEqual(TABLE.rows);
  });

  it('filters string equals', () => {
    const filters: CardFilter[] = [{ column: 'city', operator: 'equals', value: 'Amsterdam' }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('Alice');
    expect(result[1][0]).toBe('Charlie');
  });

  it('filters string not_equals', () => {
    const filters: CardFilter[] = [{ column: 'city', operator: 'not_equals', value: 'Amsterdam' }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(2);
  });

  it('filters string contains', () => {
    const filters: CardFilter[] = [{ column: 'name', operator: 'contains', value: 'li' }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(2); // Alice, Charlie
  });

  it('filters is_one_of', () => {
    const filters: CardFilter[] = [{ column: 'city', operator: 'is_one_of', value: ['Amsterdam', 'Berlin'] }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(3);
  });

  it('filters numeric >', () => {
    const filters: CardFilter[] = [{ column: 'age', operator: '>', value: '29' }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(2); // Alice(30), Charlie(35)
  });

  it('filters numeric <', () => {
    const filters: CardFilter[] = [{ column: 'age', operator: '<', value: '28' }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(1); // Bob(25)
  });

  it('filters numeric >=', () => {
    const filters: CardFilter[] = [{ column: 'age', operator: '>=', value: '30' }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(2);
  });

  it('filters numeric <=', () => {
    const filters: CardFilter[] = [{ column: 'age', operator: '<=', value: '28' }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(2); // Bob(25), Diana(28)
  });

  it('combines multiple filters with AND', () => {
    const filters: CardFilter[] = [
      { column: 'city', operator: 'equals', value: 'Amsterdam' },
      { column: 'age', operator: '>', value: '30' },
    ];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(1); // Charlie
  });
});

describe('getUniqueColumnValues', () => {
  it('returns sorted unique string values', () => {
    const values = getUniqueColumnValues(TABLE, 'city');
    expect(values).toEqual(['Amsterdam', 'Berlin', 'Copenhagen']);
  });

  it('returns empty array for unknown column', () => {
    expect(getUniqueColumnValues(TABLE, 'unknown')).toEqual([]);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `cd frontend && npx vitest run src/lib/dataTableFilters.test.ts`
Expected: FAIL — module not found

**Step 3: Implement filter utilities**

Create `frontend/src/lib/dataTableFilters.ts`:

```typescript
import type { DataTable } from '../types/dataTable';

export type CardFilter = {
  column: string;
  operator: string;
  value: string | string[];
};

type Row = (string | number | null)[];

export function applyFilters(table: DataTable, filters: CardFilter[]): Row[] {
  if (filters.length === 0) return table.rows;

  const colIndexMap = new Map(table.columns.map((c, i) => [c.key, i]));

  return table.rows.filter((row) =>
    filters.every((f) => {
      const idx = colIndexMap.get(f.column);
      if (idx === undefined) return true;
      const cell = row[idx];
      const cellStr = cell != null ? String(cell) : '';
      const cellNum = typeof cell === 'number' ? cell : Number(cell);

      switch (f.operator) {
        case 'equals':
          return cellStr === String(f.value);
        case 'not_equals':
          return cellStr !== String(f.value);
        case 'contains':
          return cellStr.toLowerCase().includes(String(f.value).toLowerCase());
        case 'is_one_of':
          return Array.isArray(f.value) && f.value.includes(cellStr);
        case '>':
          return Number.isFinite(cellNum) && cellNum > Number(f.value);
        case '<':
          return Number.isFinite(cellNum) && cellNum < Number(f.value);
        case '>=':
          return Number.isFinite(cellNum) && cellNum >= Number(f.value);
        case '<=':
          return Number.isFinite(cellNum) && cellNum <= Number(f.value);
        default:
          return true;
      }
    }),
  );
}

export function getUniqueColumnValues(table: DataTable, columnKey: string): string[] {
  const idx = table.columns.findIndex((c) => c.key === columnKey);
  if (idx < 0) return [];
  const unique = new Set<string>();
  for (const row of table.rows) {
    const val = row[idx];
    if (val != null) unique.add(String(val));
  }
  return Array.from(unique).sort();
}
```

**Step 4: Run tests to verify they pass**

Run: `cd frontend && npx vitest run src/lib/dataTableFilters.test.ts`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add frontend/src/lib/dataTableFilters.ts frontend/src/lib/dataTableFilters.test.ts
git commit -m "feat: add data table filter utilities with tests"
```

---

### Task 3: Create CardConfigPanel component

**Files:**
- Create: `frontend/src/components/dashboard/CardConfigPanel.tsx`

This is the main config panel. It renders different accordion sections based on card type. It receives the selected card, table metadata, variable options, and an update callback.

**Step 1: Create the CardConfigPanel component**

Create `frontend/src/components/dashboard/CardConfigPanel.tsx`:

```typescript
import { useEffect, useMemo, useState } from 'react';
import {
  Accordion,
  ActionIcon,
  Box,
  Button,
  CloseButton,
  ColorInput,
  Group,
  MultiSelect,
  NumberInput,
  Pill,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type { DashboardCard, DashboardCardType } from '../../types/model';
import type { DataTableMeta } from '../../types/dataTable';
import { getUniqueColumnValues, type CardFilter } from '../../lib/dataTableFilters';
import { loadDataTable } from '../../lib/dataTableStorage';
import type { DataTable } from '../../types/dataTable';

type Props = {
  card: DashboardCard;
  variableOptions: Array<{ value: string; label: string }>;
  dataTables: DataTableMeta[];
  onUpdate: (patch: Partial<DashboardCard>) => void;
  onClose: () => void;
};

const CARD_TYPE_DATA = [
  {
    group: 'Simulation',
    items: [
      { value: 'kpi', label: 'KPI' },
      { value: 'line', label: 'Line Chart' },
      { value: 'table', label: 'Sim Table' },
      { value: 'sparkline', label: 'Sparkline' },
      { value: 'comparison', label: 'Comparison' },
      { value: 'heatmap', label: 'Heatmap' },
      { value: 'map', label: 'Stock-Flow Map' },
    ],
  },
  {
    group: 'Data Table',
    items: [
      { value: 'data_bar', label: 'Bar Chart' },
      { value: 'data_stacked_bar', label: 'Stacked Bar' },
      { value: 'data_area', label: 'Area Chart' },
      { value: 'data_pie', label: 'Pie Chart' },
      { value: 'data_table', label: 'Data Table' },
      { value: 'data_pivot', label: 'Pivot Table' },
    ],
  },
];

const SINGLE_VAR_TYPES: DashboardCardType[] = ['kpi', 'line', 'table', 'sparkline'];
const MULTI_VAR_TYPES: DashboardCardType[] = ['heatmap', 'comparison'];

const AGGREGATE_OPTIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'count', label: 'Count' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
];

const COLOR_PALETTES = [
  { value: 'default', label: 'Default' },
  { value: 'warm', label: 'Warm' },
  { value: 'cool', label: 'Cool' },
  { value: 'pastel', label: 'Pastel' },
  { value: 'vivid', label: 'Vivid' },
];

const STRING_OPERATORS = [
  { value: 'equals', label: 'equals' },
  { value: 'not_equals', label: 'not equals' },
  { value: 'contains', label: 'contains' },
  { value: 'is_one_of', label: 'is one of' },
];

const NUMERIC_OPERATORS = [
  { value: 'equals', label: '=' },
  { value: 'not_equals', label: '≠' },
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
];

function isDataCardType(type: DashboardCardType): boolean {
  return type.startsWith('data_');
}

function FilterRow({
  filter,
  index,
  columns,
  fullTable,
  onUpdate,
  onRemove,
}: {
  filter: CardFilter;
  index: number;
  columns: DataTableMeta['columns'];
  fullTable: DataTable | null;
  onUpdate: (index: number, updated: CardFilter) => void;
  onRemove: (index: number) => void;
}) {
  const col = columns.find((c) => c.key === filter.column);
  const isNumeric = col?.type === 'number';
  const operators = isNumeric ? NUMERIC_OPERATORS : STRING_OPERATORS;

  const uniqueValues = useMemo(() => {
    if (!fullTable || filter.operator !== 'is_one_of') return [];
    return getUniqueColumnValues(fullTable, filter.column).map((v) => ({ value: v, label: v }));
  }, [fullTable, filter.column, filter.operator]);

  return (
    <Group gap={4} wrap="nowrap" align="flex-end">
      <Select
        size="xs"
        placeholder="Column"
        value={filter.column}
        onChange={(value) => onUpdate(index, { ...filter, column: value ?? '', value: '' })}
        data={columns.map((c) => ({ value: c.key, label: c.label }))}
        style={{ flex: 2 }}
      />
      <Select
        size="xs"
        placeholder="Op"
        value={filter.operator}
        onChange={(value) => onUpdate(index, { ...filter, operator: value ?? 'equals' })}
        data={operators}
        style={{ flex: 1 }}
      />
      {filter.operator === 'is_one_of' ? (
        <MultiSelect
          size="xs"
          placeholder="Values"
          value={Array.isArray(filter.value) ? filter.value : []}
          onChange={(values) => onUpdate(index, { ...filter, value: values })}
          data={uniqueValues}
          style={{ flex: 3 }}
          searchable
        />
      ) : (
        <TextInput
          size="xs"
          placeholder="Value"
          value={typeof filter.value === 'string' ? filter.value : ''}
          onChange={(e) => onUpdate(index, { ...filter, value: e.currentTarget.value })}
          style={{ flex: 2 }}
        />
      )}
      <ActionIcon size="sm" variant="subtle" color="red" onClick={() => onRemove(index)}>
        <IconTrash size={12} />
      </ActionIcon>
    </Group>
  );
}

export function CardConfigPanel({ card, variableOptions, dataTables, onUpdate, onClose }: Props) {
  const isData = isDataCardType(card.type);
  const isPivot = card.type === 'data_pivot';
  const isDataTableType = card.type === 'data_table';
  const needsSingleVar = SINGLE_VAR_TYPES.includes(card.type);
  const needsMultiVar = MULTI_VAR_TYPES.includes(card.type);

  const selectedTableMeta = dataTables.find((dt) => dt.id === card.data_table_id);
  const columnOptions = useMemo(
    () => selectedTableMeta?.columns.map((c) => ({ value: c.key, label: `${c.label} (${c.type})` })) ?? [],
    [selectedTableMeta],
  );
  const numericColumnOptions = useMemo(
    () => selectedTableMeta?.columns.filter((c) => c.type === 'number').map((c) => ({ value: c.key, label: c.label })) ?? [],
    [selectedTableMeta],
  );

  // Load full table data for filter value suggestions
  const [fullTable, setFullTable] = useState<DataTable | null>(null);
  useEffect(() => {
    if (!card.data_table_id) { setFullTable(null); return; }
    loadDataTable(card.data_table_id).then((t) => setFullTable(t));
  }, [card.data_table_id]);

  const filters: CardFilter[] = card.filters ?? [];

  const updateFilter = (index: number, updated: CardFilter) => {
    const next = [...filters];
    next[index] = updated;
    onUpdate({ filters: next });
  };

  const removeFilter = (index: number) => {
    onUpdate({ filters: filters.filter((_, i) => i !== index) });
  };

  const addFilter = () => {
    const firstCol = selectedTableMeta?.columns[0]?.key ?? '';
    onUpdate({ filters: [...filters, { column: firstCol, operator: 'equals', value: '' }] });
  };

  const dataTableOptions = useMemo(
    () => dataTables.map((dt) => ({ value: dt.id, label: `${dt.name} (${dt.rowCount} rows)` })),
    [dataTables],
  );

  return (
    <Box
      style={{
        width: 300,
        flexShrink: 0,
        borderLeft: '1px solid var(--mantine-color-gray-3)',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
      }}
    >
      <Group justify="space-between" px="sm" py={8} style={{ borderBottom: '1px solid var(--mantine-color-gray-3)', flexShrink: 0 }}>
        <Title order={5} size="0.85rem">Configure Card</Title>
        <CloseButton size="sm" onClick={onClose} />
      </Group>

      <ScrollArea style={{ flex: 1 }} px="sm" py="xs">
        <Accordion multiple defaultValue={['data', 'filters', 'display', 'style']} variant="separated" size="sm">
          {/* === DATA SECTION === */}
          <Accordion.Item value="data">
            <Accordion.Control>Data</Accordion.Control>
            <Accordion.Panel>
              <Stack gap={8}>
                <TextInput
                  label="Title"
                  size="xs"
                  value={card.title}
                  onChange={(e) => onUpdate({ title: e.currentTarget.value })}
                />
                <Select
                  label="Card type"
                  size="xs"
                  value={card.type}
                  onChange={(value) => { if (value) onUpdate({ type: value as DashboardCardType }); }}
                  data={CARD_TYPE_DATA}
                />

                {/* Sim card: variable pickers */}
                {needsSingleVar && (
                  <Select
                    label="Variable"
                    size="xs"
                    value={card.variable}
                    data={variableOptions}
                    searchable
                    onChange={(value) => { if (value) onUpdate({ variable: value }); }}
                  />
                )}
                {needsMultiVar && (
                  <MultiSelect
                    label="Variables"
                    size="xs"
                    value={card.variables ?? []}
                    data={variableOptions}
                    searchable
                    onChange={(values) => onUpdate({ variables: values })}
                  />
                )}
                {card.type === 'table' && (
                  <NumberInput
                    label="Table rows"
                    size="xs"
                    value={card.table_rows ?? 10}
                    min={1}
                    max={200}
                    onChange={(value) => onUpdate({ table_rows: Number(value) || 10 })}
                  />
                )}
                {card.type === 'map' && (
                  <Switch
                    size="xs"
                    label="Scale stock dots by value"
                    checked={card.scale_nodes ?? false}
                    onChange={(e) => onUpdate({ scale_nodes: e.currentTarget.checked })}
                  />
                )}

                {/* Data card: table + column pickers */}
                {isData && (
                  <>
                    <Select
                      label="Data table"
                      size="xs"
                      value={card.data_table_id ?? ''}
                      onChange={(value) => onUpdate({
                        data_table_id: value ?? '',
                        x_column: undefined,
                        y_columns: undefined,
                        group_column: undefined,
                        value_column: undefined,
                        series_column: undefined,
                        filters: [],
                      })}
                      data={dataTableOptions}
                      placeholder={dataTableOptions.length === 0 ? 'No tables uploaded' : 'Select table'}
                    />
                    {isPivot ? (
                      <>
                        <Select label="Group by" size="xs" value={card.group_column ?? ''} onChange={(value) => onUpdate({ group_column: value ?? '' })} data={columnOptions} placeholder="Column to group by" />
                        <Select label="Value column" size="xs" value={card.value_column ?? ''} onChange={(value) => onUpdate({ value_column: value ?? '' })} data={numericColumnOptions} placeholder="Numeric column" />
                        <Select label="Aggregation" size="xs" value={card.aggregate_fn ?? 'sum'} onChange={(value) => onUpdate({ aggregate_fn: (value as DashboardCard['aggregate_fn']) ?? 'sum' })} data={AGGREGATE_OPTIONS} />
                      </>
                    ) : isDataTableType ? (
                      <NumberInput label="Max rows" size="xs" value={card.data_table_rows ?? 20} min={1} max={500} onChange={(value) => onUpdate({ data_table_rows: Number(value) || 20 })} />
                    ) : (
                      <>
                        <Select label="X-axis" size="xs" value={card.x_column ?? ''} onChange={(value) => onUpdate({ x_column: value ?? '' })} data={columnOptions} placeholder="Category / X axis" />
                        {card.type === 'data_pie' ? (
                          <Select label="Value column" size="xs" value={(card.y_columns ?? [])[0] ?? ''} onChange={(value) => onUpdate({ y_columns: value ? [value] : [] })} data={numericColumnOptions} placeholder="Numeric column" />
                        ) : (
                          <MultiSelect label="Y-axis" size="xs" value={card.y_columns ?? []} onChange={(values) => onUpdate({ y_columns: values })} data={numericColumnOptions} placeholder="Numeric columns" />
                        )}
                        <Select
                          label="Series / Color"
                          size="xs"
                          value={card.series_column ?? ''}
                          onChange={(value) => onUpdate({ series_column: value ?? '' })}
                          data={[{ value: '', label: '(none)' }, ...columnOptions]}
                          placeholder="Group by column"
                          clearable
                        />
                        <Select label="Aggregation" size="xs" value={card.aggregate_fn ?? 'sum'} onChange={(value) => onUpdate({ aggregate_fn: (value as DashboardCard['aggregate_fn']) ?? 'sum' })} data={AGGREGATE_OPTIONS} />
                      </>
                    )}
                  </>
                )}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>

          {/* === FILTERS SECTION (data cards only) === */}
          {isData && selectedTableMeta && (
            <Accordion.Item value="filters">
              <Accordion.Control>
                <Group gap={6}>
                  <span>Filters</span>
                  {filters.length > 0 && (
                    <Pill size="xs">{filters.length}</Pill>
                  )}
                </Group>
              </Accordion.Control>
              <Accordion.Panel>
                <Stack gap={8}>
                  {filters.map((f, i) => (
                    <FilterRow
                      key={i}
                      filter={f}
                      index={i}
                      columns={selectedTableMeta.columns}
                      fullTable={fullTable}
                      onUpdate={updateFilter}
                      onRemove={removeFilter}
                    />
                  ))}
                  <Button
                    size="xs"
                    variant="light"
                    leftSection={<IconPlus size={12} />}
                    onClick={addFilter}
                  >
                    Add filter
                  </Button>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          )}

          {/* === DISPLAY SECTION (sim cards only) === */}
          {!isData && card.type !== 'map' && (
            <Accordion.Item value="display">
              <Accordion.Control>Display</Accordion.Control>
              <Accordion.Panel>
                <Stack gap={8}>
                  <Text size="xs" fw={500}>Y-axis range</Text>
                  <Group gap={8}>
                    <NumberInput
                      label="Min"
                      size="xs"
                      value={card.y_min ?? ''}
                      onChange={(value) => onUpdate({ y_min: value === '' ? undefined : Number(value) })}
                      placeholder="Auto"
                      style={{ flex: 1 }}
                    />
                    <NumberInput
                      label="Max"
                      size="xs"
                      value={card.y_max ?? ''}
                      onChange={(value) => onUpdate({ y_max: value === '' ? undefined : Number(value) })}
                      placeholder="Auto"
                      style={{ flex: 1 }}
                    />
                  </Group>
                  <Group gap={8}>
                    <NumberInput
                      label="Decimals"
                      size="xs"
                      value={card.decimals ?? ''}
                      min={0}
                      max={6}
                      onChange={(value) => onUpdate({ decimals: value === '' ? undefined : Number(value) })}
                      placeholder="Auto"
                      style={{ flex: 1 }}
                    />
                    <TextInput
                      label="Unit suffix"
                      size="xs"
                      value={card.unit_suffix ?? ''}
                      onChange={(e) => onUpdate({ unit_suffix: e.currentTarget.value || undefined })}
                      placeholder='e.g. "kg"'
                      style={{ flex: 1 }}
                    />
                  </Group>
                  {(card.type === 'line' || card.type === 'comparison') && (
                    <Switch
                      size="xs"
                      label="Show data points"
                      checked={card.show_data_points ?? false}
                      onChange={(e) => onUpdate({ show_data_points: e.currentTarget.checked })}
                    />
                  )}
                  <NumberInput
                    label="Reference line"
                    size="xs"
                    value={card.reference_line ?? ''}
                    onChange={(value) => onUpdate({ reference_line: value === '' ? undefined : Number(value) })}
                    placeholder="None"
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          )}

          {/* === STYLE SECTION (all cards) === */}
          <Accordion.Item value="style">
            <Accordion.Control>Style</Accordion.Control>
            <Accordion.Panel>
              <Stack gap={8}>
                {!isData && SINGLE_VAR_TYPES.includes(card.type) && (
                  <ColorInput
                    label="Line color"
                    size="xs"
                    value={card.line_color ?? '#5e35b1'}
                    onChange={(value) => onUpdate({ line_color: value })}
                    format="hex"
                    swatches={['#5e35b1', '#1b6ca8', '#d46a00', '#2f7d32', '#d32f2f', '#00838f']}
                  />
                )}
                {!isData && (card.type === 'line' || card.type === 'comparison') && (
                  <Select
                    label="Line style"
                    size="xs"
                    value={card.line_style ?? 'solid'}
                    onChange={(value) => onUpdate({ line_style: (value as DashboardCard['line_style']) ?? 'solid' })}
                    data={[
                      { value: 'solid', label: 'Solid' },
                      { value: 'dashed', label: 'Dashed' },
                      { value: 'dotted', label: 'Dotted' },
                    ]}
                  />
                )}
                {isData && (
                  <Select
                    label="Color palette"
                    size="xs"
                    value={card.color_palette ?? 'default'}
                    onChange={(value) => onUpdate({ color_palette: value ?? 'default' })}
                    data={COLOR_PALETTES}
                  />
                )}
                <Switch
                  size="xs"
                  label="Show legend"
                  checked={card.show_legend ?? true}
                  onChange={(e) => onUpdate({ show_legend: e.currentTarget.checked })}
                />
                <Switch
                  size="xs"
                  label="Show grid"
                  checked={card.show_grid ?? true}
                  onChange={(e) => onUpdate({ show_grid: e.currentTarget.checked })}
                />
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      </ScrollArea>
    </Box>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No new errors

**Step 3: Commit**

```bash
git add frontend/src/components/dashboard/CardConfigPanel.tsx
git commit -m "feat: create CardConfigPanel component with data/filter/display/style sections"
```

---

### Task 4: Wire up card selection and config panel in DashboardPage

**Files:**
- Modify: `frontend/src/components/dashboard/DashboardPage.tsx`
- Modify: `frontend/src/components/dashboard/DashboardCanvasPanel.tsx`

**Step 1: Add selectedCardId state and config panel to DashboardPage**

In `DashboardPage.tsx`:

1. Add imports at top:
```typescript
import { CardConfigPanel } from './CardConfigPanel';
import { listDataTables } from '../../lib/dataTableStorage';
import type { DataTableMeta } from '../../types/dataTable';
```

2. Add state after line 66 (`const [selectedScenarioId, ...`):
```typescript
const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
const [dataTables, setDataTables] = useState<DataTableMeta[]>([]);

useEffect(() => {
  listDataTables().then(setDataTables).catch(() => setDataTables([]));
}, []);
```

3. Add computed selectedCard and handler:
```typescript
const selectedCard = activeDashboard?.cards.find((c) => c.id === selectedCardId) ?? null;

const handleUpdateSelectedCard = useCallback(
  (patch: Partial<DashboardCard>) => {
    if (!activeDashboard || !selectedCardId) return;
    updateDashboardCard(activeDashboard.id, selectedCardId, patch);
  },
  [activeDashboard, selectedCardId, updateDashboardCard],
);
```

4. Add import for `DashboardCard`:
```typescript
import type { DashboardCard, ScenarioRunResult } from '../../types/model';
```

5. Clear selection when switching dashboards — add after `const activeDashboard = ...` line:
```typescript
useEffect(() => {
  setSelectedCardId(null);
}, [activeDashboardId]);
```

6. Pass `selectedCardId` and `onSelectCard` to DashboardCanvasPanel (replace the existing `<DashboardCanvasPanel>` JSX):
```typescript
<DashboardCanvasPanel
  cards={activeDashboard.cards}
  selectedRun={selectedRun}
  activeDashboardId={activeDashboard.id}
  onUpdateCard={updateDashboardCard}
  onDeleteCard={deleteDashboardCard}
  variableOptions={variableOptions}
  selectedCardId={selectedCardId}
  onSelectCard={setSelectedCardId}
/>
```

7. Add config panel next to the canvas area. Replace the `{/* Right: toolbar + canvas */}` Box (lines 189-215) with:
```typescript
{/* Center: toolbar + canvas */}
<Box style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
  {activeDashboard && (
    <DashboardToolbar
      dashboard={activeDashboard}
      variableOptions={variableOptions}
      onUpdateDashboard={updateDashboard}
      onAddCard={addDashboardCard}
    />
  )}
  <Box style={{ flex: 1, overflow: 'auto' }}>
    {activeDashboard ? (
      <DashboardCanvasPanel
        cards={activeDashboard.cards}
        selectedRun={selectedRun}
        activeDashboardId={activeDashboard.id}
        onUpdateCard={updateDashboardCard}
        onDeleteCard={deleteDashboardCard}
        variableOptions={variableOptions}
        selectedCardId={selectedCardId}
        onSelectCard={setSelectedCardId}
      />
    ) : (
      <Box style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text size="sm" c="dimmed">Create a dashboard to get started</Text>
      </Box>
    )}
  </Box>
</Box>

{/* Right: config panel */}
{selectedCard && activeDashboard && (
  <CardConfigPanel
    card={selectedCard}
    variableOptions={variableOptions}
    dataTables={dataTables}
    onUpdate={handleUpdateSelectedCard}
    onClose={() => setSelectedCardId(null)}
  />
)}
```

**Step 2: Update DashboardCanvasPanel props and card selection**

In `DashboardCanvasPanel.tsx`:

1. Add `selectedCardId` and `onSelectCard` to the Props type (line 455-462):
```typescript
type Props = {
  cards: DashboardCard[];
  selectedRun: ScenarioRunResult | null;
  activeDashboardId: string;
  onUpdateCard: (dashboardId: string, cardId: string, patch: Partial<DashboardCard>) => void;
  onDeleteCard: (dashboardId: string, cardId: string) => void;
  variableOptions: Array<{ value: string; label: string }>;
  selectedCardId: string | null;
  onSelectCard: (cardId: string | null) => void;
};
```

2. Update function signature (line 464):
```typescript
export function DashboardCanvasPanel({ cards, selectedRun, activeDashboardId, onUpdateCard, onDeleteCard, variableOptions, selectedCardId, onSelectCard }: Props) {
```

3. Remove the local `editingCardId` state (line 485):
Delete: `const [editingCardId, setEditingCardId] = useState<string | null>(null);`

4. Add click-to-select on the Card component. Replace the `<Card>` element (around line 696) to add an `onClick` and selected outline style:
```typescript
<Card
  key={card.id}
  withBorder
  shadow="sm"
  radius="md"
  onClick={() => onSelectCard(card.id === selectedCardId ? null : card.id)}
  style={{
    position: 'absolute',
    left: rect.x,
    top: rect.y,
    width: rect.w,
    height: rect.h,
    overflow: 'hidden',
    cursor: 'pointer',
    outline: card.id === selectedCardId ? '2px solid var(--mantine-color-blue-5)' : undefined,
    outlineOffset: card.id === selectedCardId ? -1 : undefined,
  }}
>
```

5. Remove the entire edit popover block (the `<Popover>` from line 726 to line 797), and remove the edit pencil `<ActionIcon>` that wraps `<Popover.Target>`. Keep the delete ActionIcon. The card header Group should now just be:
```typescript
<Group gap={4} wrap="nowrap">
  <Badge variant="light" size="sm">{CARD_TYPE_LABEL[card.type] ?? card.type.toUpperCase()}</Badge>
  <ActionIcon
    variant="subtle"
    size="sm"
    color="red"
    onClick={(e) => { e.stopPropagation(); onDeleteCard(activeDashboardId, card.id); }}
  >
    <IconTrash size={14} />
  </ActionIcon>
</Group>
```

6. Add click-on-canvas-background to deselect. On the canvas `<Box ref={canvasRef}>` (line 681), add:
```typescript
onClick={(e) => {
  if (e.target === e.currentTarget) onSelectCard(null);
}}
```

7. Remove now-unused imports: `Popover`, `Select`, `MultiSelect`, `NumberInput`, `Checkbox`, `TextInput`, `IconPencil`.

**Step 3: Verify TypeScript compiles**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No new errors

**Step 4: Run existing tests**

Run: `cd frontend && npx vitest run`
Expected: All existing tests pass (no behavioral changes to store or types)

**Step 5: Commit**

```bash
git add frontend/src/components/dashboard/DashboardPage.tsx frontend/src/components/dashboard/DashboardCanvasPanel.tsx
git commit -m "feat: wire up card selection and config panel in dashboard page"
```

---

### Task 5: Apply filters in data card rendering

**Files:**
- Modify: `frontend/src/components/dashboard/DataBarCardContent.tsx`
- Modify: `frontend/src/components/dashboard/DataAreaCardContent.tsx`
- Modify: `frontend/src/components/dashboard/DataPieCardContent.tsx`
- Modify: `frontend/src/components/dashboard/DataTableCardContent.tsx`
- Modify: `frontend/src/components/dashboard/DataPivotCardContent.tsx`

Each data card component currently reads `table.rows` directly. We need to filter them through `applyFilters` using `card.filters`.

**Step 1: Update DataBarCardContent**

In `DataBarCardContent.tsx`, add import:
```typescript
import { applyFilters } from '../../lib/dataTableFilters';
```

In the `data` useMemo (around line 28), replace `table.rows.map(...)` with:
```typescript
const filteredRows = applyFilters(table, card.filters ?? []);
return filteredRows.map((row) => {
```

Update the useMemo dependency array to include `card.filters`:
```typescript
}, [table, xCol, yCols, card.filters]);
```

**Step 2: Update DataAreaCardContent**

Same pattern — add `applyFilters` import, replace `table.rows` with `applyFilters(table, card.filters ?? [])` in the data computation memo, add `card.filters` to deps.

**Step 3: Update DataPieCardContent**

Same pattern.

**Step 4: Update DataTableCardContent**

Same pattern — filter `table.rows` before slicing.

**Step 5: Update DataPivotCardContent**

In the `pivotRows` useMemo (around line 44), replace `for (const row of table.rows)` with:
```typescript
const filteredRows = applyFilters(table, card.filters ?? []);
for (const row of filteredRows) {
```
Add `card.filters` to deps.

**Step 6: Verify TypeScript compiles and tests pass**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`
Expected: All pass

**Step 7: Commit**

```bash
git add frontend/src/components/dashboard/Data*.tsx
git commit -m "feat: apply card filters in all data card content components"
```

---

### Task 6: Apply style and display options in chart rendering

**Files:**
- Modify: `frontend/src/components/dashboard/DashboardCanvasPanel.tsx` (sim card inline rendering)
- Modify: `frontend/src/components/dashboard/DataBarCardContent.tsx`
- Modify: `frontend/src/components/dashboard/DataAreaCardContent.tsx`
- Modify: `frontend/src/components/dashboard/DataPieCardContent.tsx`

**Step 1: Add color palette helper**

Create a helper at the top of `DataBarCardContent.tsx` (or a shared `lib/chartPalettes.ts`):

```typescript
// frontend/src/lib/chartPalettes.ts
const PALETTES: Record<string, string[]> = {
  default: ['#1b6ca8', '#d46a00', '#2f7d32', '#8a2be2', '#d32f2f', '#00838f', '#c2185b', '#455a64'],
  warm: ['#d32f2f', '#e64a19', '#f57c00', '#ffa000', '#fbc02d', '#afb42b'],
  cool: ['#1565c0', '#0277bd', '#00838f', '#00695c', '#2e7d32', '#558b2f'],
  pastel: ['#90caf9', '#f48fb1', '#ce93d8', '#80cbc4', '#a5d6a7', '#ffe082'],
  vivid: ['#e91e63', '#9c27b0', '#673ab7', '#3f51b5', '#00bcd4', '#4caf50'],
};

export function getPalette(name?: string): string[] {
  return PALETTES[name ?? 'default'] ?? PALETTES.default;
}
```

**Step 2: Apply palette in DataBarCardContent**

Replace the `COLORS` constant with:
```typescript
import { getPalette } from '../../lib/chartPalettes';
```

In the JSX, use `getPalette(card.color_palette)` instead of `COLORS`:
```typescript
const colors = getPalette(card.color_palette);
// ...
fill={colors[i % colors.length]}
```

Apply `show_legend` and `show_grid`:
```typescript
{card.show_grid !== false && <CartesianGrid strokeDasharray="3 3" stroke="#eee" />}
{(card.show_legend !== false && yCols.length > 1) && <Legend wrapperStyle={{ fontSize: 10 }} />}
```

**Step 3: Apply same pattern to DataAreaCardContent and DataPieCardContent**

Same changes: import `getPalette`, use palette colors, respect `show_legend`/`show_grid`.

**Step 4: Apply display/style options to sim cards in DashboardCanvasPanel**

In the `line` card rendering (around line 395):
```typescript
if (card.type === 'line') {
  const rows = lineRows(run, card.variable);
  const yDomain: [number | string, number | string] = [
    card.y_min != null ? card.y_min : 'auto',
    card.y_max != null ? card.y_max : 'auto',
  ];
  const strokeDash = card.line_style === 'dashed' ? '8 4' : card.line_style === 'dotted' ? '2 2' : undefined;
  return (
    <Box h={220}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}>
          {card.show_grid !== false && <CartesianGrid strokeDasharray="3 3" />}
          <XAxis dataKey="time" />
          <YAxis domain={yDomain} />
          <Tooltip />
          {card.show_legend !== false && <Legend />}
          <Line
            type="monotone"
            dataKey="value"
            stroke={card.line_color ?? '#5e35b1'}
            dot={card.show_data_points ?? false}
            strokeWidth={2}
            strokeDasharray={strokeDash}
          />
          {card.reference_line != null && (
            <Line
              type="monotone"
              dataKey={() => card.reference_line}
              stroke="#888"
              strokeDasharray="4 4"
              dot={false}
              strokeWidth={1}
              name="Reference"
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}
```

Apply similar changes to the `ComparisonContent` component and `kpi` card (for `decimals` and `unit_suffix`).

For KPI card, update value formatting:
```typescript
if (card.type === 'kpi') {
  const value = latestFinite(run.series[card.variable]);
  const decimals = card.decimals ?? 4;
  const suffix = card.unit_suffix ?? '';
  return (
    <Stack gap={6}>
      <Text size="xs" c="dimmed">Latest value</Text>
      <Text fw={700} size="xl">
        {value == null ? 'N/A' : `${value.toFixed(decimals)}${suffix}`}
      </Text>
    </Stack>
  );
}
```

**Step 5: Verify TypeScript compiles and tests pass**

Run: `cd frontend && npx tsc -b --noEmit && npx vitest run`

**Step 6: Commit**

```bash
git add frontend/src/lib/chartPalettes.ts frontend/src/components/dashboard/
git commit -m "feat: apply style, display, and palette options in chart rendering"
```

---

### Task 7: Handle Escape key to deselect and keyboard accessibility

**Files:**
- Modify: `frontend/src/components/dashboard/DashboardCanvasPanel.tsx`

**Step 1: Add Escape key handler**

In `DashboardCanvasPanel`, add a `useEffect` for Escape:

```typescript
useEffect(() => {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && selectedCardId) {
      onSelectCard(null);
    }
  };
  window.addEventListener('keydown', handleKeyDown);
  return () => window.removeEventListener('keydown', handleKeyDown);
}, [selectedCardId, onSelectCard]);
```

**Step 2: Verify it compiles**

Run: `cd frontend && npx tsc -b --noEmit`

**Step 3: Commit**

```bash
git add frontend/src/components/dashboard/DashboardCanvasPanel.tsx
git commit -m "feat: add Escape key to deselect card"
```

---

### Task 8: Run all tests and verify

**Step 1: Run backend tests**

Run: `make test-backend`
Expected: No new failures (no backend changes)

**Step 2: Run frontend tests**

Run: `make test-frontend`
Expected: All pass

**Step 3: Run TypeScript check**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: No errors

**Step 4: Manual smoke test**

Start dev: `make dev`
1. Go to `/dashboard`
2. Add a sim card (KPI/line) — verify clicking it opens the config panel on the right
3. Change line color, toggle grid, set Y-axis range — verify chart updates live
4. Add a data card (bar chart) — click it, verify column pickers and filter builder
5. Add a filter — verify chart filters the data
6. Press Escape — verify panel closes
7. Click canvas background — verify panel closes

**Step 5: Final commit if any fixes needed**
