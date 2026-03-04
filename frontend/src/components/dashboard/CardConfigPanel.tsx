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
        <Accordion multiple defaultValue={['data', 'filters', 'display', 'style']} variant="separated">
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
