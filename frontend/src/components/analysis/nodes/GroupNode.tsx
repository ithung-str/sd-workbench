import { Handle, Position, NodeResizer, type NodeProps } from 'reactflow';
import { ActionIcon, Badge, Box, Text, TextInput, Tooltip } from '@mantine/core';
import { IconFold, IconFoldDown, IconTrash } from '@tabler/icons-react';
import type { ZoomLevel } from '../AnalysisPage';
import { useZoomTransition, ZoomControls } from './nodeZoomHelpers';
import './analysisNodes.css';

type GroupData = {
  name?: string;
  description?: string;
  collapsed?: boolean;
  groupColor?: string;
  childCount?: number;
  selected?: boolean;
  zoomLevel?: ZoomLevel;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onToggleCollapse?: () => void;
};

const GROUP_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  blue: { bg: 'rgba(66, 99, 235, 0.06)', border: '#4263eb', text: '#364fc7' },
  green: { bg: 'rgba(47, 158, 68, 0.06)', border: '#2f9e44', text: '#2b8a3e' },
  orange: { bg: 'rgba(230, 119, 0, 0.06)', border: '#e67700', text: '#d9480f' },
  grape: { bg: 'rgba(156, 54, 181, 0.06)', border: '#9c36b5', text: '#862e9c' },
  gray: { bg: 'rgba(134, 142, 150, 0.06)', border: '#868e96', text: '#495057' },
};

export function GroupNode({ data }: NodeProps<GroupData>) {
  const zoomLevel = data.zoomLevel ?? 'full';
  const zoomClass = useZoomTransition(zoomLevel);
  const color = GROUP_COLORS[data.groupColor ?? 'blue'] ?? GROUP_COLORS.blue;

  if (zoomLevel === 'mini') {
    return (
      <div className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <ZoomControls zoomLevel={zoomLevel} onDelete={data.onDelete} />
        <Box style={{ background: color.bg, borderRadius: 8, border: `2px dashed ${color.border}`, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Text fw={700} c={color.text} style={{ fontSize: 24 }} lineClamp={1}>{data.name || 'Group'}</Text>
          {data.childCount != null && <Badge size="lg" variant="light">{data.childCount} nodes</Badge>}
        </Box>
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  if (zoomLevel === 'summary') {
    return (
      <div className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <ZoomControls zoomLevel={zoomLevel} onDuplicate={data.onDuplicate} onDelete={data.onDelete} />
        <Box style={{ background: color.bg, borderRadius: 8, border: `2px dashed ${color.border}`, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: `1px solid ${color.border}33` }}>
            <Text fw={700} c={color.text} style={{ fontSize: 22, flex: 1 }} lineClamp={1}>{data.name || 'Group'}</Text>
            {data.childCount != null && <Badge size="lg" variant="light">{data.childCount} nodes</Badge>}
          </Box>
          {data.description && <Text c="dimmed" px={14} pt={8} lineClamp={3} style={{ fontSize: 16 }}>{data.description}</Text>}
        </Box>
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  return (
    <div className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
      <NodeResizer minWidth={200} minHeight={100} isVisible={data.selected} />
      <Box
        style={{
          background: color.bg,
          border: `2px dashed ${color.border}`,
          borderRadius: 12,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />

        <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${color.border}33`, overflow: 'hidden' }}>
          <TextInput
            size="xs"
            variant="unstyled"
            value={data.name ?? ''}
            placeholder="Group"
            onChange={(e) => data.onUpdate({ name: e.currentTarget.value })}
            styles={{
              input: { fontWeight: 600, fontSize: 12, color: color.text, padding: 0, height: 20, minHeight: 20 },
              root: { flex: 1, minWidth: 0, overflow: 'hidden' },
            }}
          />
          {data.childCount != null && (
            <Badge size="xs" variant="light" color="gray">{data.childCount} nodes</Badge>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
            {data.onToggleCollapse && (
              <Tooltip label={data.collapsed ? 'Expand group' : 'Collapse group'}>
                <ActionIcon size="xs" variant="subtle" color="gray" onClick={data.onToggleCollapse}>
                  {data.collapsed ? <IconFoldDown size={12} /> : <IconFold size={12} />}
                </ActionIcon>
              </Tooltip>
            )}
            {data.onDelete && (
              <Tooltip label="Delete group">
                <ActionIcon size="xs" variant="subtle" color="red" onClick={data.onDelete}>
                  <IconTrash size={12} />
                </ActionIcon>
              </Tooltip>
            )}
          </div>
        </Box>

        {data.collapsed && (
          <Box style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12 }}>
            <Text size="xs" c="dimmed">
              {data.childCount ?? 0} nodes collapsed
            </Text>
          </Box>
        )}
      </Box>
    </div>
  );
}
