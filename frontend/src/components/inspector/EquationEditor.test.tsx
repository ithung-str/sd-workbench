import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import type { FunctionCatalogEntry } from '../../types/model';
import { EquationEditor } from './EquationEditor';
import { analyzeEquation, getCursorToken, rankSuggestions } from './equationEditorUtils';

function ControlledEditor({
  initial = '',
  variableNames = [],
  connectedVariableNames = [],
  availableFunctions = [],
}: {
  initial?: string;
  variableNames?: string[];
  connectedVariableNames?: string[];
  availableFunctions?: FunctionCatalogEntry[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <EquationEditor
      value={value}
      onChange={setValue}
      variableNames={variableNames}
      connectedVariableNames={connectedVariableNames}
      availableFunctions={availableFunctions}
    />
  );
}

describe('EquationEditor helpers', () => {
  it('extracts cursor token at boundaries', () => {
    expect(getCursorToken('foo+bar', 1)?.token).toBe('foo');
    expect(getCursorToken('foo+bar', 6)?.token).toBe('bar');
    expect(getCursorToken('foo_bar', 5)?.token).toBe('foo_bar');
    expect(getCursorToken('abc', 0)?.token).toBe('abc');
    expect(getCursorToken('abc', 3)?.token).toBe('abc');
  });

  it('ranks suggestions by prefix and connection with fuzzy fallback', () => {
    const ranked = rankSuggestions(
      'co',
      ['completion', 'cost', 'rate_of_completion', 'alpha'],
      new Set(['completion']),
      8,
    );
    expect(ranked[0]).toBe('completion');
    expect(ranked).toContain('rate_of_completion');
  });

  it('detects unknown symbols', () => {
    const analysis = analyzeEquation(
      'completion + completion_rate + min(flow, 2)',
      ['completion', 'flow'],
      new Set(['completion']),
      new Set(['min']),
      new Set(['min']),
    );
    expect(analysis.referencedVariables).toEqual(['completion', 'flow']);
    expect(analysis.unknownVariables).toEqual(['completion_rate']);
  });
});

describe('EquationEditor component', () => {
  it('shows suggestions while typing and summary when not typing token', async () => {
    const user = userEvent.setup();
    render(
      <ControlledEditor
        initial=""
        variableNames={['completion', 'completion_rate', 'stock']}
        connectedVariableNames={['completion']}
      />,
    );

    const editor = screen.getByLabelText(/equation/i);
    await user.click(editor);
    await user.type(editor, 'com');
    expect(screen.getByRole('listbox', { name: /variable suggestions/i })).toBeInTheDocument();

    await user.type(editor, ' ');
    expect(screen.queryByRole('listbox', { name: /variable suggestions/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Equation symbols/i)).toBeInTheDocument();
  });

  it('applies suggestion with keyboard', async () => {
    const user = userEvent.setup();
    render(
      <ControlledEditor
        initial="com"
        variableNames={['completion', 'completion_rate']}
        connectedVariableNames={['completion']}
      />,
    );
    const editor = screen.getByLabelText(/equation/i) as HTMLTextAreaElement;

    await user.click(editor);
    await user.keyboard('{Enter}');

    await waitFor(() => {
      expect(editor.value).toBe('completion');
    });
  });

  it('dismisses suggestions on Escape', async () => {
    const user = userEvent.setup();
    render(<ControlledEditor initial="com" variableNames={['completion', 'completion_rate']} />);
    const editor = screen.getByLabelText(/equation/i);

    await user.click(editor);
    expect(screen.getByRole('listbox', { name: /variable suggestions/i })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox', { name: /variable suggestions/i })).not.toBeInTheDocument();
  });

  it('renders function picker and inserts template at caret with first-arg selection', async () => {
    const user = userEvent.setup();
    render(
      <ControlledEditor
        initial=""
        availableFunctions={[
          {
            key: 'step',
            displayName: 'step',
            template: 'step(height, time)',
            category: 'Time Inputs',
            description: 'step function',
            source: 'core',
          },
        ]}
      />,
    );
    const picker = screen.getByRole('combobox', { name: /insert function/i });
    const editor = screen.getByRole('combobox', { name: /equation/i }) as HTMLTextAreaElement;
    await user.click(editor);
    await user.selectOptions(picker, 'step');

    await waitFor(() => {
      expect(editor.value).toBe('step(height, time)');
    });
    await waitFor(() => {
      expect(editor.selectionStart).toBe(5);
      expect(editor.selectionEnd).toBe(11);
      expect(document.activeElement).toBe(editor);
    });
  });

  it('replaces identifier token when inserting function', async () => {
    const user = userEvent.setup();
    render(
      <ControlledEditor
        initial="pul"
        availableFunctions={[
          {
            key: 'pulse',
            displayName: 'pulse',
            template: 'pulse(volume, first_time, width)',
            category: 'Time Inputs',
            description: 'pulse function',
            source: 'core',
          },
        ]}
      />,
    );
    const picker = screen.getByRole('combobox', { name: /insert function/i });
    const editor = screen.getByRole('combobox', { name: /equation/i }) as HTMLTextAreaElement;
    await user.click(editor);
    editor.setSelectionRange(3, 3);
    await user.selectOptions(picker, 'pulse');

    await waitFor(() => {
      expect(editor.value).toBe('pulse(volume, first_time, width)');
    });
  });
});
