import { describe, expect, it } from 'vitest';
import { buildSensitivityOutputOptions } from './SensitivityPanelMantine';

describe('buildSensitivityOutputOptions', () => {
  it('deduplicates output names across model outputs and node names', () => {
    const options = buildSensitivityOutputOptions(
      ['temperature', 'inventory', 'temperature'],
      ['temperature', 'flow_rate', 'inventory'],
    );

    expect(options).toEqual(['temperature', 'inventory', 'flow_rate']);
  });

  it('filters blank values and trims names', () => {
    const options = buildSensitivityOutputOptions([' temperature ', '', '  '], ['temperature', 'x']);
    expect(options).toEqual(['temperature', 'x']);
  });
});
