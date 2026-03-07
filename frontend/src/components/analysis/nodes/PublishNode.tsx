import { useCallback } from 'react';
import { NodeResizer, type NodeProps } from 'reactflow';
import { ActionIcon, Badge, Box, SegmentedControl, Text, TextInput, Tooltip } from '@mantine/core';
import { IconDatabase, IconTrash } from '@tabler/icons-react';
import type { NodeResultResponse } from '../../../lib/api';
import type { RunScope, ZoomLevel } from '../AnalysisPage';
import { RunMenu } from './RunMenu';
import { useNodeHover, useZoomTransition, useNodeFocus, StatusDot, ShapeBadge, ZoomControls, PortBadge, NodeHandles } from './nodeZoomHelpers';
import './analysisNodes.css';

type PublishData = {
  name?: string;
  publish_table_id?: string;
  publish_mode?: 'overwrite' | 'append';
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onRunScope?: (scope: RunScope) => void;
  onDeselect?: () => void;
  onAddNode?: (type: import('../../../types/model').AnalysisNodeType) => void;
  onEditorFocusChange?: (editing: boolean) => void;
  result?: NodeResultResponse;
  selected?: boolean;
  zoomLevel?: ZoomLevel;
  portLabel?: string;
};

function statusClass(result?: NodeResultResponse): string {
  if (!result) return 'node-card--none';
  return result.ok ? 'node-card--ok' : 'node-card--error';
}

export function PublishNode({ data }: NodeProps<PublishData>) {
  const result = data.result;
  const zoomLevel = data.zoomLevel ?? 'full';
  const zoomClass = useZoomTransition(zoomLevel);
  const hover = useNodeHover();
  const focus = useNodeFocus({
    selected: data.selected,
    onDelete: data.onDelete,
    onDeselect: data.onDeselect,
    onAddNode: data.onAddNode,
  });
  const mergedRef = useCallback((el: HTMLDivElement | null) => {
    (hover.ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
    focus.wrapperRef.current = el;
  }, [hover.ref, focus.wrapperRef]);
  const mode = data.publish_mode ?? 'overwrite';

  if (zoomLevel === 'mini') {
    return (
      <div ref={hover.ref} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <PortBadge label={data.portLabel} />
        <NodeResizer minWidth={120} minHeight={60} isVisible={data.selected} />
        <NodeHandles />
          <ZoomControls zoomLevel={zoomLevel} onRunScope={data.onRunScope} onDelete={data.onDelete} />
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconDatabase size={28} color="#1971c2" />
            <Text fw={700} c="blue.8" style={{ fontSize: 24 }} lineClamp={1}>{data.name || 'Publish'}</Text>
          </Box>
          <StatusDot result={result} />
          {result?.shape && <Text size="sm" c="dimmed" fw={500}>{result.shape[0]?.toLocaleString()} x {result.shape[1]}</Text>}
        </Box>
      </div>
    );
  }

  if (zoomLevel === 'summary') {
    return (
      <div ref={hover.ref} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <PortBadge label={data.portLabel} />
        <NodeResizer minWidth={180} minHeight={100} isVisible={data.selected} />
        <NodeHandles />
          <ZoomControls zoomLevel={zoomLevel} onRunScope={data.onRunScope} onDuplicate={data.onDuplicate} onDelete={data.onDelete} />
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
            <IconDatabase size={22} color="#1971c2" />
            <Text fw={700} c="blue.8" style={{ fontSize: 22, flex: 1 }} lineClamp={1}>{data.name || 'Publish'}</Text>
            <StatusDot result={result} />
          </Box>
          <Box px={14} pt={8}>
            <Badge size="lg" variant="light" color="blue">{mode === 'overwrite' ? 'Overwrite' : 'Append'}</Badge>
          </Box>
          {result?.ok && result.logs && (
            <Text c="dimmed" px={14} pt={6} lineClamp={2} style={{ fontSize: 16 }}>{result.logs}</Text>
          )}
          <Box style={{ flex: 1 }} />
          <Box px={14} pb={10} style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
            <ShapeBadge result={result} />
          </Box>
        </Box>
      </div>
    );
  }

  const focusClass = focus.focusMode === 'node' ? 'focus-node' : '';
  return (
    <div ref={mergedRef} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} className={`analysis-node ${zoomClass} ${focusClass}`} style={{ width: '100%', height: '100%', outline: 'none' }} {...focus.nodeWrapperProps}>
      <PortBadge label={data.portLabel} />
      <NodeResizer minWidth={260} minHeight={160} isVisible={data.selected} />
      <NodeHandles />
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

        <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <IconDatabase size={14} color="#1971c2" style={{ flexShrink: 0 }} />
          <TextInput
            size="xs"
            variant="unstyled"
            value={data.name ?? ''}
            placeholder="Data Asset Name"
            onChange={(e) => data.onUpdate({ name: e.currentTarget.value })}
            styles={{
              input: { fontWeight: 600, fontSize: 12, color: '#1971c2', padding: 0, height: 20, minHeight: 20 },
              root: { flex: 1, minWidth: 0, overflow: 'hidden' },
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
