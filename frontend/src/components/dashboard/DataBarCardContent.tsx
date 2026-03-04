import { useMemo } from 'react';
import { Text } from '@mantine/core';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { DashboardCard } from '../../types/model';
import type { DataTable } from '../../types/dataTable';
import { applyFilters } from '../../lib/dataTableFilters';

const COLORS = ['#1b6ca8', '#d46a00', '#2f7d32', '#8a2be2', '#d32f2f', '#00838f', '#c2185b', '#455a64'];

type Props = {
  card: DashboardCard;
  table: DataTable;
  stacked?: boolean;
};

export function DataBarCardContent({ card, table, stacked = false }: Props) {
  const xCol = card.x_column;
  const yCols = card.y_columns ?? [];

  const data = useMemo(() => {
    if (!xCol || yCols.length === 0) return [];
    const xIdx = table.columns.findIndex((c) => c.key === xCol);
    const yIdxs = yCols.map((key) => table.columns.findIndex((c) => c.key === key));
    if (xIdx < 0 || yIdxs.some((i) => i < 0)) return [];

    const filteredRows = applyFilters(table, card.filters ?? []);
    return filteredRows.map((row) => {
      const entry: Record<string, string | number> = {
        [xCol]: row[xIdx] != null ? String(row[xIdx]) : '',
      };
      for (let i = 0; i < yCols.length; i++) {
        const val = row[yIdxs[i]];
        entry[yCols[i]] = typeof val === 'number' ? val : Number(val) || 0;
      }
      return entry;
    });
  }, [table, xCol, yCols, card.filters]);

  if (!xCol || yCols.length === 0) {
    return <Text size="xs" c="dimmed">Configure X column and Y column(s).</Text>;
  }

  if (data.length === 0) {
    return <Text size="xs" c="dimmed">No data to display.</Text>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
        <XAxis dataKey={xCol} tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} width={48} />
        <Tooltip />
        {yCols.length > 1 && <Legend wrapperStyle={{ fontSize: 10 }} />}
        {yCols.map((col, i) => (
          <Bar
            key={col}
            dataKey={col}
            fill={COLORS[i % COLORS.length]}
            stackId={stacked ? 'stack' : undefined}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}
