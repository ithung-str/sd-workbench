import { type ReactNode, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Collapse,
  Group,
  MultiSelect,
  NumberInput,
  Paper,
  Select,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconTrash } from '@tabler/icons-react';
import type { DashboardCard, DashboardCardType, DashboardDefinition } from '../../types/model';
import { listDataTables } from '../../lib/dataTableStorage';
import type { DataTableMeta } from '../../types/dataTable';

type VariableOption = { value: string; label: string };

type Props = {
  dashboard: DashboardDefinition;
  variableOptions: VariableOption[];
  onUpdateDashboard: (id: string, patch: Partial<DashboardDefinition>) => void;
  onAddCard: (dashboardId: string, card: Omit<DashboardCard, 'id' | 'order'> & { id?: string; order?: number }) => void;
  onUpdateCard: (dashboardId: string, cardId: string, patch: Partial<DashboardCard>) => void;
  onMoveCard: (dashboardId: string, cardId: string, direction: 'up' | 'down') => void;
  onDeleteCard: (dashboardId: string, cardId: string) => void;
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

export function DashboardEditorPanel({
  dashboard,
  variableOptions,
  onUpdateDashboard,
  onAddCard,
  onUpdateCard,
  onMoveCard,
  onDeleteCard,
}: Props) {
  const [newCardType, setNewCardType] = useState<DashboardCardType>('kpi');
  const [newVariable, setNewVariable] = useState('');
  const [newVariables, setNewVariables] = useState<string[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newTableRows, setNewTableRows] = useState<number>(10);
  const [newScaleNodes, setNewScaleNodes] = useState(false);
  const [editingCardId, setEditingCardId] = useState<string | null>(null);

  // Data card state
  const [dataTables, setDataTables] = useState<DataTableMeta[]>([]);
  const [newDataTableId, setNewDataTableId] = useState('');
  const [newXColumn, setNewXColumn] = useState('');
  const [newYColumns, setNewYColumns] = useState<string[]>([]);
  const [newGroupColumn, setNewGroupColumn] = useState('');
  const [newValueColumn, setNewValueColumn] = useState('');
  const [newAggregateFn, setNewAggregateFn] = useState<DashboardCard['aggregate_fn']>('sum');
  const [newDataTableRows, setNewDataTableRows] = useState<number>(20);

  // Load available data tables
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

  const sortedCards = dashboard.cards.slice().sort((a, b) => a.order - b.order);

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
  };

  // Helper to get column options for an existing card being edited
  const getCardColumnOptions = (card: DashboardCard) => {
    const meta = dataTables.find((dt) => dt.id === card.data_table_id);
    if (!meta) return { all: [], numeric: [] };
    return {
      all: meta.columns.map((c) => ({ value: c.key, label: `${c.label} (${c.type})` })),
      numeric: meta.columns.filter((c) => c.type === 'number').map((c) => ({ value: c.key, label: c.label })),
    };
  };

  return (
    <Stack gap="xs" p="xs">
      {/* Dashboard name */}
      <TextInput
        size="xs"
        value={dashboard.name}
        onChange={(e) => onUpdateDashboard(dashboard.id, { name: e.currentTarget.value })}
        styles={{ input: { fontWeight: 600 } }}
      />

      {/* Add card */}
      <Paper withBorder p="xs">
        <Stack gap={6}>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">Add Card</Text>
          <Select
            size="xs"
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
                  <Select
                    label="Group by"
                    size="xs"
                    value={newGroupColumn}
                    onChange={(value) => setNewGroupColumn(value ?? '')}
                    data={columnOptions}
                    placeholder="Column to group by"
                  />
                  <Select
                    label="Value column"
                    size="xs"
                    value={newValueColumn}
                    onChange={(value) => setNewValueColumn(value ?? '')}
                    data={numericColumnOptions}
                    placeholder="Numeric column"
                  />
                  <Select
                    label="Aggregation"
                    size="xs"
                    value={newAggregateFn}
                    onChange={(value) => setNewAggregateFn((value as DashboardCard['aggregate_fn']) ?? 'sum')}
                    data={AGGREGATE_OPTIONS}
                  />
                </>
              ) : isDataTable ? (
                <NumberInput
                  label="Max rows"
                  size="xs"
                  value={newDataTableRows}
                  min={1}
                  max={500}
                  onChange={(value) => setNewDataTableRows(Number(value) || 20)}
                />
              ) : (
                <>
                  <Select
                    label="X column"
                    size="xs"
                    value={newXColumn}
                    onChange={(value) => setNewXColumn(value ?? '')}
                    data={columnOptions}
                    placeholder="Category / X axis"
                  />
                  {newCardType === 'data_pie' ? (
                    <Select
                      label="Value column"
                      size="xs"
                      value={newYColumns[0] ?? ''}
                      onChange={(value) => setNewYColumns(value ? [value] : [])}
                      data={numericColumnOptions}
                      placeholder="Numeric column"
                    />
                  ) : (
                    <MultiSelect
                      label="Y columns"
                      size="xs"
                      value={newYColumns}
                      onChange={setNewYColumns}
                      data={numericColumnOptions}
                      placeholder="Numeric columns"
                    />
                  )}
                </>
              )}
            </>
          )}

          <TextInput
            size="xs"
            value={newTitle}
            onChange={(e) => setNewTitle(e.currentTarget.value)}
            placeholder="Title (optional)"
          />
          {newCardType === 'table' && (
            <NumberInput
              label="Rows"
              size="xs"
              value={newTableRows}
              min={1}
              max={200}
              onChange={(value) => setNewTableRows(Number(value) || 10)}
            />
          )}
          {newCardType === 'map' && (
            <Checkbox
              size="xs"
              label="Scale stock dots by value"
              checked={newScaleNodes}
              onChange={(e) => setNewScaleNodes(e.currentTarget.checked)}
            />
          )}
          <Button size="xs" onClick={handleAddCard} disabled={!canAdd}>
            Add Card
          </Button>
        </Stack>
      </Paper>

      {/* Cards list */}
      <Stack gap={4}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" px={2}>Cards</Text>
        {sortedCards.length === 0 ? (
          <Text size="xs" c="dimmed">No cards yet.</Text>
        ) : (
          sortedCards.map((card) => {
            const isEditing = editingCardId === card.id;
            const cardNeedsSingleVar = SINGLE_VAR_TYPES.includes(card.type);
            const cardNeedsMultiVar = MULTI_VAR_TYPES.includes(card.type);
            const cardIsData = isDataCardType(card.type);
            const cardIsPivot = card.type === 'data_pivot';
            const cardIsDataTable = card.type === 'data_table';
            const cardColOpts = cardIsData ? getCardColumnOptions(card) : { all: [], numeric: [] };
            return (
              <Paper key={card.id} withBorder p="xs">
                <Group justify="space-between" align="center" wrap="nowrap">
                  <div
                    style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                    onClick={() => setEditingCardId(isEditing ? null : card.id)}
                  >
                    <Text fw={600} size="sm" truncate>{card.title}</Text>
                    <Text size="xs" c="dimmed">
                      {card.type.toUpperCase()}
                      {cardNeedsSingleVar && <> &bull; {card.variable}</>}
                      {cardNeedsMultiVar && card.variables && <> &bull; {card.variables.length} vars</>}
                      {cardIsData && card.data_table_id && <> &bull; {dataTables.find((dt) => dt.id === card.data_table_id)?.name ?? 'table'}</>}
                    </Text>
                  </div>
                  <Group gap={4}>
                    <ActionCardButton
                      label="Move up"
                      icon={<IconArrowUp size={14} />}
                      onClick={() => onMoveCard(dashboard.id, card.id, 'up')}
                    />
                    <ActionCardButton
                      label="Move down"
                      icon={<IconArrowDown size={14} />}
                      onClick={() => onMoveCard(dashboard.id, card.id, 'down')}
                    />
                    <ActionCardButton
                      label="Delete"
                      icon={<IconTrash size={14} />}
                      onClick={() => onDeleteCard(dashboard.id, card.id)}
                    />
                  </Group>
                </Group>
                <Collapse in={isEditing}>
                  <Stack gap="xs" mt="xs">
                    <TextInput
                      label="Title"
                      size="xs"
                      value={card.title}
                      onChange={(e) => onUpdateCard(dashboard.id, card.id, { title: e.currentTarget.value })}
                    />
                    <Select
                      label="Type"
                      size="xs"
                      value={card.type}
                      onChange={(value) => {
                        if (value) onUpdateCard(dashboard.id, card.id, { type: value as DashboardCardType });
                      }}
                      data={CARD_TYPE_DATA}
                    />
                    {/* Simulation card edit fields */}
                    {cardNeedsSingleVar && (
                      <Select
                        label="Variable"
                        size="xs"
                        value={card.variable}
                        data={variableOptions}
                        searchable
                        onChange={(value) => {
                          if (value) onUpdateCard(dashboard.id, card.id, { variable: value });
                        }}
                      />
                    )}
                    {cardNeedsMultiVar && (
                      <MultiSelect
                        label="Variables"
                        size="xs"
                        value={card.variables ?? []}
                        data={variableOptions}
                        searchable
                        onChange={(values) => onUpdateCard(dashboard.id, card.id, { variables: values })}
                      />
                    )}
                    {card.type === 'table' && (
                      <NumberInput
                        label="Table Rows"
                        size="xs"
                        value={card.table_rows ?? 10}
                        min={1}
                        max={200}
                        onChange={(value) => onUpdateCard(dashboard.id, card.id, { table_rows: Number(value) || 10 })}
                      />
                    )}
                    {card.type === 'map' && (
                      <Checkbox
                        size="xs"
                        label="Scale stock dots by value"
                        checked={card.scale_nodes ?? false}
                        onChange={(e) => onUpdateCard(dashboard.id, card.id, { scale_nodes: e.currentTarget.checked })}
                      />
                    )}
                    {/* Data card edit fields */}
                    {cardIsData && (
                      <>
                        <Select
                          label="Data Table"
                          size="xs"
                          value={card.data_table_id ?? ''}
                          onChange={(value) => onUpdateCard(dashboard.id, card.id, {
                            data_table_id: value ?? undefined,
                            x_column: undefined,
                            y_columns: undefined,
                            group_column: undefined,
                            value_column: undefined,
                          })}
                          data={dataTableOptions}
                        />
                        {cardIsPivot ? (
                          <>
                            <Select
                              label="Group by"
                              size="xs"
                              value={card.group_column ?? ''}
                              onChange={(value) => onUpdateCard(dashboard.id, card.id, { group_column: value ?? undefined })}
                              data={cardColOpts.all}
                            />
                            <Select
                              label="Value column"
                              size="xs"
                              value={card.value_column ?? ''}
                              onChange={(value) => onUpdateCard(dashboard.id, card.id, { value_column: value ?? undefined })}
                              data={cardColOpts.numeric}
                            />
                            <Select
                              label="Aggregation"
                              size="xs"
                              value={card.aggregate_fn ?? 'sum'}
                              onChange={(value) => onUpdateCard(dashboard.id, card.id, { aggregate_fn: (value as DashboardCard['aggregate_fn']) ?? 'sum' })}
                              data={AGGREGATE_OPTIONS}
                            />
                          </>
                        ) : cardIsDataTable ? (
                          <NumberInput
                            label="Max rows"
                            size="xs"
                            value={card.data_table_rows ?? 20}
                            min={1}
                            max={500}
                            onChange={(value) => onUpdateCard(dashboard.id, card.id, { data_table_rows: Number(value) || 20 })}
                          />
                        ) : (
                          <>
                            <Select
                              label="X column"
                              size="xs"
                              value={card.x_column ?? ''}
                              onChange={(value) => onUpdateCard(dashboard.id, card.id, { x_column: value ?? undefined })}
                              data={cardColOpts.all}
                            />
                            {card.type === 'data_pie' ? (
                              <Select
                                label="Value column"
                                size="xs"
                                value={card.y_columns?.[0] ?? ''}
                                onChange={(value) => onUpdateCard(dashboard.id, card.id, { y_columns: value ? [value] : [] })}
                                data={cardColOpts.numeric}
                              />
                            ) : (
                              <MultiSelect
                                label="Y columns"
                                size="xs"
                                value={card.y_columns ?? []}
                                onChange={(values) => onUpdateCard(dashboard.id, card.id, { y_columns: values })}
                                data={cardColOpts.numeric}
                              />
                            )}
                          </>
                        )}
                      </>
                    )}
                  </Stack>
                </Collapse>
              </Paper>
            );
          })
        )}
      </Stack>
    </Stack>
  );
}

function ActionCardButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <Button variant="subtle" size="compact-xs" aria-label={label} title={label} onClick={onClick} px={6}>
      {icon}
    </Button>
  );
}
