import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  runMonteCarlo,
  runOATSensitivity,
  simulateModel,
  simulateScenarioBatch,
  transformNotebookStream,
  validateModel,
} from './api';
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

  it('parses scenario batch response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, runs: [], errors: [] }) }));
    const res = await simulateScenarioBatch({
      model: teacupModel,
      sim_config: { start: 0, stop: 10, dt: 1, method: 'euler' },
      scenarios: [],
      include_baseline: true,
    });
    expect(res.ok).toBe(true);
  });

  it('parses oat and monte-carlo responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ ok: true, scenario_id: 'baseline', output: 'temperature', metric: 'final', baseline_metric: 1, items: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            ok: true,
            scenario_id: 'baseline',
            output: 'temperature',
            metric: 'final',
            runs: 2,
            seed: 42,
            quantiles: { p05: 1, p25: 1, p50: 1, p75: 1, p95: 1, mean: 1, stddev: 0, min: 1, max: 1 },
            samples: [],
          }),
        }),
    );
    const oat = await runOATSensitivity({
      model: teacupModel,
      sim_config: { start: 0, stop: 10, dt: 1, method: 'euler' },
      scenarios: [],
      output: 'temperature',
      metric: 'final',
      parameters: [],
    });
    const mc = await runMonteCarlo({
      model: teacupModel,
      sim_config: { start: 0, stop: 10, dt: 1, method: 'euler' },
      scenarios: [],
      output: 'temperature',
      metric: 'final',
      runs: 2,
      seed: 42,
      parameters: [],
    });
    expect(oat.ok).toBe(true);
    expect(mc.ok).toBe(true);
  });

  it('parses notebook import progress events from the stream', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(
          [
            'event: analysis',
            'data: {"complexity_tier":"large","code_cell_count":12,"stage_count":3}',
            '',
            'event: stage_plan',
            'data: {"stages":[{"id":"sec_ingest","name":"Load inputs","purpose":"Loads data."},{"id":"sec_prepare","name":"Prepare materials","purpose":"Cleans data."}]}',
            '',
            'event: stage_progress',
            'data: {"stage_id":"sec_ingest","state":"building"}',
            '',
            'event: workflow',
            'data: {"main_path_stage_ids":["sec_ingest","sec_prepare"]}',
            '',
            'event: complete',
            'data: {"ok":true,"sections":[],"nodes":[],"edges":[],"warnings":[]}',
            '',
          ].join('\n'),
        ));
        controller.close();
      },
    });

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, body: stream }));

    const onAnalysis = vi.fn();
    const onStagePlan = vi.fn();
    const onStageProgress = vi.fn();
    const onWorkflow = vi.fn();

    const res = await transformNotebookStream(
      [{ index: 0, cell_type: 'markdown', source: '# Notebook' }],
      'Notebook Import',
      vi.fn(),
      vi.fn(),
      vi.fn(),
      {
        onAnalysis,
        onStagePlan,
        onStageProgress,
        onWorkflow,
      },
    );

    expect(res.ok).toBe(true);
    expect(onAnalysis).toHaveBeenCalledWith(expect.objectContaining({ complexity_tier: 'large', stage_count: 3 }));
    expect(onStagePlan).toHaveBeenCalledTimes(1);
    expect(onStagePlan.mock.calls[0]?.[0]).toEqual({
      stages: [
        { id: 'sec_ingest', name: 'Load inputs', purpose: 'Loads data.' },
        { id: 'sec_prepare', name: 'Prepare materials', purpose: 'Cleans data.' },
      ],
    });
    expect(onStageProgress).toHaveBeenCalledWith({ stage_id: 'sec_ingest', state: 'building' });
    expect(onWorkflow).toHaveBeenCalledWith({ main_path_stage_ids: ['sec_ingest', 'sec_prepare'] });
  });

});
