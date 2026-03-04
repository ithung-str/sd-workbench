import { useMemo } from 'react';
import { Table, Text } from '@mantine/core';
import type { DashboardCard } from '../../types/model';
import type { DataTable } from '../../types/dataTable';

type AggregateFn = NonNullable<DashboardCard['aggregate_fn']>;

function aggregate(values: number[], fn: AggregateFn): number {
  if (values.length === 0) return 0;
  switch (fn) {
    case 'sum':
      return values.reduce((a, b) => a + b, 0);
    case 'avg':
      return values.reduce((a, b) => a + b, 0) / values.length;
    case 'count':
      return values.length;
    case 'min':
      return Math.min(...values);
    case 'max':
      return Math.max(...values);
  }
}

function formatValue(value: number): string {
  if (!Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (abs >= 1) return value.toFixed(2);
  if (abs >= 0.01) return value.toFixed(4);
  return value.toExponential(2);
}

type Props = {
  card: DashboardCard;
  table: DataTable;
};

export function DataPivotCardContent({ card, table }: Props) {
  const groupCol = card.group_column;
  const valueCol = card.value_column;
  const fn = card.aggregate_fn ?? 'sum';

  const pivotRows = useMemo(() => {
    if (!groupCol || !valueCol) return [];
    const groupIdx = table.columns.findIndex((c) => c.key === groupCol);
    const valueIdx = table.columns.findIndex((c) => c.key === valueCol);
    if (groupIdx < 0 || valueIdx < 0) return [];

    const groups = new Map<string, number[]>();
    for (const row of table.rows) {
      const key = row[groupIdx] != null ? String(row[groupIdx]) : '(empty)';
      const val = row[valueIdx];
      const num = typeof val === 'number' ? val : Number(val);
      if (!Number.isFinite(num)) continue;
      const arr = groups.get(key);
      if (arr) {
        arr.push(num);
      } else {
        groups.set(key, [num]);
      }
    }

    return Array.from(groups.entries())
      .map(([group, values]) => ({
        group,
        value: aggregate(values, fn),
        count: values.length,
      }))
      .sort((a, b) => b.value - a.value);
  }, [table, groupCol, valueCol, fn]);

  if (!groupCol || !valueCol) {
    return <Text size="xs" c="dimmed">Configure group column, value column, and aggregation.</Text>;
  }

  if (pivotRows.length === 0) {
    return <Text size="xs" c="dimmed">No data to aggregate.</Text>;
  }

  return (
    <Table striped highlightOnHover withTableBorder withColumnBorders style={{ fontSize: 11 }}>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>{groupCol}</Table.Th>
          <Table.Th style={{ textAlign: 'right' }}>{fn}({valueCol})</Table.Th>
          <Table.Th style={{ textAlign: 'right' }}>Count</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {pivotRows.map((row) => (
          <Table.Tr key={row.group}>
            <Table.Td>{row.group}</Table.Td>
            <Table.Td style={{ textAlign: 'right' }}>{formatValue(row.value)}</Table.Td>
            <Table.Td style={{ textAlign: 'right' }}>{row.count}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
