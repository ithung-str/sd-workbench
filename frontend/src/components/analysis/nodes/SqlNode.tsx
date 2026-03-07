import { useCallback, useState } from 'react';
import { type NodeProps, NodeResizer } from 'reactflow';
import { ActionIcon, Box, Select, Text, Tooltip } from '@mantine/core';
import { IconSparkles, IconSql, IconTrash } from '@tabler/icons-react';
import Editor from '@monaco-editor/react';
import type { NodeResultResponse } from '../../../lib/api';
import type { RunScope, ZoomLevel } from '../AnalysisPage';
import { StatsPanel } from './StatsPanel';
import { RunMenu } from './RunMenu';
import { useNodeHover, useZoomTransition, StatusDot, ShapeBadge, ColumnChips, ZoomControls, PortBadge, NodeHandles } from './nodeZoomHelpers';
import { CompactResultBar, DataPreviewModal } from './DataPreviewModal';
import './analysisNodes.css';

type ViewMode = 'all' | 'sql' | 'result' | 'stats';

type InputVar = { varName: string; label: string; columns?: string[] };

type SqlData = {
  id?: string;
  pipelineId?: string;
  sql?: string;
  name?: string;
  description?: string;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
  onRunScope?: (scope: RunScope) => void;
  onDuplicate?: () => void;
  onAutoDescribe?: () => void;
  isAiDescribing?: boolean;
  result?: NodeResultResponse;
  selected?: boolean;
  inputVars?: InputVar[];
  zoomLevel?: ZoomLevel;
  portLabel?: string;
};

function statusClass(result?: NodeResultResponse): string {
  if (!result) return 'node-card--none';
  return result.ok ? 'node-card--ok' : 'node-card--error';
}

export function SqlNode({ data }: NodeProps<SqlData>) {
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [dataModalOpen, setDataModalOpen] = useState(false);
  const zoomLevel = data.zoomLevel ?? 'full';
  const zoomClass = useZoomTransition(zoomLevel);
  const hover = useNodeHover();

  const handleSqlChange = useCallback(
    (value: string | undefined) => {
      data.onUpdate({ sql: value ?? '' });
    },
    [data],
  );

  const result = data.result;
  const preview = result?.ok ? result.preview : null;
  const showSql = viewMode === 'all' || viewMode === 'sql';
  const showResult = viewMode === 'all' || viewMode === 'result';
  const showStats = viewMode === 'stats';

  // Build helper text showing available table names
  const tableHint = (data.inputVars ?? [])
    .map((iv) => `${iv.varName}${iv.columns ? ` (${iv.columns.length} cols)` : ''}`)
    .join(', ');

  // ── Mini view ──
  if (zoomLevel === 'mini') {
    return (
      <div ref={hover.ref} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <PortBadge label={data.portLabel} />
        <NodeResizer minWidth={120} minHeight={60} isVisible={data.selected} />
        <NodeHandles />
        <ZoomControls zoomLevel={zoomLevel} onRunScope={data.onRunScope} onDelete={data.onDelete} />
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconSql size={28} color="#1971c2" />
            <Text fw={700} c="blue.8" style={{ fontSize: 24 }} lineClamp={1}>{data.name || 'SQL'}</Text>
          </Box>
          <StatusDot result={result} />
          {result?.shape && <Text size="sm" c="dimmed" fw={500}>{result.shape[0]?.toLocaleString()} x {result.shape[1]}</Text>}
        </Box>
      </div>
    );
  }

  // ── Summary view ──
  if (zoomLevel === 'summary') {
    const sqlPreview = (data.sql ?? '').split('\n').filter(l => l.trim() && !l.trim().startsWith('--')).slice(0, 5).join('\n');
    return (
      <div ref={hover.ref} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <PortBadge label={data.portLabel} />
        <NodeResizer minWidth={200} minHeight={120} isVisible={data.selected} />
        <NodeHandles />
        <ZoomControls zoomLevel={zoomLevel} onRunScope={data.onRunScope} onAutoDescribe={data.onAutoDescribe} isAiDescribing={data.isAiDescribing} onDuplicate={data.onDuplicate} onDelete={data.onDelete} />
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
            <IconSql size={22} color="#1971c2" />
            <Text fw={700} c="blue.8" style={{ fontSize: 22, flex: 1 }} lineClamp={1}>{data.name || 'SQL'}</Text>
            <StatusDot result={result} />
          </Box>
          {data.description && (
            <Text c="dimmed" px={14} pt={8} lineClamp={2} style={{ fontSize: 16 }}>{data.description}</Text>
          )}
          {sqlPreview && (
            <Box px={14} py={8} style={{ flex: 1, overflow: 'hidden' }}>
              <Text c="gray.6" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: 14 }} lineClamp={5}>{sqlPreview}</Text>
            </Box>
          )}
          <Box px={14} pb={10} style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
            <ShapeBadge result={result} />
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
      <NodeResizer minWidth={320} minHeight={250} isVisible={data.selected} />
      <Box
        className={`node-card ${statusClass(result)}`}
        style={{
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: 8,
          overflow: 'hidden',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid #f0f0f0' }}>
          <IconSql size={14} color="#1971c2" />
          <input
            type="text"
            value={data.name ?? ''}
            placeholder="SQL"
            onChange={(e) => data.onUpdate({ name: e.target.value })}
            style={{
              border: 'none', background: 'transparent', fontWeight: 600, fontSize: 12,
              color: '#1971c2', outline: 'none', flex: 1, padding: 0, minWidth: 0,
            }}
          />

          <div className="node-controls" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <Select
              size="xs"
              value={viewMode}
              onChange={(v) => v && setViewMode(v as ViewMode)}
              data={[
                { value: 'all', label: 'All' },
                { value: 'sql', label: 'SQL' },
                { value: 'result', label: 'Result' },
                { value: 'stats', label: 'Stats' },
              ]}
              allowDeselect={false}
              withCheckIcon={false}
              styles={{
                input: { fontSize: 11, height: 24, minHeight: 24, paddingLeft: 8, paddingRight: 20, width: 85 },
              }}
            />
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

        {/* Table hint */}
        {tableHint && (
          <Box px={10} py={2} style={{ borderBottom: '1px solid #f0f0f0', background: '#f8f9fa' }}>
            <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', fontSize: 10 }}>
              Tables: {tableHint}
            </Text>
          </Box>
        )}

        <NodeHandles />

        {/* Stats view */}
        {showStats && preview?.stats && (
          <StatsPanel stats={preview.stats} shape={result?.shape} />
        )}
        {showStats && !preview?.stats && (
          <Box style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text size="xs" c="dimmed">Run pipeline to see stats</Text>
          </Box>
        )}

        {/* SQL editor */}
        {showSql && (
          <Box style={{ flex: 1, minHeight: 100 }}>
            <Editor
              height="100%"
              language="sql"
              theme="vs-light"
              value={data.sql ?? '-- Input tables: df_in (single parent) or df_in1, df_in2, ...\n\nSELECT * FROM df_in\n'}
              onChange={handleSqlChange}
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: 'off',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                padding: { top: 8 },
                overviewRulerLanes: 0,
              }}
            />
          </Box>
        )}

        {/* Error display */}
        {showResult && result && !result.ok && (
          <Box style={{ padding: '6px 12px', background: '#fff5f5', borderTop: '1px solid #ffc9c9', maxHeight: 120, overflow: 'auto' }}>
            <Text size="xs" c="red" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{result.error}</Text>
          </Box>
        )}

        {/* Result preview bar */}
        {showResult && result?.ok && (
          <CompactResultBar result={result} onExpand={() => setDataModalOpen(true)} />
        )}
        {showResult && !result && (
          <Box style={{ padding: '12px', borderTop: viewMode === 'result' ? '1px solid #f0f0f0' : undefined, flex: viewMode === 'result' ? 1 : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text size="xs" c="dimmed">Run pipeline to see results</Text>
          </Box>
        )}

        {/* Data preview modal */}
        {result?.ok && (
          <DataPreviewModal
            opened={dataModalOpen}
            onClose={() => setDataModalOpen(false)}
            result={result}
            pipelineId={data.pipelineId}
            nodeId={data.id}
            title={data.name || 'SQL Result'}
          />
        )}
      </Box>
    </div>
  );
}
