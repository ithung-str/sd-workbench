import { ActionIcon, Button, Group, Tooltip } from '@mantine/core';
import { IconAlignBoxBottomCenter, IconAlignBoxTopCenter, IconAlignLeft, IconAlignRight, IconLayoutDistributeHorizontal, IconLock, IconLockOpen, IconPlus, IconTrash, IconZoomIn, IconZoomOut } from '@tabler/icons-react';
import { useReactFlow } from 'reactflow';
import { useEditorStore } from '../../state/editorStore';

export function CanvasComponentsBar() {
  const reactFlow = useReactFlow();
  const addCldSymbol = useEditorStore((s) => s.addCldSymbol);
  const isCanvasLocked = useEditorStore((s) => s.isCanvasLocked);
  const setCanvasLocked = useEditorStore((s) => s.setCanvasLocked);
  const autoOrganize = useEditorStore((s) => s.autoOrganize);
  const alignNodes = useEditorStore((s) => s.alignNodes);
  const cleanPhantoms = useEditorStore((s) => s.cleanPhantoms);
  const hasPhantoms = useEditorStore((s) => s.model.nodes.some((n) => n.type === 'phantom'));
  const isReadOnly = false;

  const getSelectedNodeIds = () =>
    (reactFlow.getNodes?.() ?? []).filter((n) => n.selected).map((n) => n.id);
  const hasMultiSelection = () => getSelectedNodeIds().length >= 2;

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

        <div className="canvas-components-divider" />

        <Tooltip label="Align left" withArrow>
          <ActionIcon variant="light" color="gray" size="md" radius="sm" aria-label="Align left" onClick={() => alignNodes('left', getSelectedNodeIds())} disabled={isReadOnly || !hasMultiSelection()}>
            <IconAlignLeft size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Align right" withArrow>
          <ActionIcon variant="light" color="gray" size="md" radius="sm" aria-label="Align right" onClick={() => alignNodes('right', getSelectedNodeIds())} disabled={isReadOnly || !hasMultiSelection()}>
            <IconAlignRight size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Align top" withArrow>
          <ActionIcon variant="light" color="gray" size="md" radius="sm" aria-label="Align top" onClick={() => alignNodes('top', getSelectedNodeIds())} disabled={isReadOnly || !hasMultiSelection()}>
            <IconAlignBoxTopCenter size={14} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Align bottom" withArrow>
          <ActionIcon variant="light" color="gray" size="md" radius="sm" aria-label="Align bottom" onClick={() => alignNodes('bottom', getSelectedNodeIds())} disabled={isReadOnly || !hasMultiSelection()}>
            <IconAlignBoxBottomCenter size={14} />
          </ActionIcon>
        </Tooltip>

        <Tooltip label="Add CLD marker (configure in Inspector)" withArrow>
          <Button
            variant="light"
            color="indigo"
            size="xs"
            onClick={() => addCldSymbol('R')}
            disabled={isReadOnly}
            aria-label="Insert CLD"
          >
            CLD
          </Button>
        </Tooltip>
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
