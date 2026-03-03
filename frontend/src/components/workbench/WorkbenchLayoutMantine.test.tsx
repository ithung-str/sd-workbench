import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cloneModel, modelPresets, teacupModel } from '../../lib/sampleModels';
import { useEditorStore } from '../../state/editorStore';
import { WorkbenchLayout } from './WorkbenchLayoutMantine';

vi.mock('../canvas/ModelCanvas', () => ({
  ModelCanvas: () => <div data-testid="model-canvas" />,
}));

vi.mock('../inspector/InspectorPanelMantine', () => ({
  InspectorPanel: () => <div data-testid="inspector-panel" />,
}));

vi.mock('../io/ImportExportControls', () => ({
  ImportExportControls: () => <div data-testid="import-export-controls" />,
}));

vi.mock('./AIChatSidebar', () => ({
  AIChatSidebar: () => <div data-testid="ai-chat-sidebar" />,
}));

vi.mock('./IconStrip', () => ({
  IconStrip: () => <div data-testid="icon-strip" />,
}));

vi.mock('./FlyoutPanel', () => ({
  FlyoutPanel: () => <div data-testid="flyout-panel" />,
}));

vi.mock('./BottomNavBar', () => ({
  BottomNavBar: () => <div data-testid="bottom-nav-bar" />,
}));

vi.mock('./SimulationPanel', () => ({
  SimulationPanel: () => <div data-testid="simulation-panel" />,
}));

describe('WorkbenchLayoutMantine model picker', () => {
  beforeEach(() => {
    useEditorStore.getState().loadModel(cloneModel(teacupModel));
  });

  it('shows native presets in the model picker', async () => {
    render(
      <MantineProvider>
        <WorkbenchLayout />
      </MantineProvider>,
    );

    const user = userEvent.setup();
    const picker = document.querySelector('input[aria-label="Model picker"]') as HTMLInputElement | null;
    if (!picker) throw new Error('Model picker input not found');
    await user.click(picker);

    expect(await screen.findByText('Unsaved diagram')).toBeInTheDocument();
    expect(screen.getByText('Teacup Cooling')).toBeInTheDocument();
    expect(screen.getByText('Bathtub Inventory')).toBeInTheDocument();
    expect(screen.queryByText('Vensim Library')).not.toBeInTheDocument();
  });

  it('loads selected native preset', async () => {
    render(
      <MantineProvider>
        <WorkbenchLayout />
      </MantineProvider>,
    );

    const user = userEvent.setup();
    const picker = document.querySelector('input[aria-label="Model picker"]') as HTMLInputElement | null;
    if (!picker) throw new Error('Model picker input not found');

    await user.click(picker);
    await user.click(await screen.findByText('Bathtub Inventory'));

    expect(useEditorStore.getState().model.name).toBe(modelPresets.bathtub.name);
  });
});

describe('Right sidebar toggle', () => {
  beforeEach(() => {
    useEditorStore.getState().loadModel(cloneModel(teacupModel));
    useEditorStore.getState().setRightSidebarMode('inspector');
  });

  it('shows inspector panel by default', () => {
    render(
      <MantineProvider>
        <WorkbenchLayout />
      </MantineProvider>,
    );
    expect(screen.getByTestId('inspector-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('ai-chat-sidebar')).not.toBeInTheDocument();
  });

  it('switches to AI chat when chat mode is selected', async () => {
    const user = userEvent.setup();
    render(
      <MantineProvider>
        <WorkbenchLayout />
      </MantineProvider>,
    );

    // Click the "AI Chat" segment in the SegmentedControl
    const chatToggle = screen.getByText('AI Chat');
    await user.click(chatToggle);

    expect(screen.getByTestId('ai-chat-sidebar')).toBeInTheDocument();
    expect(screen.queryByTestId('inspector-panel')).not.toBeInTheDocument();
  });
});
