import { useMemo } from 'react';
import { Text } from '@mantine/core';
import {
  Area,
  AreaChart,
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
import { getPalette } from '../../lib/chartPalettes';

type Props = {
  card: DashboardCard;
  table: DataTable;
};

export function DataAreaCardContent({ card, table }: Props) {
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

  const colors = getPalette(card.color_palette);

  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        {card.show_grid !== false && <CartesianGrid stroke="#f0f0f0" vertical={false} />}
        <XAxis dataKey={xCol} tick={{ fontSize: 11, fill: '#868e96' }} axisLine={{ stroke: '#dee2e6' }} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: '#868e96' }} axisLine={false} tickLine={false} width={50} />
        <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e9ecef', boxShadow: '0 2px 8px rgba(0,0,0,0.08)' }} />
        {card.show_legend !== false && yCols.length > 1 && <Legend wrapperStyle={{ fontSize: 11, color: '#868e96' }} />}
        {yCols.map((col, i) => (
          <Area
            key={col}
            type="monotone"
            dataKey={col}
            fill={colors[i % colors.length]}
            stroke={colors[i % colors.length]}
            fillOpacity={0.3}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}
