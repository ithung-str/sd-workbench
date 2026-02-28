import { describe, expect, it, vi, beforeEach } from 'vitest';
import { simulateModel, validateModel } from './api';
import { teacupModel } from './sampleModels';

beforeEach(() => {
  vi.restoreAllMocks();
});

describe('api client', () => {
  it('parses validate response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, errors: [], warnings: [] }) }));
    const res = await validateModel(teacupModel);
    expect(res.ok).toBe(true);
  });

  it('surfaces 422 detail for simulate', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422, json: async () => ({ detail: { errors: [{ code: 'UNKNOWN_SYMBOL' }], warnings: [] } }) }));
    await expect(simulateModel({ model: teacupModel, sim_config: { start: 0, stop: 1, dt: 1, method: 'euler' } })).rejects.toEqual({ errors: [{ code: 'UNKNOWN_SYMBOL' }], warnings: [] });
  });
});
