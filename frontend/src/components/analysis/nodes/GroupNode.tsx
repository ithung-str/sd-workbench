import { NodeResizer, type NodeProps } from 'reactflow';
import { ActionIcon, Badge, Box, Text, TextInput, Tooltip } from '@mantine/core';
import { IconFold, IconFoldDown, IconTrash } from '@tabler/icons-react';
import type { ZoomLevel } from '../AnalysisPage';
import type { NotebookImportStageState } from '../../../types/model';
import { useNodeHover, useZoomTransition, ZoomControls, NodeHandles } from './nodeZoomHelpers';
import './analysisNodes.css';

type GroupData = {
  name?: string;
  description?: string;
  collapsed?: boolean;
  groupColor?: string;
  childCount?: number;
  importedStage?: boolean;
  placeholder?: boolean;
  importStageState?: NotebookImportStageState;
  stagePurpose?: string;
  stageInputs?: string[];
  stageOutputs?: string[];
  stageNodeCount?: number;
  stageRole?: 'main' | 'branch';
  selected?: boolean;
  zoomLevel?: ZoomLevel;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onToggleCollapse?: () => void;
};

const GROUP_COLORS: Record<string, { bg: string; border: string; text: string; headerBg: string }> = {
  blue: { bg: 'rgba(66, 99, 235, 0.04)', border: '#4263eb', text: '#364fc7', headerBg: 'rgba(66, 99, 235, 0.08)' },
  green: { bg: 'rgba(47, 158, 68, 0.04)', border: '#2f9e44', text: '#2b8a3e', headerBg: 'rgba(47, 158, 68, 0.08)' },
  orange: { bg: 'rgba(230, 119, 0, 0.04)', border: '#e67700', text: '#d9480f', headerBg: 'rgba(230, 119, 0, 0.08)' },
  grape: { bg: 'rgba(156, 54, 181, 0.04)', border: '#9c36b5', text: '#862e9c', headerBg: 'rgba(156, 54, 181, 0.08)' },
  teal: { bg: 'rgba(8, 127, 140, 0.04)', border: '#087f8c', text: '#0b7285', headerBg: 'rgba(8, 127, 140, 0.08)' },
  gray: { bg: 'rgba(134, 142, 150, 0.04)', border: '#868e96', text: '#495057', headerBg: 'rgba(134, 142, 150, 0.08)' },
};

function stageStateLabel(state?: NotebookImportStageState): string | null {
  if (!state) return null;
  switch (state) {
    case 'queued':
      return 'Queued';
    case 'building':
      return 'Building';
    case 'done':
      return 'Done';
    case 'needs_review':
      return 'Needs review';
    default:
      return null;
  }
}

function stageStateColor(state?: NotebookImportStageState): string {
  switch (state) {
    case 'building':
      return 'orange';
    case 'done':
      return 'teal';
    case 'needs_review':
      return 'yellow';
    default:
      return 'gray';
  }
}

function IoList({ label, items, color }: { label: string; items: string[]; color: string }) {
  if (items.length === 0) return null;
  return (
    <Box style={{ display: 'flex', gap: 4, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <Text size="xs" fw={600} c={color} style={{ flexShrink: 0 }}>{label}:</Text>
      <Text size="xs" c="dimmed" lineClamp={1}>{items.join(', ')}</Text>
    </Box>
  );
}

export function GroupNode({ data }: NodeProps<GroupData>) {
  const zoomLevel = data.zoomLevel ?? 'full';
  const zoomClass = useZoomTransition(zoomLevel);
  const hover = useNodeHover();
  const color = GROUP_COLORS[data.groupColor ?? 'blue'] ?? GROUP_COLORS.blue;
  const stageNodeCount = data.stageNodeCount ?? data.childCount ?? 0;
  const stageRoleLabel = data.stageRole === 'branch' ? 'Branch' : 'Main path';
  const stageState = stageStateLabel(data.importStageState);
  const isPlaceholderEmpty = Boolean(data.importedStage && data.placeholder && stageNodeCount === 0);

  if (zoomLevel === 'mini') {
    return (
      <div ref={hover.ref} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <NodeResizer minWidth={120} minHeight={60} isVisible={data.selected} />
        <ZoomControls zoomLevel={zoomLevel} onDelete={data.onDelete} />
        <Box style={{ background: color.bg, borderRadius: 16, border: `2px solid ${color.border}44`, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Text fw={700} c={color.text} style={{ fontSize: 24 }} lineClamp={1}>{data.name || (data.importedStage ? 'Stage' : 'Group')}</Text>
          <Badge size="lg" variant="light">{stageNodeCount} steps</Badge>
          {data.importedStage && (
            <Badge size="sm" variant="dot" color={data.stageRole === 'branch' ? 'gray' : 'teal'}>{stageRoleLabel}</Badge>
          )}
        </Box>
        <NodeHandles />
      </div>
    );
  }

  if (zoomLevel === 'summary') {
    return (
      <div ref={hover.ref} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <NodeResizer minWidth={180} minHeight={100} isVisible={data.selected} />
        <ZoomControls zoomLevel={zoomLevel} onDuplicate={data.onDuplicate} onDelete={data.onDelete} />
        <Box style={{ background: color.bg, borderRadius: 16, border: `2px solid ${color.border}44`, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: color.headerBg, borderBottom: `1px solid ${color.border}22` }}>
            <Text fw={700} c={color.text} style={{ fontSize: 22, flex: 1 }} lineClamp={1}>{data.name || (data.importedStage ? 'Stage' : 'Group')}</Text>
            <Badge size="sm" variant="light">{stageNodeCount} steps</Badge>
            {data.importedStage && (
              <Badge size="sm" variant="dot" color={data.stageRole === 'branch' ? 'gray' : 'teal'}>{stageRoleLabel}</Badge>
            )}
            {stageState && <Badge size="sm" variant={data.placeholder ? 'filled' : 'light'} color={stageStateColor(data.importStageState)}>{stageState}</Badge>}
          </Box>
          <Box px={14} py={10} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.stagePurpose && <Text c="dimmed" lineClamp={2} style={{ fontSize: 15 }}>{data.stagePurpose}</Text>}
            {data.stageInputs && data.stageInputs.length > 0 && (
              <Text c="dimmed" style={{ fontSize: 14 }}>Inputs: {data.stageInputs.join(', ')}</Text>
            )}
            {data.stageOutputs && data.stageOutputs.length > 0 && (
              <Text c="dimmed" style={{ fontSize: 14 }}>Outputs: {data.stageOutputs.join(', ')}</Text>
            )}
          </Box>
        </Box>
        <NodeHandles />
      </div>
    );
  }

  // Full zoom level
  if (data.collapsed) {
    return (
      <div ref={hover.ref} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <NodeResizer minWidth={180} minHeight={100} isVisible={data.selected} />
        <ZoomControls zoomLevel={zoomLevel} onDuplicate={data.onDuplicate} onDelete={data.onDelete} />
        <Box
          style={{
            background: color.bg,
            border: `2px solid ${color.border}55`,
            borderRadius: 16,
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <NodeHandles />

          {/* Header */}
          <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', background: color.headerBg, borderBottom: `1px solid ${color.border}22` }}>
            <Text fw={700} size="sm" c={color.text} style={{ flex: 1 }} lineClamp={1}>{data.name || (data.importedStage ? 'Stage' : 'Group')}</Text>
            <Badge size="xs" variant="light" color="gray">{stageNodeCount} steps</Badge>
            {data.importedStage && (
              <Badge size="xs" variant="dot" color={data.stageRole === 'branch' ? 'gray' : 'teal'}>{stageRoleLabel}</Badge>
            )}
            <div style={{ display: 'flex', gap: 2 }}>
              {data.onToggleCollapse && (
                <Tooltip label="Expand group">
                  <ActionIcon size="xs" variant="subtle" color="gray" onClick={data.onToggleCollapse}>
                    <IconFoldDown size={12} />
                  </ActionIcon>
                </Tooltip>
              )}
            </div>
          </Box>

          {/* Body: summary info */}
          <Box style={{ flex: 1, padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {isPlaceholderEmpty && (
              <Text size="xs" c="dimmed">
                {data.importStageState === 'building' ? 'Waiting for step details...' : 'Waiting for step details'}
              </Text>
            )}
            {data.stagePurpose && (
              <Text size="xs" c="dimmed" lineClamp={2}>{data.stagePurpose}</Text>
            )}
            {data.description && !data.stagePurpose && (
              <Text size="xs" c="dimmed" lineClamp={2}>{data.description}</Text>
            )}
            <Box style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
              <IoList label="In" items={data.stageInputs ?? []} color={color.text} />
              <IoList label="Out" items={data.stageOutputs ?? []} color={color.text} />
            </Box>
            {stageState && (
              <Badge size="xs" variant={data.placeholder ? 'filled' : 'light'} color={stageStateColor(data.importStageState)} mt={2}>{stageState}</Badge>
            )}
          </Box>
        </Box>
      </div>
    );
  }

  // Full zoom, expanded
  return (
    <div ref={hover.ref} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
      <NodeResizer minWidth={200} minHeight={100} isVisible={data.selected} />
      <Box
        style={{
          background: color.bg,
          border: `2px dashed ${color.border}44`,
          borderRadius: 16,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <NodeHandles />

        <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: `1px solid ${color.border}22`, background: color.headerBg }}>
          <TextInput
            size="xs"
            variant="unstyled"
            value={data.name ?? ''}
            placeholder={data.importedStage ? 'Stage' : 'Group'}
            onChange={(e) => data.onUpdate({ name: e.currentTarget.value })}
            styles={{
              input: { fontWeight: 600, fontSize: 12, color: color.text, padding: 0, height: 20, minHeight: 20 },
              root: { flex: 1, minWidth: 0, overflow: 'hidden' },
            }}
          />
          {data.importedStage ? (
            <>
              <Badge size="xs" variant="light" color="gray">{stageNodeCount} steps</Badge>
              <Badge size="xs" variant="dot" color={data.stageRole === 'branch' ? 'gray' : 'teal'}>{stageRoleLabel}</Badge>
              {stageState && <Badge size="xs" variant={data.placeholder ? 'filled' : 'light'} color={stageStateColor(data.importStageState)}>{stageState}</Badge>}
            </>
          ) : data.childCount != null ? (
            <Badge size="xs" variant="light" color="gray">{data.childCount} nodes</Badge>
          ) : null}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
            {data.onToggleCollapse && (
              <Tooltip label="Collapse group">
                <ActionIcon size="xs" variant="subtle" color="gray" onClick={data.onToggleCollapse}>
                  <IconFold size={12} />
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
      </Box>
    </div>
  );
}
