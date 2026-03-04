import { useMemo } from 'react';
import { Text } from '@mantine/core';
import {
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import type { DashboardCard } from '../../types/model';
import type { DataTable } from '../../types/dataTable';

const COLORS = ['#1b6ca8', '#d46a00', '#2f7d32', '#8a2be2', '#d32f2f', '#00838f', '#c2185b', '#455a64'];

type Props = {
  card: DashboardCard;
  table: DataTable;
};

export function DataPieCardContent({ card, table }: Props) {
  const xCol = card.x_column;
  const yCol = card.y_columns?.[0];

  const data = useMemo(() => {
    if (!xCol || !yCol) return [];
    const xIdx = table.columns.findIndex((c) => c.key === xCol);
    const yIdx = table.columns.findIndex((c) => c.key === yCol);
    if (xIdx < 0 || yIdx < 0) return [];

    return table.rows
      .map((row) => {
        const val = row[yIdx];
        return {
          name: row[xIdx] != null ? String(row[xIdx]) : '',
          value: typeof val === 'number' ? val : Number(val) || 0,
        };
      })
      .filter((d) => d.value > 0);
  }, [table, xCol, yCol]);

  if (!xCol || !yCol) {
    return <Text size="xs" c="dimmed">Configure label column and value column.</Text>;
  }

  if (data.length === 0) {
    return <Text size="xs" c="dimmed">No data to display.</Text>;
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          data={data}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          outerRadius="70%"
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
          labelLine={{ strokeWidth: 1 }}
          style={{ fontSize: 10 }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip />
        <Legend wrapperStyle={{ fontSize: 10 }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
