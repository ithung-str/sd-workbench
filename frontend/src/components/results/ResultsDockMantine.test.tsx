import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import * as mfaExport from '../../lib/mfaExport';
import { bathtubInventoryModel, cloneModel } from '../../lib/sampleModels';
import { useEditorStore } from '../../state/editorStore';
import { useUIStore } from '../../state/uiStore';
import type { SimulateResponse } from '../../types/model';
import { ResultsDock } from './ResultsDockMantine';

vi.mock('@mantine/notifications', () => ({
  notifications: {
    show: vi.fn(),
  },
}));

const results: SimulateResponse = {
  ok: true,
  warnings: [],
  metadata: { engine: 'pysd', row_count: 3, variables_returned: ['time', 'inflow', 'outflow', 'inventory'] },
  series: {
    time: [0, 1, 2],
    inflow: [3, 4, 5],
    outflow: [1, 2, 3],
    inventory: [10, 12, 14],
  },
};

beforeEach(() => {
  vi.restoreAllMocks();

  useEditorStore.getState().loadModel(cloneModel(bathtubInventoryModel));
  useEditorStore.setState((state) => ({
    ...state,
    activeDockTab: 'chart',
    results,
    activeSimulationMode: 'native_json',
  }));

  useUIStore.setState((state) => ({
    ...state,
    selectedMfaTimestamp: 1,
    mfaTimeAnchorDate: '2021-01-01',
    mfaTimeUnit: 'day',
    mfaMissingValueRule: 'carry_forward',
  }));

  Object.defineProperty(URL, 'createObjectURL', {
    writable: true,
    value: vi.fn(() => 'blob:mock-url'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    writable: true,
    value: vi.fn(() => undefined),
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
});

describe('ResultsDock MFA yaml export', () => {
  it('renders time-series export controls and passes config to export builder', () => {
    const buildSpy = vi.spyOn(mfaExport, 'buildMfaYamlDocument').mockReturnValue({
      title: 'Bathtub Inventory',
      nodes: [],
      links: [{ source: 'a', target: 'b', id: 'a_to_b' }],
      groups: [],
      diagramStyle: {
        timeSeriesEnabled: true,
        selectedTimePoint: '2021-01-02',
        timeSeriesMissingValueRule: 'carry_forward',
      },
    });
    vi.spyOn(mfaExport, 'mfaYamlString').mockReturnValue('title: Bathtub Inventory\nnodes: []\nlinks: []\ngroups: []\ndiagramStyle:\n  timeSeriesEnabled: true\n  timeSeriesMissingValueRule: carry_forward\n');

    render(
      <MantineProvider>
        <ResultsDock />
      </MantineProvider>,
    );

    expect(screen.getByLabelText('Anchor date')).toBeInTheDocument();
    expect(screen.getAllByLabelText('Time unit').length).toBeGreaterThan(0);
    expect(screen.getAllByLabelText('Missing value rule').length).toBeGreaterThan(0);

    fireEvent.change(screen.getByLabelText('Anchor date'), { target: { value: '2024-01-01' } });

    fireEvent.click(screen.getByRole('button', { name: 'Export MFA YAML (Time Series)' }));

    expect(buildSpy).toHaveBeenCalledTimes(1);
    expect(buildSpy).toHaveBeenCalledWith(
      useEditorStore.getState().model,
      results,
      expect.objectContaining({
        requestedTime: 1,
        anchorDate: '2024-01-01',
        timeUnit: 'day',
        missingValueRule: 'carry_forward',
        mode: 'full_series',
      }),
    );
  });

  it('exports selected time slice mode', () => {
    const buildSpy = vi.spyOn(mfaExport, 'buildMfaYamlDocument').mockReturnValue({
      title: 'Bathtub Inventory',
      nodes: [],
      links: [{ source: 'a', target: 'b', id: 'a_to_b' }],
      groups: [],
      diagramStyle: {
        timeSeriesEnabled: false,
        selectedTimePoint: '2021-01-02',
        timeSeriesMissingValueRule: 'carry_forward',
      },
    });
    vi.spyOn(mfaExport, 'mfaYamlString').mockReturnValue('title: Bathtub Inventory\nnodes: []\nlinks: []\ngroups: []\ndiagramStyle:\n  timeSeriesEnabled: false\n  timeSeriesMissingValueRule: carry_forward\n');

    render(
      <MantineProvider>
        <ResultsDock />
      </MantineProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Export MFA YAML (Selected Time Slice)' }));

    expect(buildSpy).toHaveBeenCalledWith(
      useEditorStore.getState().model,
      results,
      expect.objectContaining({
        requestedTime: 1,
        mode: 'time_slice',
      }),
    );
  });

  it('shows Vensim time controls including SAVEPER and reset action', () => {
    useEditorStore.setState((state) => ({
      ...state,
      activeSimulationMode: 'vensim',
      importedVensim: {
        ok: true,
        import_id: 'preset_2',
        source: { filename: 'sample.mdl', format: 'vensim-mdl' },
        capabilities: {
          tier: 'T3',
          supported: [],
          partial: [],
          unsupported: [],
          detected_functions: [],
          detected_time_settings: ['INITIAL TIME', 'FINAL TIME', 'TIME STEP', 'SAVEPER'],
          details: [],
          families: [],
        },
        warnings: [],
        errors: [],
        model_view: {
          canonical: cloneModel(bathtubInventoryModel),
          variables: [],
          time_settings: { initial_time: 1, final_time: 20, time_step: 0.5, saveper: 2 },
          import_gaps: {
            dropped_variables: 0,
            dropped_edges: 0,
            unparsed_equations: 0,
            unsupported_constructs: [],
            samples: [],
          },
        },
      },
    }));

    render(
      <MantineProvider>
        <ResultsDock />
      </MantineProvider>,
    );

    expect(screen.getByLabelText('SAVEPER')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset MDL Settings' })).toBeInTheDocument();
  });
});
