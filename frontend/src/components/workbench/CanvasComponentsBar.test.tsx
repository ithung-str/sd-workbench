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
      multiSelectedNodeIds: [],
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

  it('align buttons hidden when fewer than 2 nodes selected', () => {
    useEditorStore.setState((state) => ({
      ...state,
      multiSelectedNodeIds: [],
    }));
    render(
      <MantineProvider>
        <CanvasComponentsBar />
      </MantineProvider>,
    );

    expect(screen.queryByRole('button', { name: 'Align left' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Align right' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Align top' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Align bottom' })).toBeNull();
  });

  it('align buttons shown and call alignNodes with multiSelectedNodeIds', async () => {
    const user = userEvent.setup();

    const alignSpy = vi.fn();
    useEditorStore.setState((state) => ({
      ...state,
      multiSelectedNodeIds: ['a', 'b'],
      alignNodes: alignSpy,
    }));

    render(
      <MantineProvider>
        <CanvasComponentsBar />
      </MantineProvider>,
    );

    expect(screen.getByText('2 selected')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: 'Align left' }));
    expect(alignSpy).toHaveBeenCalledWith('left', ['a', 'b']);

    await user.click(screen.getByRole('button', { name: 'Align top' }));
    expect(alignSpy).toHaveBeenCalledWith('top', ['a', 'b']);
  });

  it('shows delete button in multi-select mode', async () => {
    const user = userEvent.setup();

    const deleteSpy = vi.fn();
    useEditorStore.setState((state) => ({
      ...state,
      multiSelectedNodeIds: ['a', 'b'],
      deleteMultiSelected: deleteSpy,
    }));

    render(
      <MantineProvider>
        <CanvasComponentsBar />
      </MantineProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Delete selected' }));
    expect(deleteSpy).toHaveBeenCalledTimes(1);
  });

  it('toggles lock', async () => {
    const user = userEvent.setup();

    render(
      <MantineProvider>
        <CanvasComponentsBar />
      </MantineProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Lock canvas' }));

    const state = useEditorStore.getState();
    expect(state.isCanvasLocked).toBe(true);
  });
});
