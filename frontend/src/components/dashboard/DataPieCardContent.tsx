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
import { applyFilters } from '../../lib/dataTableFilters';
import { getPalette } from '../../lib/chartPalettes';

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

    const filteredRows = applyFilters(table, card.filters ?? []);
    return filteredRows
      .map((row) => {
        const val = row[yIdx];
        return {
          name: row[xIdx] != null ? String(row[xIdx]) : '',
          value: typeof val === 'number' ? val : Number(val) || 0,
        };
      })
      .filter((d) => d.value > 0);
  }, [table, xCol, yCol, card.filters]);

  if (!xCol || !yCol) {
    return <Text size="xs" c="dimmed">Configure label column and value column.</Text>;
  }

  if (data.length === 0) {
    return <Text size="xs" c="dimmed">No data to display.</Text>;
  }

  const colors = getPalette(card.color_palette);

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
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Pie>
        <Tooltip />
        {card.show_legend !== false && <Legend wrapperStyle={{ fontSize: 10 }} />}
      </PieChart>
    </ResponsiveContainer>
  );
}
