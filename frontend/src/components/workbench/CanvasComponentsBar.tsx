import { ActionIcon, Badge, Group, Tooltip } from '@mantine/core';
import { IconAlignBoxBottomCenter, IconAlignBoxTopCenter, IconAlignLeft, IconAlignRight, IconChartLine, IconLayoutDistributeHorizontal, IconLock, IconLockOpen, IconPlus, IconTrash, IconZoomIn, IconZoomOut } from '@tabler/icons-react';
import { useReactFlow } from 'reactflow';
import { useEditorStore } from '../../state/editorStore';

export function CanvasComponentsBar() {
  const reactFlow = useReactFlow();
  const isCanvasLocked = useEditorStore((s) => s.isCanvasLocked);
  const setCanvasLocked = useEditorStore((s) => s.setCanvasLocked);
  const autoOrganize = useEditorStore((s) => s.autoOrganize);
  const alignNodes = useEditorStore((s) => s.alignNodes);
  const cleanPhantoms = useEditorStore((s) => s.cleanPhantoms);
  const hasPhantoms = useEditorStore((s) => s.model.nodes.some((n) => n.type === 'phantom'));
  const multiSelectedNodeIds = useEditorStore((s) => s.multiSelectedNodeIds);
  const deleteMultiSelected = useEditorStore((s) => s.deleteMultiSelected);
  const bulkUpdateNodes = useEditorStore((s) => s.bulkUpdateNodes);
  const modelNodes = useEditorStore((s) => s.model.nodes);
  const isReadOnly = false;

  const hasMultiSelection = multiSelectedNodeIds.length >= 2;

  // Find stock nodes in the multi-selection for sparkline toggle
  const selectedStockIds = hasMultiSelection
    ? multiSelectedNodeIds.filter((id) => {
        const node = modelNodes.find((n) => n.id === id);
        return node?.type === 'stock';
      })
    : [];

  return (
    <div className="canvas-components-bar" data-testid="canvas-components-bar">
      <Group gap={6} wrap="wrap" align="center">
        <Tooltip label="Zoom in" withArrow>
          <ActionIcon variant="light" color="gray" size="md" radius="sm" aria-label="Zoom in" onClick={() => reactFlow.zoomIn({ duration: 160 })}>
            <IconZoomIn size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Zoom out" withArrow>
          <ActionIcon variant="light" color="gray" size="md" radius="sm" aria-label="Zoom out" onClick={() => reactFlow.zoomOut({ duration: 160 })}>
            <IconZoomOut size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Zoom to all" withArrow>
          <ActionIcon variant="light" color="gray" size="md" radius="sm" aria-label="Zoom to all" onClick={() => reactFlow.fitView({ padding: 0.16, duration: 220 })}>
            <IconPlus size={13} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Reset zoom" withArrow>
          <ActionIcon
            variant="light"
            color="gray"
            size="md"
            radius="sm"
            aria-label="Reset zoom"
            onClick={() => reactFlow.setViewport({ x: 0, y: 0, zoom: 1 }, { duration: 220 })}
          >
            1:1
          </ActionIcon>
        </Tooltip>
        <Tooltip label={isCanvasLocked ? 'Unlock canvas' : 'Lock canvas'} withArrow>
          <ActionIcon
            variant={isCanvasLocked ? 'filled' : 'light'}
            color={isCanvasLocked ? 'orange' : 'gray'}
            size="md"
            radius="sm"
            aria-label={isCanvasLocked ? 'Unlock canvas' : 'Lock canvas'}
            onClick={() => setCanvasLocked(!isCanvasLocked)}
          >
            {isCanvasLocked ? <IconLock size={14} /> : <IconLockOpen size={14} />}
          </ActionIcon>
        </Tooltip>

        <div className="canvas-components-divider" />

        <Tooltip label="Auto-organize layout" withArrow>
          <ActionIcon
            variant="light"
            color="gray"
            size="md"
            radius="sm"
            aria-label="Auto-organize layout"
            onClick={autoOrganize}
            disabled={isReadOnly}
          >
            <IconLayoutDistributeHorizontal size={14} />
          </ActionIcon>
        </Tooltip>

        {hasMultiSelection && (
          <>
            <div className="canvas-components-divider" />

            <Badge size="sm" variant="light" color="blue" data-testid="multi-select-badge">
              {multiSelectedNodeIds.length} selected
            </Badge>

            <Tooltip label="Align left" withArrow>
              <ActionIcon variant="light" color="gray" size="md" radius="sm" aria-label="Align left" onClick={() => alignNodes('left', multiSelectedNodeIds)}>
                <IconAlignLeft size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Align right" withArrow>
              <ActionIcon variant="light" color="gray" size="md" radius="sm" aria-label="Align right" onClick={() => alignNodes('right', multiSelectedNodeIds)}>
                <IconAlignRight size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Align top" withArrow>
              <ActionIcon variant="light" color="gray" size="md" radius="sm" aria-label="Align top" onClick={() => alignNodes('top', multiSelectedNodeIds)}>
                <IconAlignBoxTopCenter size={14} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label="Align bottom" withArrow>
              <ActionIcon variant="light" color="gray" size="md" radius="sm" aria-label="Align bottom" onClick={() => alignNodes('bottom', multiSelectedNodeIds)}>
                <IconAlignBoxBottomCenter size={14} />
              </ActionIcon>
            </Tooltip>

            {selectedStockIds.length > 0 && (
              <Tooltip label="Toggle sparklines on selected stocks" withArrow>
                <ActionIcon
                  variant="light"
                  color="blue"
                  size="md"
                  radius="sm"
                  aria-label="Toggle sparklines"
                  onClick={() => {
                    const anyShowing = selectedStockIds.some((id) => {
                      const node = modelNodes.find((n) => n.id === id);
                      return node?.type === 'stock' && node.show_graph;
                    });
                    bulkUpdateNodes(selectedStockIds, { show_graph: !anyShowing } as any);
                  }}
                >
                  <IconChartLine size={14} />
                </ActionIcon>
              </Tooltip>
            )}

            <Tooltip label="Delete selected" withArrow>
              <ActionIcon
                variant="light"
                color="red"
                size="md"
                radius="sm"
                aria-label="Delete selected"
                onClick={deleteMultiSelected}
              >
                <IconTrash size={14} />
              </ActionIcon>
            </Tooltip>
          </>
        )}

        {hasPhantoms && (
          <Tooltip label="Remove leftover phantom nodes" withArrow>
            <ActionIcon
              variant="light"
              color="red"
              size="md"
              radius="sm"
              aria-label="Clean phantoms"
              onClick={cleanPhantoms}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        )}
        {isReadOnly ? (
          <Tooltip label="Imported Vensim mode is read-only" withArrow>
            <ActionIcon
              variant="light"
              color="violet"
              size="md"
              radius="sm"
              aria-label="Read-only mode"
              disabled
            >
              <IconLock size={14} />
            </ActionIcon>
          </Tooltip>
        ) : null}
      </Group>
    </div>
  );
}
