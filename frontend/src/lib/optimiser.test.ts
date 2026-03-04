import { describe, expect, it, vi, beforeEach } from 'vitest';
import { generateGrid, extractMetric, applyParamOverrides, runOptimisation } from './optimiser';
import * as api from './api';
import type { ModelDocument, SimulateResponse, BatchSimulateResponse } from '../types/model';

vi.mock('./api', () => ({
  simulateModel: vi.fn(),
  simulateScenarioBatch: vi.fn(),
}));

// Minimal model fixture for testing
function makeModel(overrides?: Partial<ModelDocument>): ModelDocument {
  return {
    id: 'test',
    name: 'Test Model',
    version: 1,
    nodes: [
      { id: 'stock_a', type: 'stock', name: 'stock_a', label: 'Stock A', equation: '0', initial_value: 100, position: { x: 0, y: 0 } },
      { id: 'aux_b', type: 'aux', name: 'aux_b', label: 'Aux B', equation: '5', position: { x: 100, y: 0 } },
      { id: 'flow_c', type: 'flow', name: 'flow_c', label: 'Flow C', equation: '3', position: { x: 50, y: 50 } },
    ],
    edges: [],
    outputs: ['stock_a'],
    ...overrides,
  };
}

describe('generateGrid', () => {
  it('returns single empty combo when no params', () => {
    expect(generateGrid([])).toEqual([{}]);
  });

  it('generates correct number of points for one parameter', () => {
    const result = generateGrid([{ name: 'x', low: 0, high: 10, steps: 5 }]);
    expect(result.length).toBe(6); // 0,2,4,6,8,10
    expect(result[0]).toEqual({ x: 0 });
    expect(result[5]).toEqual({ x: 10 });
  });

  it('generates cartesian product for two parameters', () => {
    const result = generateGrid([
      { name: 'x', low: 0, high: 1, steps: 1 },
      { name: 'y', low: 0, high: 1, steps: 1 },
    ]);
    expect(result.length).toBe(4); // 2 x 2
    expect(result).toContainEqual({ x: 0, y: 0 });
    expect(result).toContainEqual({ x: 0, y: 1 });
    expect(result).toContainEqual({ x: 1, y: 0 });
    expect(result).toContainEqual({ x: 1, y: 1 });
  });

  it('handles steps=1 producing two points per axis', () => {
    const result = generateGrid([{ name: 'a', low: 5, high: 15, steps: 1 }]);
    expect(result.length).toBe(2);
    expect(result[0]).toEqual({ a: 5 });
    expect(result[1]).toEqual({ a: 15 });
  });
});

describe('extractMetric', () => {
  const series = { output: [1, 4, 2, 8, 5] };

  it('extracts final value', () => {
    expect(extractMetric(series, 'output', 'final')).toBe(5);
  });

  it('extracts max value', () => {
    expect(extractMetric(series, 'output', 'max')).toBe(8);
  });

  it('extracts min value', () => {
    expect(extractMetric(series, 'output', 'min')).toBe(1);
  });

  it('extracts mean value', () => {
    expect(extractMetric(series, 'output', 'mean')).toBe(4);
  });

  it('returns NaN for missing output', () => {
    expect(extractMetric(series, 'nonexistent', 'final')).toBeNaN();
  });

  it('returns NaN for empty series', () => {
    expect(extractMetric({ output: [] }, 'output', 'final')).toBeNaN();
  });
});

describe('applyParamOverrides', () => {
  it('overrides stock initial_value', () => {
    const model = makeModel();
    const result = applyParamOverrides(model, { stock_a: 200 });
    const stock = result.nodes.find((n) => n.id === 'stock_a');
    expect(stock?.type === 'stock' && stock.initial_value).toBe(200);
  });

  it('overrides aux equation', () => {
    const model = makeModel();
    const result = applyParamOverrides(model, { aux_b: 42 });
    const aux = result.nodes.find((n) => n.id === 'aux_b');
    expect(aux?.type === 'aux' && aux.equation).toBe('42');
  });

  it('overrides flow equation', () => {
    const model = makeModel();
    const result = applyParamOverrides(model, { flow_c: 7 });
    const flow = result.nodes.find((n) => n.id === 'flow_c');
    expect(flow?.type === 'flow' && flow.equation).toBe('7');
  });

  it('does not mutate the original model', () => {
    const model = makeModel();
    const origStock = model.nodes.find((n) => n.id === 'stock_a');
    applyParamOverrides(model, { stock_a: 999 });
    const afterStock = model.nodes.find((n) => n.id === 'stock_a');
    expect(afterStock?.type === 'stock' && afterStock.initial_value).toBe(
      origStock?.type === 'stock' ? origStock.initial_value : undefined,
    );
  });

  it('ignores params that do not match any node', () => {
    const model = makeModel();
    const result = applyParamOverrides(model, { nonexistent: 123 });
    expect(result.nodes.length).toBe(model.nodes.length);
  });
});

describe('runGoalSeek', () => {
  beforeEach(() => {
    vi.mocked(api.simulateModel).mockReset();
  });

  it('finds params closest to target', async () => {
    vi.mocked(api.simulateModel).mockImplementation(async (req) => {
      const stockNode = req.model.nodes.find((n: any) => n.id === 'stock_a');
      const iv = stockNode?.type === 'stock' && typeof stockNode.initial_value === 'number' ? stockNode.initial_value : 100;
      return {
        ok: true,
        series: { time: [0, 1], stock_a: [iv, iv * 2] },
        warnings: [],
        metadata: { engine: 'test', row_count: 2, variables_returned: ['time', 'stock_a'] },
      };
    });

    const result = await runOptimisation(
      {
        id: 'test',
        name: 'Test',
        mode: 'goal-seek',
        output: 'stock_a',
        target_value: 200,
        metric: 'final',
        parameters: [{ name: 'stock_a', low: 50, high: 150, steps: 4 }],
      },
      makeModel(),
      { start: 0, stop: 1, dt: 1, method: 'euler' },
      [],
      () => {},
    );

    expect(result.mode).toBe('goal-seek');
    expect(result.bestMetric).toBeDefined();
    expect(result.bestParams).toBeDefined();
    expect(result.totalEvaluations).toBeGreaterThan(0);
    expect(result.elapsedMs).toBeGreaterThanOrEqual(0);
    // Best should be stock_a=100 (gives final=200)
    expect(result.bestParams!.stock_a).toBe(100);
    expect(result.bestMetric).toBe(200);
    expect(result.gap).toBe(0);
  });
});

describe('runPolicyRanking', () => {
  beforeEach(() => {
    vi.mocked(api.simulateScenarioBatch).mockReset();
  });

  it('ranks scenarios by metric', async () => {
    vi.mocked(api.simulateScenarioBatch).mockResolvedValue({
      ok: true,
      runs: [
        { scenario_id: 's1', scenario_name: 'Scenario 1', series: { output: [10, 20, 30] }, warnings: [], metadata: { engine: 'test', row_count: 3, variables_returned: ['output'] } },
        { scenario_id: 's2', scenario_name: 'Scenario 2', series: { output: [5, 10, 15] }, warnings: [], metadata: { engine: 'test', row_count: 3, variables_returned: ['output'] } },
      ],
      errors: [],
    });

    const result = await runOptimisation(
      {
        id: 'test',
        name: 'Policy Test',
        mode: 'policy',
        policy_output: 'output',
        policy_metric: 'final',
        policy_direction: 'minimize',
        parameters: [],
      },
      makeModel(),
      { start: 0, stop: 2, dt: 1, method: 'euler' },
      [
        { id: 's1', name: 'Scenario 1', overrides: {} },
        { id: 's2', name: 'Scenario 2', overrides: {} },
      ],
      () => {},
    );

    expect(result.mode).toBe('policy');
    expect(result.policyRanking).toBeDefined();
    expect(result.policyRanking!.length).toBe(2);
    // Minimizing: s2 (15) should rank first
    expect(result.policyRanking![0].scenarioId).toBe('s2');
    expect(result.policyRanking![0].rank).toBe(1);
    expect(result.policyRanking![1].scenarioId).toBe('s1');
    expect(result.policyRanking![1].rank).toBe(2);
  });
});
