# Dashboard Toolbar Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the broken flyout editor with a toolbar above the canvas for adding cards, and add per-card edit popovers.

**Architecture:** Remove `DashboardEditorPanel` and the flyout overlay from `DashboardPage`. Add a new `DashboardToolbar` component rendered between the header and canvas. Move add-card form logic into a Menu+Popover in the toolbar. Add edit/delete controls to each card header in `DashboardCanvasPanel`.

**Tech Stack:** React, Mantine v7 (Menu, Popover, Select, MultiSelect, TextInput, ActionIcon), Zustand

---

### Task 1: Create DashboardToolbar component with Add Card menu

**Files:**
- Create: `frontend/src/components/dashboard/DashboardToolbar.tsx`

**Step 1: Create the toolbar component**

Create `frontend/src/components/dashboard/DashboardToolbar.tsx`:

```tsx
import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Group,
  Menu,
  MultiSelect,
  NumberInput,
  Popover,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import type { DashboardCard, DashboardCardType, DashboardDefinition } from '../../types/model';
import { listDataTables } from '../../lib/dataTableStorage';
import type { DataTableMeta } from '../../types/dataTable';

type VariableOption = { value: string; label: string };

type Props = {
  dashboard: DashboardDefinition;
  variableOptions: VariableOption[];
  onUpdateDashboard: (id: string, patch: Partial<DashboardDefinition>) => void;
  onAddCard: (dashboardId: string, card: Omit<DashboardCard, 'id' | 'order'> & { id?: string; order?: number }) => void;
};

const CARD_TYPE_DATA = [
  { value: 'kpi', label: 'KPI', group: 'Simulation' },
  { value: 'line', label: 'Line Chart', group: 'Simulation' },
  { value: 'table', label: 'Sim Table', group: 'Simulation' },
  { value: 'sparkline', label: 'Sparkline', group: 'Simulation' },
  { value: 'comparison', label: 'Comparison', group: 'Simulation' },
  { value: 'heatmap', label: 'Heatmap', group: 'Simulation' },
  { value: 'map', label: 'Stock-Flow Map', group: 'Simulation' },
  { value: 'data_bar', label: 'Bar Chart', group: 'Data Table' },
  { value: 'data_stacked_bar', label: 'Stacked Bar', group: 'Data Table' },
  { value: 'data_area', label: 'Area Chart', group: 'Data Table' },
  { value: 'data_pie', label: 'Pie Chart', group: 'Data Table' },
  { value: 'data_table', label: 'Data Table', group: 'Data Table' },
  { value: 'data_pivot', label: 'Pivot Table', group: 'Data Table' },
];

const SINGLE_VAR_TYPES: DashboardCardType[] = ['kpi', 'line', 'table', 'sparkline'];
const MULTI_VAR_TYPES: DashboardCardType[] = ['heatmap', 'comparison'];
const NO_VAR_TYPES: DashboardCardType[] = ['map'];

const AGGREGATE_OPTIONS = [
  { value: 'sum', label: 'Sum' },
  { value: 'avg', label: 'Average' },
  { value: 'count', label: 'Count' },
  { value: 'min', label: 'Min' },
  { value: 'max', label: 'Max' },
];

function isDataCardType(type: DashboardCardType): boolean {
  return type.startsWith('data_');
}

export function DashboardToolbar({ dashboard, variableOptions, onUpdateDashboard, onAddCard }: Props) {
  const [addOpen, setAddOpen] = useState(false);
  const [newCardType, setNewCardType] = useState<DashboardCardType>('kpi');
  const [newVariable, setNewVariable] = useState('');
  const [newVariables, setNewVariables] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newTableRows, setNewTableRows] = useState<number>(10);
  const [newScaleNodes, setNewScaleNodes] = useState(false);

  // Data card state
  const [dataTables, setDataTables] = useState<DataTableMeta[]>([]);
  const [newDataTableId, setNewDataTableId] = useState('');
  const [newXColumn, setNewXColumn] = useState('');
  const [newYColumns, setNewYColumns] = useState<string[]>([]);
  const [newGroupColumn, setNewGroupColumn] = useState('');
  const [newValueColumn, setNewValueColumn] = useState('');
  const [newAggregateFn, setNewAggregateFn] = useState<DashboardCard['aggregate_fn']>('sum');
  const [newDataTableRows, setNewDataTableRows] = useState<number>(20);

  useEffect(() => {
    listDataTables().then(setDataTables).catch(() => setDataTables([]));
  }, []);

  const dataTableOptions = useMemo(
    () => dataTables.map((dt) => ({ value: dt.id, label: `${dt.name} (${dt.rowCount} rows)` })),
    [dataTables],
  );

  const selectedDataTableMeta = dataTables.find((dt) => dt.id === newDataTableId);

  const columnOptions = useMemo(
    () => selectedDataTableMeta?.columns.map((c) => ({ value: c.key, label: `${c.label} (${c.type})` })) ?? [],
    [selectedDataTableMeta],
  );

  const numericColumnOptions = useMemo(
    () => selectedDataTableMeta?.columns.filter((c) => c.type === 'number').map((c) => ({ value: c.key, label: c.label })) ?? [],
    [selectedDataTableMeta],
  );

  const needsSingleVar = SINGLE_VAR_TYPES.includes(newCardType);
  const needsMultiVar = MULTI_VAR_TYPES.includes(newCardType);
  const needsNoVar = NO_VAR_TYPES.includes(newCardType);
  const isDataType = isDataCardType(newCardType);
  const isPivot = newCardType === 'data_pivot';
  const isDataTable = newCardType === 'data_table';

  const canAdd = isDataType
    ? !!newDataTableId && (
        isDataTable ||
        isPivot ? (!!newGroupColumn && !!newValueColumn) :
        (!!newXColumn && newYColumns.length > 0)
      )
    : needsNoVar || (needsSingleVar && !!newVariable) || (needsMultiVar && newVariables.length > 0);

  const handleAddCard = () => {
    if (!canAdd) return;
    let title = newTitle.trim();

    if (isDataType) {
      const tableName = selectedDataTableMeta?.name ?? 'Data';
      if (!title) title = `${tableName}`;
      onAddCard(dashboard.id, {
        type: newCardType,
        title,
        variable: '',
        data_table_id: newDataTableId,
        x_column: isPivot ? undefined : newXColumn || undefined,
        y_columns: isPivot ? undefined : newYColumns.length > 0 ? newYColumns : undefined,
        group_column: isPivot ? newGroupColumn || undefined : undefined,
        value_column: isPivot ? newValueColumn || undefined : undefined,
        aggregate_fn: isPivot ? newAggregateFn : undefined,
        data_table_rows: isDataTable ? Math.max(1, Math.round(newDataTableRows)) : undefined,
      });
    } else {
      if (!title) {
        if (needsNoVar) title = 'Stock-Flow Map';
        else if (needsMultiVar) title = `${newCardType.toUpperCase()} \u2022 ${newVariables.length} vars`;
        else title = `${newCardType.toUpperCase()} \u2022 ${newVariable}`;
      }
      onAddCard(dashboard.id, {
        type: newCardType,
        title,
        variable: needsSingleVar ? newVariable : (needsMultiVar ? (newVariables[0] ?? '') : ''),
        variables: needsMultiVar ? newVariables : undefined,
        table_rows: newCardType === 'table' ? Math.max(1, Math.round(newTableRows)) : undefined,
        scale_nodes: newCardType === 'map' ? newScaleNodes : undefined,
      });
    }
    setNewTitle('');
    setAddOpen(false);
  };

  return (
    <Group
      gap="sm"
      px="sm"
      py={6}
      style={{
        borderBottom: '1px solid var(--mantine-color-gray-3)',
        flexShrink: 0,
      }}
    >
      <Popover opened={addOpen} onChange={setAddOpen} width={280} position="bottom-start" shadow="md">
        <Popover.Target>
          <Button
            size="xs"
            variant="light"
            leftSection={<IconPlus size={14} />}
            onClick={() => setAddOpen((o) => !o)}
          >
            Add Card
          </Button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap={6}>
            <Select
              size="xs"
              label="Card type"
              value={newCardType}
              onChange={(value) => setNewCardType((value as DashboardCardType) ?? 'kpi')}
              data={CARD_TYPE_DATA}
            />

            {/* Simulation card fields */}
            {needsSingleVar && (
              <Select
                size="xs"
                value={newVariable}
                onChange={(value) => setNewVariable(value ?? '')}
                data={variableOptions}
                searchable
                placeholder="Variable"
              />
            )}
            {needsMultiVar && (
              <MultiSelect
                size="xs"
                value={newVariables}
                onChange={setNewVariables}
                data={variableOptions}
                searchable
                placeholder="Select variables"
              />
            )}

            {/* Data card fields */}
            {isDataType && (
              <>
                <Select
                  label="Data Table"
                  size="xs"
                  value={newDataTableId}
                  onChange={(value) => {
                    setNewDataTableId(value ?? '');
                    setNewXColumn('');
                    setNewYColumns([]);
                    setNewGroupColumn('');
                    setNewValueColumn('');
                  }}
                  data={dataTableOptions}
                  placeholder={dataTableOptions.length === 0 ? 'No tables uploaded' : 'Select table'}
                />
                {isPivot ? (
                  <>
                    <Select label="Group by" size="xs" value={newGroupColumn} onChange={(value) => setNewGroupColumn(value ?? '')} data={columnOptions} placeholder="Column to group by" />
                    <Select label="Value column" size="xs" value={newValueColumn} onChange={(value) => setNewValueColumn(value ?? '')} data={numericColumnOptions} placeholder="Numeric column" />
                    <Select label="Aggregation" size="xs" value={newAggregateFn} onChange={(value) => setNewAggregateFn((value as DashboardCard['aggregate_fn']) ?? 'sum')} data={AGGREGATE_OPTIONS} />
                  </>
                ) : isDataTable ? (
                  <NumberInput label="Max rows" size="xs" value={newDataTableRows} min={1} max={500} onChange={(value) => setNewDataTableRows(Number(value) || 20)} />
                ) : (
                  <>
                    <Select label="X column" size="xs" value={newXColumn} onChange={(value) => setNewXColumn(value ?? '')} data={columnOptions} placeholder="Category / X axis" />
                    {newCardType === 'data_pie' ? (
                      <Select label="Value column" size="xs" value={newYColumns[0] ?? ''} onChange={(value) => setNewYColumns(value ? [value] : [])} data={numericColumnOptions} placeholder="Numeric column" />
                    ) : (
                      <MultiSelect label="Y columns" size="xs" value={newYColumns} onChange={setNewYColumns} data={numericColumnOptions} placeholder="Numeric columns" />
                    )}
                  </>
                )}
              </>
            )}

            <TextInput size="xs" value={newTitle} onChange={(e) => setNewTitle(e.currentTarget.value)} placeholder="Title (optional)" />
            {newCardType === 'table' && (
              <NumberInput label="Rows" size="xs" value={newTableRows} min={1} max={200} onChange={(value) => setNewTableRows(Number(value) || 10)} />
            )}
            {newCardType === 'map' && (
              <Checkbox size="xs" label="Scale stock dots by value" checked={newScaleNodes} onChange={(e) => setNewScaleNodes(e.currentTarget.checked)} />
            )}
            <Button size="xs" onClick={handleAddCard} disabled={!canAdd}>
              Add Card
            </Button>
          </Stack>
        </Popover.Dropdown>
      </Popover>

      <TextInput
        size="xs"
        value={dashboard.name}
        onChange={(e) => onUpdateDashboard(dashboard.id, { name: e.currentTarget.value })}
        styles={{ input: { fontWeight: 600 } }}
        style={{ flex: 1 }}
      />
    </Group>
  );
}
```

**Step 2: Verify no type errors**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -i dashboard`
Expected: No errors in dashboard files (pre-existing errors elsewhere are OK)

**Step 3: Commit**

```bash
git add frontend/src/components/dashboard/DashboardToolbar.tsx
git commit -m "feat: add DashboardToolbar component with Add Card popover"
```

---

### Task 2: Wire toolbar into DashboardPage, remove flyout

**Files:**
- Modify: `frontend/src/components/dashboard/DashboardPage.tsx`

**Step 1: Replace flyout with toolbar**

Rewrite `DashboardPage.tsx` to:
1. Remove imports: `ScrollArea`, `IconCards`, `IconX`, `DashboardEditorPanel`
2. Add import: `DashboardToolbar`
3. Remove state: `editorOpen`, `setEditorOpen`
4. Remove store selectors no longer needed: `moveDashboardCard`, `deleteDashboardCard`
5. Remove the entire flyout overlay div (lines 174-218) and the toggle button (lines 220-239)
6. Add `DashboardToolbar` between the dashboard list and canvas inside the right panel

The canvas area section (lines 172-263) becomes:

```tsx
{/* Right: toolbar + canvas */}
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
      />
    ) : (
      <Box style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Text size="sm" c="dimmed">Create a dashboard to get started</Text>
      </Box>
    )}
  </Box>
</Box>
```

**Step 2: Verify it builds and renders**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -i "DashboardPage\|DashboardToolbar"`
Expected: No errors

**Step 3: Commit**

```bash
git add frontend/src/components/dashboard/DashboardPage.tsx
git commit -m "feat: replace flyout editor with toolbar in DashboardPage"
```

---

### Task 3: Add edit/delete controls to card headers in DashboardCanvasPanel

**Files:**
- Modify: `frontend/src/components/dashboard/DashboardCanvasPanel.tsx`

**Step 1: Add card edit popover and delete button**

In `DashboardCanvasPanel.tsx`:

1. Add imports: `Popover`, `Select`, `MultiSelect`, `TextInput`, `NumberInput`, `Checkbox` from `@mantine/core`, and `IconPencil`, `IconTrash` from `@tabler/icons-react`
2. Add props: `onDeleteCard: (dashboardId: string, cardId: string) => void`
3. Add state: `const [editingCardId, setEditingCardId] = useState<string | null>(null)`
4. Add card type constants (same as in DashboardToolbar): `SINGLE_VAR_TYPES`, `MULTI_VAR_TYPES`, `CARD_TYPE_DATA`

In the card header `<Group>`, after the Badge, add edit and delete ActionIcons:

```tsx
<Group gap={4} wrap="nowrap">
  <Popover
    opened={editingCardId === card.id}
    onChange={(opened) => setEditingCardId(opened ? card.id : null)}
    width={260}
    position="bottom-end"
    shadow="md"
  >
    <Popover.Target>
      <ActionIcon
        variant="subtle"
        size="sm"
        onClick={() => setEditingCardId(editingCardId === card.id ? null : card.id)}
      >
        <IconPencil size={14} />
      </ActionIcon>
    </Popover.Target>
    <Popover.Dropdown>
      <Stack gap={6}>
        <TextInput
          label="Title"
          size="xs"
          value={card.title}
          onChange={(e) => onUpdateCard(activeDashboardId, card.id, { title: e.currentTarget.value })}
        />
        <Select
          label="Type"
          size="xs"
          value={card.type}
          onChange={(value) => { if (value) onUpdateCard(activeDashboardId, card.id, { type: value as DashboardCardType }); }}
          data={CARD_TYPE_DATA}
        />
        {/* Single variable selector */}
        {SINGLE_VAR_TYPES.includes(card.type) && (
          <Select
            label="Variable"
            size="xs"
            value={card.variable}
            data={variableOptions}
            searchable
            onChange={(value) => { if (value) onUpdateCard(activeDashboardId, card.id, { variable: value }); }}
          />
        )}
        {/* Multi variable selector */}
        {MULTI_VAR_TYPES.includes(card.type) && (
          <MultiSelect
            label="Variables"
            size="xs"
            value={card.variables ?? []}
            data={variableOptions}
            searchable
            onChange={(values) => onUpdateCard(activeDashboardId, card.id, { variables: values })}
          />
        )}
        {card.type === 'table' && (
          <NumberInput
            label="Table Rows"
            size="xs"
            value={card.table_rows ?? 10}
            min={1}
            max={200}
            onChange={(value) => onUpdateCard(activeDashboardId, card.id, { table_rows: Number(value) || 10 })}
          />
        )}
        {card.type === 'map' && (
          <Checkbox
            size="xs"
            label="Scale stock dots by value"
            checked={card.scale_nodes ?? false}
            onChange={(e) => onUpdateCard(activeDashboardId, card.id, { scale_nodes: e.currentTarget.checked })}
          />
        )}
      </Stack>
    </Popover.Dropdown>
  </Popover>
  <ActionIcon
    variant="subtle"
    size="sm"
    color="red"
    onClick={() => onDeleteCard(activeDashboardId, card.id)}
  >
    <IconTrash size={14} />
  </ActionIcon>
</Group>
```

Also add `variableOptions` prop to the component:

```tsx
type Props = {
  cards: DashboardCard[];
  selectedRun: ScenarioRunResult | null;
  activeDashboardId: string;
  onUpdateCard: (dashboardId: string, cardId: string, patch: Partial<DashboardCard>) => void;
  onDeleteCard: (dashboardId: string, cardId: string) => void;
  variableOptions: Array<{ value: string; label: string }>;
};
```

**Step 2: Update DashboardPage to pass new props**

In `DashboardPage.tsx`, update the `DashboardCanvasPanel` usage:

```tsx
<DashboardCanvasPanel
  cards={activeDashboard.cards}
  selectedRun={selectedRun}
  activeDashboardId={activeDashboard.id}
  onUpdateCard={updateDashboardCard}
  onDeleteCard={deleteDashboardCard}
  variableOptions={variableOptions}
/>
```

(Re-add `deleteDashboardCard` selector if it was removed in Task 2.)

**Step 3: Verify no type errors**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -i "DashboardCanvas\|DashboardPage"`
Expected: No errors

**Step 4: Commit**

```bash
git add frontend/src/components/dashboard/DashboardCanvasPanel.tsx frontend/src/components/dashboard/DashboardPage.tsx
git commit -m "feat: add edit/delete controls to dashboard card headers"
```

---

### Task 4: Delete DashboardEditorPanel

**Files:**
- Delete: `frontend/src/components/dashboard/DashboardEditorPanel.tsx`

**Step 1: Verify no remaining imports of DashboardEditorPanel**

Run: `cd frontend && grep -r "DashboardEditorPanel" src/`
Expected: No results (already removed import in Task 2)

**Step 2: Delete the file**

```bash
rm frontend/src/components/dashboard/DashboardEditorPanel.tsx
```

**Step 3: Verify build**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -i dashboard`
Expected: No new errors

**Step 4: Run existing tests**

Run: `cd frontend && npx vitest run --reporter=verbose 2>&1 | tail -20`
Expected: All tests pass (no dashboard component tests exist, but layout/template tests should still pass)

**Step 5: Commit**

```bash
git add -A frontend/src/components/dashboard/
git commit -m "chore: remove unused DashboardEditorPanel component"
```

---

### Task 5: Manual verification and final cleanup

**Step 1: Verify the toolbar renders**

Run: `cd frontend && npm run dev` and navigate to `/dashboard`
Expected:
- Dashboard list panel on the left
- Toolbar with "Add Card" button and dashboard name input above the canvas
- No white page when interacting
- Clicking "Add Card" opens a popover with card type and config fields
- Adding a card places it on the canvas
- Each card has edit (pencil) and delete (trash) icons in header
- Clicking edit opens a popover with card config fields

**Step 2: Commit final state**

```bash
git add -A
git commit -m "feat: dashboard toolbar with add card popover and per-card editing"
```
