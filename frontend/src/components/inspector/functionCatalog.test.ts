import { describe, expect, it } from 'vitest';
import { buildContextFunctions, normalizeFunctionKey } from './functionCatalog';

describe('functionCatalog', () => {
  it('returns core functions', () => {
    const functions = buildContextFunctions();
    expect(functions.length).toBeGreaterThan(0);
    expect(functions.find((entry) => entry.key === 'min')?.template).toBe('min(a, b)');
  });

  it('normalizes spaced names', () => {
    expect(normalizeFunctionKey('  PULSE TRAIN  ')).toBe('pulse_train');
  });
});
