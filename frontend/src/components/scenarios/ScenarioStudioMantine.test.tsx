import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { MantineProvider } from '@mantine/core';
import { ScenarioStudio } from './ScenarioStudioMantine';
import { useEditorStore } from '../../state/editorStore';

describe('ScenarioStudio', () => {
  beforeEach(() => {
    const state = useEditorStore.getState();
    const baseline = state.scenarios.find((s) => s.status === 'baseline') ?? state.scenarios[0];
    useEditorStore.setState({
      scenarios: baseline ? [baseline] : state.scenarios,
      activeScenarioId: baseline?.id ?? state.activeScenarioId,
    });
  });

  it('creates scenario from panel', async () => {
    render(
      <MantineProvider>
        <ScenarioStudio />
      </MantineProvider>,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: /new scenario/i }));
    expect(useEditorStore.getState().scenarios.length).toBeGreaterThan(1);
  });
});
