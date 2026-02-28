import { describe, expect, it } from 'vitest';
import type { VensimImportResponse } from '../../types/model';
import { buildContextFunctions, normalizeFunctionKey } from './functionCatalog';

function makeImport(overrides?: Partial<VensimImportResponse>): VensimImportResponse {
  return {
    ok: true,
    import_id: 'imp_1',
    source: { filename: 'x.mdl', format: 'vensim-mdl' },
    capabilities: {
      tier: 'T1',
      supported: [],
      partial: [],
      unsupported: [],
      detected_functions: [],
      detected_time_settings: [],
      details: [],
      families: [],
    },
    warnings: [],
    errors: [],
    model_view: { variables: [] },
    ...overrides,
  };
}

describe('functionCatalog', () => {
  it('returns core functions only in native mode', () => {
    const functions = buildContextFunctions('native_json', null);
    expect(functions.length).toBeGreaterThan(0);
    expect(functions.some((entry) => entry.source === 'vensim')).toBe(false);
    expect(functions.find((entry) => entry.key === 'min')?.template).toBe('min(a, b)');
  });

  it('merges and deduplicates Vensim detail functions', () => {
    const imported = makeImport({
      capabilities: {
        tier: 'T1',
        supported: [],
        partial: [],
        unsupported: [],
        detected_functions: ['MAX'],
        detected_time_settings: [],
        details: [
          {
            function: 'MAX',
            family: 'math',
            support_mode: 'pysd',
            pysd_support: 'yes',
            deterministic: true,
            dimensional: false,
            count: 1,
            severity: 'info',
            notes: 'ok',
          },
          {
            function: 'PULSE TRAIN',
            family: 'time',
            support_mode: 'native_fallback',
            pysd_support: 'partial',
            deterministic: true,
            dimensional: false,
            count: 1,
            severity: 'warning',
            notes: 'fallback',
          },
        ],
        families: [],
      },
    });

    const functions = buildContextFunctions('vensim', imported);
    expect(functions.filter((entry) => entry.key === 'max')).toHaveLength(1);
    expect(functions.find((entry) => entry.key === 'pulse_train')?.template).toBe(
      'pulse_train(volume, first_time, interval, width, end_time)',
    );
  });

  it('normalizes spaced names', () => {
    expect(normalizeFunctionKey('  PULSE TRAIN  ')).toBe('pulse_train');
  });
});
