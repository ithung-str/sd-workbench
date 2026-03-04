import { Handle, Position, type NodeProps } from 'reactflow';
import { Box, ScrollArea, SegmentedControl, Table, Text } from '@mantine/core';
import { IconTableFilled } from '@tabler/icons-react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import type { NodeResultResponse } from '../../../lib/api';

type OutputData = {
  output_mode?: 'table' | 'bar' | 'line';
  onUpdate: (patch: Record<string, unknown>) => void;
  result?: NodeResultResponse;
};

export function OutputNode({ data }: NodeProps<OutputData>) {
  const result = data.result;
  const preview = result?.ok ? result.preview : null;
  const mode = data.output_mode ?? 'table';

  const chartData = preview
    ? preview.rows.map((row) => {
        const entry: Record<string, unknown> = {};
        preview.columns.forEach((col, i) => {
          const key = typeof col === 'string' ? col : col.key;
          entry[key] = row[i];
        });
        return entry;
      })
    : [];

  const numericCols = preview?.columns.filter((c) => typeof c !== 'string' && c.type === 'number').map((c) => (typeof c === 'string' ? c : c.key)) ?? [];
  const xCol = preview?.columns[0] ? (typeof preview.columns[0] === 'string' ? preview.columns[0] : preview.columns[0].key) : '';

  return (
    <Box
      style={{
        background: '#fff',
        border: '1px solid #dee2e6',
        borderRadius: 8,
        minWidth: 300,
        minHeight: 200,
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Handle type="target" position={Position.Left} />

      <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
        <IconTableFilled size={14} color="#e67700" />
        <Text size="xs" fw={600} c="orange.8">Output</Text>
        {result && (
          <Box style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: result.ok ? '#2f9e44' : '#e03131' }} />
        )}
      </Box>

      <Box px={12} py={4}>
        <SegmentedControl
          size="xs"
          value={mode}
          onChange={(v) => data.onUpdate({ output_mode: v })}
          data={[
            { value: 'table', label: 'Table' },
            { value: 'bar', label: 'Bar' },
            { value: 'line', label: 'Line' },
          ]}
        />
      </Box>

      {!result && <Text size="xs" c="dimmed" p={12}>Run pipeline to see output</Text>}

      {result && !result.ok && (
        <Box style={{ padding: '6px 12px' }}>
          <Text size="xs" c="red" style={{ fontFamily: 'monospace' }}>{result.error}</Text>
        </Box>
      )}

      {preview && mode === 'table' && (
        <ScrollArea style={{ flex: 1, maxHeight: 300 }} px={4}>
          <Table striped highlightOnHover style={{ fontSize: 11 }}>
            <Table.Thead>
              <Table.Tr>
                {preview.columns.map((col) => (
                  <Table.Th key={typeof col === 'string' ? col : col.key} style={{ padding: '2px 8px' }}>
                    {typeof col === 'string' ? col : col.label}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {preview.rows.map((row, i) => (
                <Table.Tr key={i}>
                  {(row as unknown[]).map((cell, j) => (
                    <Table.Td key={j} style={{ padding: '2px 8px' }}>{cell != null ? String(cell) : ''}</Table.Td>
                  ))}
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </ScrollArea>
      )}

      {preview && mode === 'bar' && (
        <Box style={{ height: 200, padding: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey={xCol} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              {numericCols.slice(0, 5).map((col, i) => (
                <Bar key={col} dataKey={col} fill={['#4263eb', '#2f9e44', '#e67700', '#c2255c', '#0b7285'][i % 5]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      {preview && mode === 'line' && (
        <Box style={{ height: 200, padding: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey={xCol} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              {numericCols.slice(0, 5).map((col, i) => (
                <Line key={col} type="monotone" dataKey={col} stroke={['#4263eb', '#2f9e44', '#e67700', '#c2255c', '#0b7285'][i % 5]} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Box>
  );
}
