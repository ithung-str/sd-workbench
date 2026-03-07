import { useState } from 'react';
import { type NodeProps, NodeResizer } from 'reactflow';
import { ActionIcon, Badge, Box, ScrollArea, SegmentedControl, Table, Text, Textarea, TextInput, Tooltip as MantineTooltip } from '@mantine/core';
import { IconCamera, IconMaximize, IconSparkles, IconTableFilled, IconTrash, IconX } from '@tabler/icons-react';
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, ScatterChart, Scatter,
  XAxis, YAxis, Tooltip as RechartsTooltip, CartesianGrid,
} from 'recharts';
import type { NodeResultResponse } from '../../../lib/api';
import type { ChartConfig } from '../../../types/model';
import type { RunScope, ZoomLevel } from '../AnalysisPage';
import { StatsPanel } from './StatsPanel';
import { RunMenu } from './RunMenu';
import { ChartConfigPanel } from './ChartConfigPanel';
import { useNodeHover, useZoomTransition, StatusDot, ShapeBadge, ColumnChips, ZoomControls, PortBadge, NodeHandles } from './nodeZoomHelpers';
import { CompactResultBar, DataPreviewModal } from './DataPreviewModal';
import './analysisNodes.css';

const COLORS = ['#4263eb', '#2f9e44', '#e67700', '#c2255c', '#0b7285'];

type OutputData = {
  id?: string;
  output_mode?: 'table' | 'bar' | 'line' | 'scatter' | 'stats';
  name?: string;
  description?: string;
  chart_config?: ChartConfig;
  pipelineId?: string;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
  onRunScope?: (scope: RunScope) => void;
  onSnapshotMock?: () => void;
  onClearMock?: () => void;
  onDuplicate?: () => void;
  onAutoDescribe?: () => void;
  isAiDescribing?: boolean;
  isMockPreview?: boolean;
  result?: NodeResultResponse;
  selected?: boolean;
  zoomLevel?: ZoomLevel;
  portLabel?: string;
};

type ColumnInfo = { key: string; label: string; type: string };

function statusClass(result?: NodeResultResponse): string {
  if (!result) return 'node-card--none';
  return result.ok ? 'node-card--ok' : 'node-card--error';
}

function aggregate(
  rows: Record<string, unknown>[],
  xCol: string,
  yCols: string[],
  agg: ChartConfig['aggregation'],
): Record<string, unknown>[] {
  if (!agg || agg === 'none') return rows;
  const groups = new Map<string, Record<string, unknown>[]>();
  for (const row of rows) {
    const key = String(row[xCol] ?? '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  const result: Record<string, unknown>[] = [];
  for (const [key, group] of groups) {
    const entry: Record<string, unknown> = { [xCol]: key };
    for (const yc of yCols) {
      const vals = group.map((r) => Number(r[yc])).filter((v) => !isNaN(v));
      if (agg === 'sum') entry[yc] = vals.reduce((a, b) => a + b, 0);
      else if (agg === 'mean') entry[yc] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      else if (agg === 'count') entry[yc] = vals.length;
      else if (agg === 'min') entry[yc] = vals.length ? Math.min(...vals) : 0;
      else if (agg === 'max') entry[yc] = vals.length ? Math.max(...vals) : 0;
    }
    result.push(entry);
  }
  return result;
}

function GenericValueDisplay({ preview, kind, genericValue }: { preview: NonNullable<NodeResultResponse['preview']>; kind: string; genericValue?: unknown }) {
  if (kind === 'scalar') {
    return (
      <Box p={12} style={{ textAlign: 'center' }}>
        <Text size="xl" fw={700} style={{ fontFamily: 'monospace' }}>{preview.display ?? String(genericValue)}</Text>
        <Text size="xs" c="dimmed" mt={4}>Scalar value</Text>
      </Box>
    );
  }
  if (kind === 'text') {
    return (
      <ScrollArea style={{ flex: 1, maxHeight: 300 }} px={12} py={8}>
        <Text size="xs" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
          {preview.display ?? String(genericValue)}
        </Text>
        {preview.length != null && (
          <Text size="xs" c="dimmed" mt={4}>{preview.length} characters</Text>
        )}
      </ScrollArea>
    );
  }
  if (kind === 'dict') {
    const sample = preview.sample as Record<string, unknown> | undefined;
    return (
      <ScrollArea style={{ flex: 1, maxHeight: 300 }} px={12} py={8}>
        <Text size="xs" c="dimmed" mb={4}>Dict ({preview.total_keys ?? '?'} keys)</Text>
        <pre style={{ fontSize: 11, fontFamily: 'monospace', margin: 0, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(sample ?? genericValue, null, 2)}
        </pre>
      </ScrollArea>
    );
  }
  if (kind === 'list') {
    const sample = preview.sample as unknown[] | undefined;
    return (
      <ScrollArea style={{ flex: 1, maxHeight: 300 }} px={12} py={8}>
        <Text size="xs" c="dimmed" mb={4}>List ({preview.length ?? '?'} items)</Text>
        <pre style={{ fontSize: 11, fontFamily: 'monospace', margin: 0, whiteSpace: 'pre-wrap' }}>
          {JSON.stringify(sample ?? genericValue, null, 2)}
        </pre>
      </ScrollArea>
    );
  }
  return <Text size="xs" c="dimmed" p={12}>Unknown value kind: {kind}</Text>;
}

export function OutputNode({ data }: NodeProps<OutputData>) {
  const result = data.result;
  const preview = result?.ok ? result.preview : null;
  const valueKind = result?.value_kind ?? 'dataframe';
  const mode = data.output_mode ?? 'table';
  const zoomLevel = data.zoomLevel ?? 'full';
  const zoomClass = useZoomTransition(zoomLevel);
  const hover = useNodeHover();
  const chartConfig = data.chart_config ?? {};
  const [dataModalOpen, setDataModalOpen] = useState(false);

  const columns: ColumnInfo[] = preview?.columns
    ? preview.columns.map((c) =>
        typeof c === 'string'
          ? { key: c, label: c, type: 'string' }
          : { key: c.key, label: c.label, type: c.type ?? 'string' },
      )
    : [];

  const rawChartData = preview?.rows
    ? preview.rows.map((row) => {
        const entry: Record<string, unknown> = {};
        columns.forEach((col, i) => { entry[col.key] = row[i]; });
        return entry;
      })
    : [];

  const xCol = chartConfig.xColumn ?? (columns[0]?.key ?? '');
  const numericCols = columns.filter((c) => c.type === 'number').map((c) => c.key);
  const yCols = chartConfig.yColumns?.length ? chartConfig.yColumns : numericCols.slice(0, 5);
  const chartData = aggregate(rawChartData, xCol, yCols, chartConfig.aggregation);

  // ── Mini view ──
  if (zoomLevel === 'mini') {
    return (
      <div ref={hover.ref} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <PortBadge label={data.portLabel} />
        <NodeResizer minWidth={120} minHeight={60} isVisible={data.selected} />
        <NodeHandles hasOutput={false} />
            <ZoomControls zoomLevel={zoomLevel} onRunScope={data.onRunScope} onDelete={data.onDelete} />
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconTableFilled size={28} color="#e67700" />
            <Text fw={700} c="orange.8" style={{ fontSize: 24 }} lineClamp={1}>{data.name || 'Output'}</Text>
          </Box>
          <StatusDot result={result} />
          {result?.shape && <Text size="sm" c="dimmed" fw={500}>{result.shape[0]?.toLocaleString()} x {result.shape[1]}</Text>}
        </Box>
      </div>
    );
  }

  // ── Summary view ──
  if (zoomLevel === 'summary') {
    const modeLabel = mode === 'table' ? 'Table' : mode === 'bar' ? 'Bar chart' : mode === 'line' ? 'Line chart' : mode === 'scatter' ? 'Scatter' : 'Stats';
    return (
      <div ref={hover.ref} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <PortBadge label={data.portLabel} />
        <NodeResizer minWidth={200} minHeight={120} isVisible={data.selected} />
        <NodeHandles hasOutput={false} />
            <ZoomControls zoomLevel={zoomLevel} onRunScope={data.onRunScope} onAutoDescribe={data.onAutoDescribe} isAiDescribing={data.isAiDescribing} onDuplicate={data.onDuplicate} onDelete={data.onDelete} />
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
            <IconTableFilled size={22} color="#e67700" />
            <Text fw={700} c="orange.8" style={{ fontSize: 22, flex: 1 }} lineClamp={1}>{data.name || 'Output'}</Text>
            <StatusDot result={result} />
          </Box>
          {data.description && (
            <Text c="dimmed" px={14} pt={8} lineClamp={2} style={{ fontSize: 16 }}>{data.description}</Text>
          )}
          <Box px={14} pt={8}>
            <Badge size="lg" variant="light" color="orange">{modeLabel}</Badge>
          </Box>
          <Box style={{ flex: 1 }} />
          <Box px={14} pb={10} style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
            <ShapeBadge result={result} isMock={data.isMockPreview} />
            <ColumnChips result={result} />
          </Box>
        </Box>
      </div>
    );
  }

  // ── Full view ──
  return (
    <div ref={hover.ref} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
    <PortBadge label={data.portLabel} />
    <NodeHandles hasOutput={false} />
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

      <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid #f0f0f0', overflow: 'hidden' }}>
        <IconTableFilled size={14} color="#e67700" style={{ flexShrink: 0 }} />
        <TextInput
          size="xs"
          variant="unstyled"
          value={data.name ?? ''}
          placeholder="Output"
          onChange={(e) => data.onUpdate({ name: e.currentTarget.value })}
          styles={{
            input: { fontWeight: 600, fontSize: 12, color: 'var(--mantine-color-orange-8)', padding: 0, height: 20, minHeight: 20 },
            root: { flex: 1, minWidth: 0, overflow: 'hidden' },
          }}
        />
        <div className="node-controls" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          {data.isMockPreview && <Badge size="xs" variant="light" color="grape">Preview</Badge>}
          {data.onRunScope && <RunMenu onRunScope={data.onRunScope} />}
          {result?.ok && data.onSnapshotMock && (
            <MantineTooltip label="Snapshot as mock data">
              <ActionIcon size="xs" variant="subtle" color="grape" onClick={data.onSnapshotMock}>
                <IconCamera size={12} />
              </ActionIcon>
            </MantineTooltip>
          )}
          {data.onClearMock && (
            <MantineTooltip label="Clear mock data">
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={data.onClearMock}>
                <IconX size={12} />
              </ActionIcon>
            </MantineTooltip>
          )}
          {result && (
            <Box style={{ width: 8, height: 8, borderRadius: '50%', background: result.ok ? '#2f9e44' : '#e03131' }} />
          )}
          {data.onAutoDescribe && (
            <MantineTooltip label="AI suggest name & description">
              <ActionIcon size="xs" variant="subtle" color="violet" onClick={data.onAutoDescribe} loading={data.isAiDescribing}>
                <IconSparkles size={12} />
              </ActionIcon>
            </MantineTooltip>
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
              { value: 'scatter', label: 'Scatter' },
              { value: 'stats', label: 'Stats' },
            ]}
          />
        </Box>

        {(mode === 'bar' || mode === 'line' || mode === 'scatter') && preview && (
          <ChartConfigPanel
            config={chartConfig}
            columns={columns}
            onChange={(cfg) => data.onUpdate({ chart_config: cfg })}
          />
        )}

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

      {/* Generic value rendering for non-DataFrame kinds */}
      {preview && valueKind !== 'dataframe' && (
        <GenericValueDisplay preview={preview} kind={valueKind} genericValue={result?.generic_value} />
      )}

      {preview && valueKind === 'dataframe' && mode === 'stats' && preview.stats && (
        <StatsPanel stats={preview.stats} shape={result?.shape} />
      )}

      {preview && valueKind === 'dataframe' && mode === 'table' && preview.columns && preview.rows && (
        <>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 12px' }}>
            <Text size="xs" c="dimmed" style={{ flex: 1 }}>{result?.shape?.[0]} rows x {result?.shape?.[1]} cols</Text>
            <MantineTooltip label="Expand table">
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setDataModalOpen(true)}>
                <IconMaximize size={12} />
              </ActionIcon>
            </MantineTooltip>
          </Box>
          <ScrollArea style={{ flex: 1, maxHeight: 300 }} px={4}>
            <Table striped highlightOnHover style={{ fontSize: 11 }}>
              <Table.Thead>
                <Table.Tr>
                  {preview.columns.map((col) => (
                    <Table.Th key={typeof col === 'string' ? col : col.key} style={{ padding: '2px 8px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {typeof col === 'string' ? col : col.label}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {(preview.rows ?? []).slice(0, 50).map((row, i) => (
                  <Table.Tr key={i}>
                    {(row as unknown[]).map((cell, j) => (
                      <Table.Td key={j} style={{ padding: '2px 8px', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={cell != null ? String(cell) : ''}>
                        {cell != null ? String(cell) : ''}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>
        </>
      )}

      {preview && valueKind === 'dataframe' && mode === 'bar' && (
        <Box style={{ height: 200, padding: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey={xCol} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <RechartsTooltip />
              {yCols.map((col, i) => (
                <Bar key={col} dataKey={col} fill={COLORS[i % COLORS.length]} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </Box>
      )}

      {preview && valueKind === 'dataframe' && mode === 'line' && (
        <Box style={{ height: 200, padding: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#f0f0f0" vertical={false} />
              <XAxis dataKey={xCol} tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <RechartsTooltip />
              {yCols.map((col, i) => (
                <Line key={col} type="monotone" dataKey={col} stroke={COLORS[i % COLORS.length]} dot={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </Box>
      )}

      {preview && valueKind === 'dataframe' && mode === 'scatter' && (
        <Box style={{ height: 200, padding: 8 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid stroke="#f0f0f0" />
              <XAxis dataKey={xCol} name={xCol} tick={{ fontSize: 10 }} />
              <YAxis dataKey={yCols[0] ?? ''} name={yCols[0] ?? ''} tick={{ fontSize: 10 }} />
              <RechartsTooltip />
              <Scatter data={chartData} fill={COLORS[0]} />
            </ScatterChart>
          </ResponsiveContainer>
        </Box>
      )}
    </Box>

    {/* Data preview modal */}
    {result?.ok && (
      <DataPreviewModal
        opened={dataModalOpen}
        onClose={() => setDataModalOpen(false)}
        result={result}
        pipelineId={data.pipelineId}
        nodeId={data.id}
        title={data.name || 'Output Data'}
      />
    )}
    </div>
  );
}
