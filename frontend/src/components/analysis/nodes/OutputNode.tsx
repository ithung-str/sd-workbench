import { Handle, Position, NodeResizer, type NodeProps } from 'reactflow';
import { ActionIcon, Box, ScrollArea, SegmentedControl, Table, Text, Textarea, TextInput, Tooltip as MantineTooltip } from '@mantine/core';
import { IconTableFilled, IconTrash } from '@tabler/icons-react';
import { ResponsiveContainer, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid } from 'recharts';
import type { NodeResultResponse } from '../../../lib/api';
import type { RunScope, ZoomLevel } from '../AnalysisPage';
import { StatsPanel } from './StatsPanel';
import { RunMenu } from './RunMenu';
import './analysisNodes.css';

type OutputData = {
  output_mode?: 'table' | 'bar' | 'line' | 'stats';
  name?: string;
  description?: string;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
  onRunScope?: (scope: RunScope) => void;
  result?: NodeResultResponse;
  selected?: boolean;
  zoomLevel?: ZoomLevel;
};

function statusClass(result?: NodeResultResponse): string {
  if (!result) return 'node-card--none';
  return result.ok ? 'node-card--ok' : 'node-card--error';
}

export function OutputNode({ data }: NodeProps<OutputData>) {
  const result = data.result;
  const preview = result?.ok ? result.preview : null;
  const mode = data.output_mode ?? 'table';
  const zoomLevel = data.zoomLevel ?? 'full';

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

  // ── Mini view ──
  if (zoomLevel === 'mini') {
    return (
      <div className="analysis-node analysis-node--mini">
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden' }}>
          <div className="node-zoom-mini node-zoom-content">
            <IconTableFilled size={14} color="#e67700" />
            <Text size="xs" fw={600} c="orange.8" truncate>{data.name || 'Output'}</Text>
          </div>
          <Handle type="target" position={Position.Left} />
        </Box>
      </div>
    );
  }

  // ── Summary view ──
  if (zoomLevel === 'summary') {
    return (
      <div className="analysis-node analysis-node--summary">
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden', minWidth: 180 }}>
          <div className="node-zoom-summary node-zoom-content">
            <Box style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconTableFilled size={14} color="#e67700" />
              <Text size="xs" fw={600} c="orange.8" truncate>{data.name || 'Output'}</Text>
            </Box>
            {data.description && (
              <Text size="xs" c="dimmed" mt={4} lineClamp={3}>{data.description}</Text>
            )}
          </div>
          <Handle type="target" position={Position.Left} />
        </Box>
      </div>
    );
  }

  // ── Full view ──
  return (
    <div className="analysis-node" style={{ width: '100%', height: '100%' }}>
    <NodeResizer minWidth={280} minHeight={180} isVisible={data.selected} />
    <Box
      className={`node-card ${statusClass(result)}`}
      style={{
        background: '#fff',
        border: '1px solid #dee2e6',
        borderRadius: 8,
        minWidth: 300,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Handle type="target" position={Position.Left} />

      <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
        <IconTableFilled size={14} color="#e67700" />
        <TextInput
          size="xs"
          variant="unstyled"
          value={data.name ?? ''}
          placeholder="Output"
          onChange={(e) => data.onUpdate({ name: e.currentTarget.value })}
          styles={{
            input: { fontWeight: 600, fontSize: 12, color: 'var(--mantine-color-orange-8)', padding: 0, height: 20, minHeight: 20, width: Math.max(40, (data.name?.length ?? 6) * 8 + 12) },
          }}
        />
        <div className="node-controls" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          {data.onRunScope && <RunMenu onRunScope={data.onRunScope} />}
          {result && (
            <Box style={{ width: 8, height: 8, borderRadius: '50%', background: result.ok ? '#2f9e44' : '#e03131' }} />
          )}
          {data.onDelete && (
            <MantineTooltip label="Delete node">
              <ActionIcon size="xs" variant="subtle" color="red" onClick={data.onDelete}>
                <IconTrash size={12} />
              </ActionIcon>
            </MantineTooltip>
          )}
        </div>
      </Box>

      <div className="node-zoom-content">
        <Box px={12} py={4}>
          <SegmentedControl
            size="xs"
            value={mode}
            onChange={(v) => data.onUpdate({ output_mode: v })}
            data={[
              { value: 'table', label: 'Table' },
              { value: 'bar', label: 'Bar' },
              { value: 'line', label: 'Line' },
              { value: 'stats', label: 'Stats' },
            ]}
          />
        </Box>

        <Box px={12} pb={4}>
          <Textarea
            size="xs"
            placeholder="Description..."
            value={data.description ?? ''}
            onChange={(e) => data.onUpdate({ description: e.currentTarget.value })}
            autosize
            minRows={1}
            maxRows={3}
            styles={{ input: { fontSize: 11, border: 'none', padding: 0, background: 'transparent' } }}
          />
        </Box>
      </div>

      {!result && <Text size="xs" c="dimmed" p={12}>Run pipeline to see output</Text>}

      {result && !result.ok && (
        <Box style={{ padding: '6px 12px' }}>
          <Text size="xs" c="red" style={{ fontFamily: 'monospace' }}>{result.error}</Text>
        </Box>
      )}

      {preview && mode === 'stats' && preview.stats && (
        <StatsPanel stats={preview.stats} shape={result?.shape} />
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
              <RechartsTooltip />
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
              <RechartsTooltip />
              {numericCols.slice(0, 5).map((col, i) => (
                <Line key={col} type="monotone" dataKey={col} stroke={['#4263eb', '#2f9e44', '#e67700', '#c2255c', '#0b7285'][i % 5]} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Box>
    </div>
  );
}
