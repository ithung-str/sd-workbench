import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';
import React from 'react';
import { MantineProvider } from '@mantine/core';

vi.mock('reactflow', () => {
  const ReactFlow = ({ children }: { children?: ReactNode }) => React.createElement('div', { 'data-testid': 'reactflow-root' }, children);
  const ReactFlowProvider = ({ children }: { children?: ReactNode }) => React.createElement(React.Fragment, null, children);
  const Panel = ({ children }: { children?: ReactNode }) => React.createElement('div', null, children);
  const Controls = () => React.createElement('div', null);
  const MiniMap = () => React.createElement('div', null);
  const Background = () => React.createElement('div', null);
  return {
    __esModule: true,
    default: ReactFlow,
    ReactFlowProvider,
    Panel,
    Controls,
    MiniMap,
    Background,
    BackgroundVariant: { Dots: 'dots' },
    MarkerType: { ArrowClosed: 'arrowclosed' },
    useReactFlow: () => ({
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      fitView: vi.fn(),
      setViewport: vi.fn(),
    }),
  };
});

import { cloneModel, teacupModel } from '../../lib/sampleModels';
import { useEditorStore } from '../../state/editorStore';
import { ModelCanvas } from './ModelCanvas';

function renderCanvas() {
  return render(
    <MantineProvider>
      <ModelCanvas />
    </MantineProvider>,
  );
}

beforeEach(() => {
  useEditorStore.getState().loadModel(cloneModel(teacupModel));
});

describe('ModelCanvas keyboard shortcuts', () => {
  it('handles Ctrl+Z undo and Ctrl+Shift+Z redo', () => {
    renderCanvas();

    const start = useEditorStore.getState().model.nodes.length;
    useEditorStore.getState().addNode('aux');
    expect(useEditorStore.getState().model.nodes.length).toBe(start + 1);

    fireEvent.keyDown(window, { key: 'z', ctrlKey: true });
    expect(useEditorStore.getState().model.nodes.length).toBe(start);

    fireEvent.keyDown(window, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(useEditorStore.getState().model.nodes.length).toBe(start + 1);
  });

  it('handles Ctrl+Y redo', () => {
    renderCanvas();

    const start = useEditorStore.getState().model.nodes.length;
    useEditorStore.getState().addNode('aux');
    useEditorStore.getState().undo();
    expect(useEditorStore.getState().model.nodes.length).toBe(start);

    fireEvent.keyDown(window, { key: 'y', ctrlKey: true });
    expect(useEditorStore.getState().model.nodes.length).toBe(start + 1);
  });

  it('ignores undo shortcut in editable targets', () => {
    renderCanvas();

    const start = useEditorStore.getState().model.nodes.length;
    useEditorStore.getState().addNode('aux');
    expect(useEditorStore.getState().model.nodes.length).toBe(start + 1);

    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'z', ctrlKey: true });

    expect(useEditorStore.getState().model.nodes.length).toBe(start + 1);
    document.body.removeChild(input);
  });

  it('keeps backspace delete behavior and ignores editable targets', async () => {
    renderCanvas();

    const node = useEditorStore.getState().model.nodes[0];
    act(() => {
      useEditorStore.getState().setSelected({ kind: 'node', id: node.id });
    });
    fireEvent.keyDown(window, { key: 'Backspace' });
    await waitFor(() => {
      expect(useEditorStore.getState().model.nodes.some((n) => n.id === node.id)).toBe(false);
    });

    const next = useEditorStore.getState().model.nodes[0];
    act(() => {
      useEditorStore.getState().setSelected({ kind: 'node', id: next.id });
    });
    const input = document.createElement('input');
    document.body.appendChild(input);
    fireEvent.keyDown(input, { key: 'Backspace' });
    await waitFor(() => {
      expect(useEditorStore.getState().model.nodes.some((n) => n.id === next.id)).toBe(true);
    });
    document.body.removeChild(input);
  });
});
