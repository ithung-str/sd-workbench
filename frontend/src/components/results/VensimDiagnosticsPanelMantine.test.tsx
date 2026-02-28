import { render, screen } from '@testing-library/react';
import { MantineProvider } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { VensimDiagnosticsPanel } from './VensimDiagnosticsPanelMantine';
import type { VensimImportResponse } from '../../types/model';

const imported: VensimImportResponse = {
  ok: true,
  import_id: 'i1',
  source: { filename: 'demo.mdl', format: 'vensim-mdl' },
  capabilities: {
    tier: 'T2',
    supported: ['STEP'],
    partial: ['RANDOM NORMAL'],
    unsupported: [],
    detected_functions: ['STEP', 'RANDOM NORMAL'],
    detected_time_settings: ['INITIAL TIME'],
    families: [{ family: 'stochastic', functions: ['RANDOM NORMAL'], highest_severity: 'warning', support_mode: 'native_fallback' }],
    details: [
      {
        function: 'RANDOM NORMAL',
        family: 'stochastic',
        support_mode: 'native_fallback',
        pysd_support: 'partial',
        deterministic: false,
        dimensional: false,
        count: 1,
        severity: 'warning',
        notes: 'fallback',
      },
    ],
  },
  warnings: [],
  errors: [],
  model_view: { variables: [], dimensions: [], dependency_graph: { edges: [] } },
};

describe('VensimDiagnosticsPanel', () => {
  it('renders readiness and fallback mode', () => {
    render(
      <MantineProvider>
        <VensimDiagnosticsPanel imported={imported} executionMode="mixed" fallbackActivations={['RANDOM NORMAL']} />
      </MantineProvider>,
    );
    expect(screen.getByText(/Compatibility Diagnostics/i)).toBeInTheDocument();
    expect(screen.getByText(/Execution mode/i)).toBeInTheDocument();
    expect(screen.getByText(/stochastic/i)).toBeInTheDocument();
  });
});
