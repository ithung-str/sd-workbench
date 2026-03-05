import { Handle, Position, NodeResizer, type NodeProps } from 'reactflow';
import { ActionIcon, Badge, Box, SegmentedControl, Text, TextInput, Tooltip } from '@mantine/core';
import { IconDatabase, IconTrash } from '@tabler/icons-react';
import type { NodeResultResponse } from '../../../lib/api';
import type { RunScope, ZoomLevel } from '../AnalysisPage';
import { RunMenu } from './RunMenu';
import './analysisNodes.css';

type PublishData = {
  name?: string;
  publish_table_id?: string;
  publish_mode?: 'overwrite' | 'append';
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

export function PublishNode({ data }: NodeProps<PublishData>) {
  const result = data.result;
  const zoomLevel = data.zoomLevel ?? 'full';
  const mode = data.publish_mode ?? 'overwrite';

  if (zoomLevel === 'mini') {
    return (
      <div className="analysis-node analysis-node--mini">
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden' }}>
          <div className="node-zoom-mini node-zoom-content">
            <IconDatabase size={14} color="#1971c2" />
            <Text size="xs" fw={600} c="blue.8" truncate>{data.name || 'Publish'}</Text>
          </div>
          <Handle type="target" position={Position.Left} />
        </Box>
      </div>
    );
  }

  if (zoomLevel === 'summary') {
    return (
      <div className="analysis-node analysis-node--summary">
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden', minWidth: 180 }}>
          <div className="node-zoom-summary node-zoom-content">
            <Box style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconDatabase size={14} color="#1971c2" />
              <Text size="xs" fw={600} c="blue.8" truncate>{data.name || 'Publish'}</Text>
            </Box>
            {result?.ok && result.logs && (
              <Text size="xs" c="dimmed" mt={4} lineClamp={2}>{result.logs}</Text>
            )}
          </div>
          <Handle type="target" position={Position.Left} />
        </Box>
      </div>
    );
  }

  return (
    <div className="analysis-node" style={{ width: '100%', height: '100%' }}>
      <NodeResizer minWidth={260} minHeight={160} isVisible={data.selected} />
      <Box
        className={`node-card ${statusClass(result)}`}
        style={{
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: 8,
          minWidth: 280,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Handle type="target" position={Position.Left} />

        <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <IconDatabase size={14} color="#1971c2" />
          <TextInput
            size="xs"
            variant="unstyled"
            value={data.name ?? ''}
            placeholder="Data Asset Name"
            onChange={(e) => data.onUpdate({ name: e.currentTarget.value })}
            styles={{
              input: { fontWeight: 600, fontSize: 12, color: '#1971c2', padding: 0, height: 20, minHeight: 20, width: Math.max(40, (data.name?.length ?? 14) * 8 + 12) },
            }}
          />
          <div className="node-controls" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            {data.onRunScope && <RunMenu onRunScope={data.onRunScope} />}
            {result && (
              <Box style={{ width: 8, height: 8, borderRadius: '50%', background: result.ok ? '#2f9e44' : '#e03131' }} />
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
          <Box px={12} py={8} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Box>
              <Text size="xs" fw={500} mb={2}>Write mode</Text>
              <SegmentedControl
                size="xs"
                value={mode}
                onChange={(v) => data.onUpdate({ publish_mode: v })}
                data={[
                  { value: 'overwrite', label: 'Overwrite' },
                  { value: 'append', label: 'Append' },
                ]}
              />
            </Box>

            {data.publish_table_id && (
              <Box>
                <Text size="xs" c="dimmed">Published ID</Text>
                <Badge size="xs" variant="light" color="blue" style={{ fontFamily: 'monospace' }}>
                  {data.publish_table_id}
                </Badge>
              </Box>
            )}
          </Box>
        </div>

        {!result && (
          <Box px={12} pb={8}>
            <Text size="xs" c="dimmed">
              Run pipeline to publish data to the catalog.
              The asset will be available in Data, Dashboards, and SD model lookups.
            </Text>
          </Box>
        )}

        {result && !result.ok && (
          <Box style={{ padding: '6px 12px' }}>
            <Text size="xs" c="red" style={{ fontFamily: 'monospace' }}>{result.error}</Text>
          </Box>
        )}

        {result?.ok && (
          <Box px={12} pb={8}>
            {result.shape && (
              <Text size="xs" c="dimmed" mb={4}>
                {result.shape[0]} rows × {result.shape[1]} columns
              </Text>
            )}
            {result.logs && (
              <Badge size="sm" variant="light" color="green">
                {result.logs}
              </Badge>
            )}
          </Box>
        )}
      </Box>
    </div>
  );
}
