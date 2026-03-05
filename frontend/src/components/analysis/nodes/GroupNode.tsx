import { Handle, Position, NodeResizer, type NodeProps } from 'reactflow';
import { ActionIcon, Badge, Box, Text, TextInput, Tooltip } from '@mantine/core';
import { IconFold, IconFoldDown, IconTrash } from '@tabler/icons-react';
import type { ZoomLevel } from '../AnalysisPage';
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
  const color = GROUP_COLORS[data.groupColor ?? 'blue'] ?? GROUP_COLORS.blue;

  if (zoomLevel === 'mini') {
    return (
      <div className="analysis-node analysis-node--mini">
        <Box style={{ background: color.bg, borderRadius: 8, border: `2px dashed ${color.border}`, padding: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
          <Text size="xs" fw={600} c={color.text} truncate>{data.name || 'Group'}</Text>
          {data.childCount != null && <Badge size="xs" variant="light">{data.childCount}</Badge>}
        </Box>
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  if (zoomLevel === 'summary') {
    return (
      <div className="analysis-node analysis-node--summary">
        <Box style={{ background: color.bg, borderRadius: 8, border: `2px dashed ${color.border}`, padding: 8, minWidth: 180 }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Text size="xs" fw={600} c={color.text} truncate>{data.name || 'Group'}</Text>
            {data.childCount != null && <Badge size="xs" variant="light">{data.childCount}</Badge>}
          </Box>
          {data.description && <Text size="xs" c="dimmed" mt={4} lineClamp={2}>{data.description}</Text>}
        </Box>
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
      </div>
    );
  }

  return (
    <div className="analysis-node" style={{ width: '100%', height: '100%' }}>
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

        <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${color.border}33` }}>
          <TextInput
            size="xs"
            variant="unstyled"
            value={data.name ?? ''}
            placeholder="Group"
            onChange={(e) => data.onUpdate({ name: e.currentTarget.value })}
            styles={{
              input: { fontWeight: 600, fontSize: 12, color: color.text, padding: 0, height: 20, minHeight: 20, width: Math.max(40, (data.name?.length ?? 5) * 8 + 12) },
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
