import { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Checkbox,
  Group,
  MultiSelect,
  NumberInput,
  Popover,
  Select,
  Stack,
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
