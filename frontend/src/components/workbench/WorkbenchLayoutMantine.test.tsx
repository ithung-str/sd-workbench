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

vi.mock('../palette/PalettePanelMantine', () => ({
  PalettePanel: () => <div data-testid="palette-panel" />,
}));

vi.mock('../inspector/InspectorPanelMantine', () => ({
  InspectorPanel: () => <div data-testid="inspector-panel" />,
}));

vi.mock('../results/ResultsDockMantine', () => ({
  ResultsDock: () => <div data-testid="results-dock" />,
}));

vi.mock('../io/ImportExportControls', () => ({
  ImportExportControls: () => <div data-testid="import-export-controls" />,
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
