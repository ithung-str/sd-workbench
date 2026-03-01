import { ActionIcon, Button, Group, Tooltip } from '@mantine/core';
import { IconLayoutDistributeHorizontal, IconLock, IconLockOpen, IconPlus, IconZoomIn, IconZoomOut } from '@tabler/icons-react';
import { useReactFlow } from 'reactflow';
import { useEditorStore } from '../../state/editorStore';

export function CanvasComponentsBar() {
  const reactFlow = useReactFlow();
  const addNode = useEditorStore((s) => s.addNode);
  const addCldSymbol = useEditorStore((s) => s.addCldSymbol);
  const activeSimulationMode = useEditorStore((s) => s.activeSimulationMode);
  const isCanvasLocked = useEditorStore((s) => s.isCanvasLocked);
  const setCanvasLocked = useEditorStore((s) => s.setCanvasLocked);
  const autoOrganize = useEditorStore((s) => s.autoOrganize);
  const isReadOnly = activeSimulationMode === 'vensim';

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

        <Button variant="light" color="blue" size="xs" onClick={() => addNode('stock')} disabled={isReadOnly}>
          Stock
        </Button>
        <Button variant="light" color="green" size="xs" onClick={() => addNode('aux')} disabled={isReadOnly}>
          Variable
        </Button>
        <Button variant="light" color="orange" size="xs" onClick={() => addNode('lookup')} disabled={isReadOnly}>
          Look-up
        </Button>
        <Button variant="light" color="gray" size="xs" onClick={() => addNode('text')} disabled={isReadOnly}>
          Text
        </Button>

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
