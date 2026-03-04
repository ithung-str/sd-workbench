import { Box, Select, MultiSelect, Text } from '@mantine/core';
import type { ChartConfig } from '../../../types/model';

type ColumnInfo = { key: string; label: string; type: string };

type Props = {
  config: ChartConfig;
  columns: ColumnInfo[];
  onChange: (config: ChartConfig) => void;
};

export function ChartConfigPanel({ config, columns, onChange }: Props) {
  const allCols = columns.map((c) => ({ value: c.key, label: c.label }));
  const numericCols = columns.filter((c) => c.type === 'number').map((c) => ({ value: c.key, label: c.label }));
  const stringCols = columns.filter((c) => c.type === 'string').map((c) => ({ value: c.key, label: c.label }));

  return (
    <Box px={12} py={6} style={{ borderBottom: '1px solid #f0f0f0', background: '#fafbfc' }}>
      <Text size="xs" fw={600} c="dimmed" mb={4}>Chart Config</Text>
      <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        <Select
          size="xs"
          label="X Axis"
          placeholder="First column"
          data={allCols}
          value={config.xColumn ?? null}
          onChange={(v) => onChange({ ...config, xColumn: v ?? undefined })}
          clearable
          styles={{ label: { fontSize: 10, color: '#888' } }}
        />
        <MultiSelect
          size="xs"
          label="Y Axis"
          placeholder="Numeric columns"
          data={numericCols}
          value={config.yColumns ?? []}
          onChange={(v) => onChange({ ...config, yColumns: v })}
          styles={{ label: { fontSize: 10, color: '#888' } }}
          maxValues={6}
        />
        <Select
          size="xs"
          label="Color By"
          placeholder="None"
          data={stringCols}
          value={config.colorColumn ?? null}
          onChange={(v) => onChange({ ...config, colorColumn: v ?? undefined })}
          clearable
          styles={{ label: { fontSize: 10, color: '#888' } }}
        />
        <Select
          size="xs"
          label="Aggregation"
          data={[
            { value: 'none', label: 'None' },
            { value: 'sum', label: 'Sum' },
            { value: 'mean', label: 'Mean' },
            { value: 'count', label: 'Count' },
            { value: 'min', label: 'Min' },
            { value: 'max', label: 'Max' },
          ]}
          value={config.aggregation ?? 'none'}
          onChange={(v) => onChange({ ...config, aggregation: (v as ChartConfig['aggregation']) ?? 'none' })}
          styles={{ label: { fontSize: 10, color: '#888' } }}
        />
      </Box>
    </Box>
  );
}
