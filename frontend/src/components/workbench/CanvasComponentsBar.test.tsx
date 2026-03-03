import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CanvasComponentsBar } from './CanvasComponentsBar';
import { useEditorStore } from '../../state/editorStore';

const mockReactFlow = {
  zoomIn: vi.fn(),
  zoomOut: vi.fn(),
  fitView: vi.fn(),
  setViewport: vi.fn(),
  getNodes: vi.fn(() => []),
};

vi.mock('reactflow', () => ({
  useReactFlow: () => mockReactFlow,
}));

describe('CanvasComponentsBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useEditorStore.setState((state) => ({
      ...state,
      isCanvasLocked: false,
    }));
  });

  it('calls viewport actions from top controls', async () => {
    const user = userEvent.setup();
    render(
      <MantineProvider>
        <CanvasComponentsBar />
      </MantineProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    await user.click(screen.getByRole('button', { name: 'Zoom out' }));
    await user.click(screen.getByRole('button', { name: 'Zoom to all' }));
    await user.click(screen.getByRole('button', { name: 'Reset zoom' }));

    expect(mockReactFlow.zoomIn).toHaveBeenCalledTimes(1);
    expect(mockReactFlow.zoomOut).toHaveBeenCalledTimes(1);
    expect(mockReactFlow.fitView).toHaveBeenCalledTimes(1);
    expect(mockReactFlow.setViewport).toHaveBeenCalledTimes(1);
  });

  it('align buttons disabled when fewer than 2 nodes selected', () => {
    mockReactFlow.getNodes.mockReturnValue([]);
    render(
      <MantineProvider>
        <CanvasComponentsBar />
      </MantineProvider>,
    );

    expect(screen.getByRole('button', { name: 'Align left' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Align right' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Align top' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Align bottom' })).toBeDisabled();
  });

  it('align buttons call alignNodes with selected node ids', async () => {
    const user = userEvent.setup();
    mockReactFlow.getNodes.mockReturnValue([
      { id: 'a', selected: true },
      { id: 'b', selected: true },
      { id: 'c', selected: false },
    ]);

    const alignSpy = vi.fn();
    useEditorStore.setState((state) => ({
      ...state,
      alignNodes: alignSpy,
    }));

    render(
      <MantineProvider>
        <CanvasComponentsBar />
      </MantineProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Align left' }));
    expect(alignSpy).toHaveBeenCalledWith('left', ['a', 'b']);

    await user.click(screen.getByRole('button', { name: 'Align top' }));
    expect(alignSpy).toHaveBeenCalledWith('top', ['a', 'b']);
  });

  it('inserts CLD symbol and toggles lock', async () => {
    const user = userEvent.setup();
    const startNodes = useEditorStore.getState().model.nodes.length;

    render(
      <MantineProvider>
        <CanvasComponentsBar />
      </MantineProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Insert CLD' }));
    await user.click(screen.getByRole('button', { name: 'Lock canvas' }));

    const state = useEditorStore.getState();
    expect(state.isCanvasLocked).toBe(true);
    expect(state.model.nodes.length).toBe(startNodes + 1);
    const created = state.model.nodes[state.model.nodes.length - 1];
    expect(created?.type).toBe('cld_symbol');
    if (created?.type === 'cld_symbol') {
      expect(created.symbol).toBe('R');
    }
  });
});
