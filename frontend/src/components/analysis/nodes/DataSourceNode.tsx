import { useEffect, useMemo, useState } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from 'reactflow';
import { ActionIcon, Box, Button, SegmentedControl, Select, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { IconDatabase, IconSparkles, IconTrash } from '@tabler/icons-react';
import { listDataTables } from '../../../lib/dataTableStorage';
import type { DataTableMeta } from '../../../types/dataTable';
import type { NodeResultResponse } from '../../../lib/api';
import type { RunScope, ZoomLevel } from '../AnalysisPage';
import { StatsPanel } from './StatsPanel';
import { RunMenu } from './RunMenu';
import { useZoomTransition, StatusDot, ShapeBadge, ColumnChips, ZoomControls } from './nodeZoomHelpers';
import './analysisNodes.css';

type ViewMode = 'info' | 'stats';

type DataSourceData = {
  data_table_id?: string;
  name?: string;
  description?: string;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
  onRunScope?: (scope: RunScope) => void;
  onGenerateMock?: () => void;
  onDuplicate?: () => void;
  onAutoDescribe?: () => void;
  isAiDescribing?: boolean;
  result?: NodeResultResponse;
  isMockPreview?: boolean;
  selected?: boolean;
  zoomLevel?: ZoomLevel;
};

function statusClass(result?: NodeResultResponse): string {
  if (!result) return 'node-card--none';
  return result.ok ? 'node-card--ok' : 'node-card--error';
}

export function DataSourceNode({ data }: NodeProps<DataSourceData>) {
  const [tables, setTables] = useState<DataTableMeta[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('info');
  const zoomLevel = data.zoomLevel ?? 'full';
  const zoomClass = useZoomTransition(zoomLevel);

  useEffect(() => {
    listDataTables().then(setTables).catch(() => setTables([]));
  }, []);

  const options = useMemo(
    () => tables.map((t) => ({ value: t.id, label: `${t.name} (${t.rowCount} rows)` })),
    [tables],
  );

  const selected = tables.find((t) => t.id === data.data_table_id);
  const result = data.result;
  const preview = result?.ok ? result.preview : undefined;

  // ── Mini view ──
  if (zoomLevel === 'mini') {
    return (
      <div className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <Handle type="source" position={Position.Right} />
        <ZoomControls zoomLevel={zoomLevel} onRunScope={data.onRunScope} onDelete={data.onDelete} />
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconDatabase size={28} color="#0b7285" />
            <Text fw={700} c="cyan.8" style={{ fontSize: 24 }} lineClamp={1}>{data.name || 'Data Source'}</Text>
          </Box>
          <StatusDot result={result} />
          {result?.shape && <Text size="sm" c="dimmed" fw={500}>{result.shape[0]?.toLocaleString()} x {result.shape[1]}</Text>}
        </Box>
      </div>
    );
  }

  // ── Summary view ──
  if (zoomLevel === 'summary') {
    return (
      <div className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <Handle type="source" position={Position.Right} />
        <ZoomControls zoomLevel={zoomLevel} onRunScope={data.onRunScope} onAutoDescribe={data.onAutoDescribe} isAiDescribing={data.isAiDescribing} onDuplicate={data.onDuplicate} onDelete={data.onDelete} />
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
            <IconDatabase size={22} color="#0b7285" />
            <Text fw={700} c="cyan.8" style={{ fontSize: 22, flex: 1 }} lineClamp={1}>{data.name || 'Data Source'}</Text>
            <StatusDot result={result} />
          </Box>
          {data.description && (
            <Text c="dimmed" px={14} pt={8} lineClamp={2} style={{ fontSize: 16 }}>{data.description}</Text>
          )}
          {selected && (
            <Text c="dimmed" px={14} pt={4} style={{ fontSize: 14 }}>{selected.columns.length} columns</Text>
          )}
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
    <div className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
    <NodeResizer minWidth={200} minHeight={100} isVisible={data.selected} />
    <Box
      className={`node-card ${statusClass(result)}`}
      style={{
        background: '#fff',
        border: '1px solid #dee2e6',
        borderRadius: 8,
        minWidth: 220,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', overflow: 'hidden' }}>
        <IconDatabase size={14} color="#0b7285" style={{ flexShrink: 0 }} />
        <TextInput
          size="xs"
          variant="unstyled"
          value={data.name ?? ''}
          placeholder="Data Source"
          onChange={(e) => data.onUpdate({ name: e.currentTarget.value })}
          styles={{
            input: { fontWeight: 600, fontSize: 12, color: 'var(--mantine-color-cyan-8)', padding: 0, height: 20, minHeight: 20 },
            root: { flex: 1, minWidth: 0, overflow: 'hidden' },
          }}
        />
        <div className="node-controls" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
          {preview?.stats && (
            <SegmentedControl
              size="xs"
              value={viewMode}
              onChange={(v) => setViewMode(v as ViewMode)}
              data={[
                { value: 'info', label: 'Info' },
                { value: 'stats', label: 'Stats' },
              ]}
              styles={{
                root: { background: '#f1f3f5' },
                label: { padding: '2px 8px', fontSize: 10 },
              }}
            />
          )}
          {data.onRunScope && <RunMenu onRunScope={data.onRunScope} />}
          {result && (
            <Box style={{ width: 8, height: 8, borderRadius: '50%', background: result.ok ? '#2f9e44' : '#e03131' }} />
          )}
          {data.onAutoDescribe && (
            <Tooltip label="AI suggest name & description">
              <ActionIcon size="xs" variant="subtle" color="violet" onClick={data.onAutoDescribe} loading={data.isAiDescribing}>
                <IconSparkles size={12} />
              </ActionIcon>
            </Tooltip>
          )}
          {data.onDelete && (
            <Tooltip label="Delete node">
              <ActionIcon size="xs" variant="subtle" color="red" onClick={data.onDelete}>
                <IconTrash size={12} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
      </Box>

      <div className="node-zoom-content">
        {viewMode === 'info' && (
          <Box px={12} pb={8}>
            <Select
              size="xs"
              value={data.data_table_id ?? null}
              onChange={(value) => data.onUpdate({ data_table_id: value ?? '' })}
              data={options}
              placeholder="Select table"
            />
            {selected && (
              <Text size="xs" c="dimmed" mt={4}>{selected.columns.length} columns</Text>
            )}
          </Box>
        )}

        {viewMode === 'stats' && preview?.stats && (
          <StatsPanel stats={preview.stats} shape={result?.shape} />
        )}

        <Box px={12} pb={8}>
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

        {data.data_table_id && !result && data.onGenerateMock && (
          <Box px={12} pb={8}>
            <Button
              size="compact-xs"
              variant="light"
              color="violet"
              leftSection={<IconSparkles size={12} />}
              onClick={data.onGenerateMock}
            >
              Generate mock data
            </Button>
          </Box>
        )}

        {data.isMockPreview && (
          <Box px={12} pb={4}>
            <Text size="xs" c="violet" fs="italic">Mock preview</Text>
          </Box>
        )}
      </div>

      <Handle type="source" position={Position.Right} />
    </Box>
    </div>
  );
}
