import { useCallback, useState } from 'react';
import { Handle, Position, type NodeProps, NodeResizer } from 'reactflow';
import { ActionIcon, Box, Select, Text, Table, ScrollArea, Tooltip } from '@mantine/core';
import { IconSparkles, IconSql, IconTrash } from '@tabler/icons-react';
import Editor from '@monaco-editor/react';
import type { NodeResultResponse } from '../../../lib/api';
import type { RunScope, ZoomLevel } from '../AnalysisPage';
import { StatsPanel } from './StatsPanel';
import { RunMenu } from './RunMenu';
import './analysisNodes.css';

type ViewMode = 'all' | 'sql' | 'result' | 'stats';

type InputVar = { varName: string; label: string; columns?: string[] };

type SqlData = {
  sql?: string;
  name?: string;
  description?: string;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
  onRunScope?: (scope: RunScope) => void;
  onAutoDescribe?: () => void;
  result?: NodeResultResponse;
  selected?: boolean;
  inputVars?: InputVar[];
  zoomLevel?: ZoomLevel;
};

function statusClass(result?: NodeResultResponse): string {
  if (!result) return 'node-card--none';
  return result.ok ? 'node-card--ok' : 'node-card--error';
}

export function SqlNode({ data }: NodeProps<SqlData>) {
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const zoomLevel = data.zoomLevel ?? 'full';

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
      <div className="analysis-node analysis-node--mini">
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden' }}>
          <div className="node-zoom-mini node-zoom-content">
            <IconSql size={14} color="#1971c2" />
            <Text size="xs" fw={600} c="blue.8" truncate>{data.name || 'SQL'}</Text>
          </div>
          <Handle type="target" position={Position.Left} />
          <Handle type="source" position={Position.Right} />
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
              <IconSql size={14} color="#1971c2" />
              <Text size="xs" fw={600} c="blue.8" truncate>{data.name || 'SQL'}</Text>
            </Box>
            {data.sql && (
              <Text size="xs" c="dimmed" mt={4} lineClamp={3} style={{ fontFamily: 'monospace' }}>{data.sql.slice(0, 120)}</Text>
            )}
          </div>
          <Handle type="target" position={Position.Left} />
          <Handle type="source" position={Position.Right} />
        </Box>
      </div>
    );
  }

  // ── Full view ──
  return (
    <div className="analysis-node" style={{ width: '100%', height: '100%' }}>
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
                <ActionIcon size="xs" variant="subtle" color="violet" onClick={data.onAutoDescribe}>
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

        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />

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

        {/* Result table */}
        {showResult && preview && (
          <Box style={{ borderTop: '1px solid #f0f0f0', flex: viewMode === 'result' ? 1 : undefined, maxHeight: viewMode === 'result' ? undefined : 180, display: 'flex', flexDirection: 'column' }}>
            <Text size="xs" c="dimmed" px={12} py={2}>{result?.shape?.[0]} rows x {result?.shape?.[1]} cols</Text>
            <ScrollArea style={{ flex: 1 }}>
              <Table striped highlightOnHover style={{ fontSize: 11 }}>
                <Table.Thead>
                  <Table.Tr>
                    {(preview.columns ?? []).map((col) => (
                      <Table.Th key={typeof col === 'string' ? col : col.key} style={{ padding: '2px 8px' }}>
                        {typeof col === 'string' ? col : col.label}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {(preview.rows ?? []).slice(0, 20).map((row, i) => (
                    <Table.Tr key={i}>
                      {(row as unknown[]).map((cell, j) => (
                        <Table.Td key={j} style={{ padding: '2px 8px' }}>{cell != null ? String(cell) : ''}</Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Box>
        )}
        {showResult && !result && (
          <Box style={{ padding: '12px', borderTop: viewMode === 'result' ? '1px solid #f0f0f0' : undefined, flex: viewMode === 'result' ? 1 : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text size="xs" c="dimmed">Run pipeline to see results</Text>
          </Box>
        )}
      </Box>
    </div>
  );
}
