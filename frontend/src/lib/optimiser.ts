import { simulateModel, simulateScenarioBatch } from './api';
import type {
  EvaluationPoint,
  ModelDocument,
  OptimisationConfig,
  OptimisationResult,
  ParetoPoint,
  PolicyRank,
  ScenarioDefinition,
  SimConfig,
} from '../types/model';

const MAX_EVALUATIONS = 500;
const MAX_CONCURRENCY = 5;

// ── Grid generation ──

export function generateGrid(
  parameters: Array<{ name: string; low: number; high: number; steps: number }>,
): Record<string, number>[] {
  if (parameters.length === 0) return [{}];
  const axes = parameters.map((p) => {
    const vals: number[] = [];
    const steps = Math.max(1, p.steps);
    for (let i = 0; i <= steps; i++) {
      vals.push(p.low + (p.high - p.low) * (i / steps));
    }
    return { name: p.name, values: vals };
  });
  // Cartesian product
  let combos: Record<string, number>[] = [{}];
  for (const axis of axes) {
    const next: Record<string, number>[] = [];
    for (const combo of combos) {
      for (const val of axis.values) {
        next.push({ ...combo, [axis.name]: val });
      }
    }
    combos = next;
  }
  return combos;
}

// ── Metric extraction ──

export function extractMetric(
  series: Record<string, number[]>,
  output: string,
  metric: 'final' | 'max' | 'min' | 'mean',
): number {
  const data = series[output];
  if (!data || data.length === 0) return NaN;
  switch (metric) {
    case 'final':
      return data[data.length - 1];
    case 'max':
      return Math.max(...data);
    case 'min':
      return Math.min(...data);
    case 'mean':
      return data.reduce((a, b) => a + b, 0) / data.length;
  }
}

// ── Param override ──

export function applyParamOverrides(
  model: ModelDocument,
  params: Record<string, number>,
): ModelDocument {
  const nodes = model.nodes.map((node) => {
    if (!('name' in node)) return node;
    const val = params[(node as any).name];
    if (val === undefined) return node;
    if (node.type === 'stock') {
      return { ...node, initial_value: val };
    }
    return { ...node, equation: String(val) };
  });
  return { ...model, nodes };
}

// ── Concurrency-limited runner ──

async function runWithConcurrencyLimit<T>(
  tasks: Array<() => Promise<T>>,
  limit: number,
): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < tasks.length) {
      const idx = nextIndex++;
      results[idx] = await tasks[idx]();
    }
  }

  const workers = Array.from({ length: Math.min(limit, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ── Goal Seek ──

async function runGoalSeek(
  config: OptimisationConfig,
  model: ModelDocument,
  simConfig: SimConfig,
  onProgress: (current: number, total: number) => void,
): Promise<OptimisationResult> {
  const start = Date.now();
  const output = config.output ?? '';
  const metric = config.metric ?? 'final';
  const targetValue = config.target_value ?? 0;
  const grid = generateGrid(config.parameters);
  const total = Math.min(grid.length, MAX_EVALUATIONS);
  const evaluations: EvaluationPoint[] = [];

  // Run baseline first
  const baselineRes = await simulateModel({ model, sim_config: simConfig });
  const baselineSeries = baselineRes.series;

  // Evaluate grid
  const tasks = grid.slice(0, total).map((params, i) => async () => {
    const modified = applyParamOverrides(model, params);
    const res = await simulateModel({ model: modified, sim_config: simConfig });
    const metricValue = extractMetric(res.series, output, metric);
    evaluations.push({ params, metricValue });
    onProgress(i + 1, total);
    return { params, metricValue, series: res.series };
  });

  const results = await runWithConcurrencyLimit(tasks, MAX_CONCURRENCY);

  // Find best
  let bestIdx = 0;
  let bestGap = Infinity;
  for (let i = 0; i < results.length; i++) {
    const gap = Math.abs(results[i].metricValue - targetValue);
    if (gap < bestGap) {
      bestGap = gap;
      bestIdx = i;
    }
  }

  const best = results[bestIdx];
  return {
    configId: config.id,
    mode: 'goal-seek',
    bestParams: best?.params ?? {},
    bestMetric: best?.metricValue ?? NaN,
    targetValue,
    gap: bestGap,
    baselineSeries,
    optimisedSeries: best?.series ?? {},
    evaluations,
    totalEvaluations: total,
    elapsedMs: Date.now() - start,
  };
}

// ── Multi-Objective ──

async function runMultiObjective(
  config: OptimisationConfig,
  model: ModelDocument,
  simConfig: SimConfig,
  onProgress: (current: number, total: number) => void,
): Promise<OptimisationResult> {
  const start = Date.now();
  const objectives = config.objectives ?? [];
  const grid = generateGrid(config.parameters);
  const total = Math.min(grid.length, MAX_EVALUATIONS);
  const evaluations: EvaluationPoint[] = [];

  const tasks = grid.slice(0, total).map((params, i) => async () => {
    const modified = applyParamOverrides(model, params);
    const res = await simulateModel({ model: modified, sim_config: simConfig });
    const objectiveValues: Record<string, number> = {};
    for (const obj of objectives) {
      objectiveValues[obj.id] = extractMetric(res.series, obj.output, obj.metric);
    }
    const point: EvaluationPoint = { params, metricValue: 0, objectiveValues };
    evaluations.push(point);
    onProgress(i + 1, total);
    return { params, objectiveValues };
  });

  const results = await runWithConcurrencyLimit(tasks, MAX_CONCURRENCY);

  // Compute Pareto dominance
  const paretoFrontier: ParetoPoint[] = results.map((r) => ({
    params: r.params,
    objectiveValues: r.objectiveValues,
    dominationRank: 0,
  }));

  // Simple dominance ranking
  for (let i = 0; i < paretoFrontier.length; i++) {
    let dominated = 0;
    for (let j = 0; j < paretoFrontier.length; j++) {
      if (i === j) continue;
      if (dominates(paretoFrontier[j], paretoFrontier[i], objectives)) {
        dominated++;
      }
    }
    paretoFrontier[i].dominationRank = dominated;
  }

  paretoFrontier.sort((a, b) => a.dominationRank - b.dominationRank);

  return {
    configId: config.id,
    mode: 'multi-objective',
    evaluations,
    totalEvaluations: total,
    elapsedMs: Date.now() - start,
    paretoFrontier,
  };
}

function dominates(
  a: ParetoPoint,
  b: ParetoPoint,
  objectives: NonNullable<OptimisationConfig['objectives']>,
): boolean {
  let atLeastOneBetter = false;
  for (const obj of objectives) {
    const av = a.objectiveValues[obj.id] ?? 0;
    const bv = b.objectiveValues[obj.id] ?? 0;
    const better = obj.direction === 'minimize' ? av < bv : av > bv;
    const worse = obj.direction === 'minimize' ? av > bv : av < bv;
    if (worse) return false;
    if (better) atLeastOneBetter = true;
  }
  return atLeastOneBetter;
}

// ── Policy Ranking ──

async function runPolicyRanking(
  config: OptimisationConfig,
  model: ModelDocument,
  simConfig: SimConfig,
  scenarios: ScenarioDefinition[],
  onProgress: (current: number, total: number) => void,
): Promise<OptimisationResult> {
  const start = Date.now();
  const output = config.policy_output ?? config.output ?? '';
  const metric = config.policy_metric ?? config.metric ?? 'final';
  const direction = config.policy_direction ?? 'minimize';

  onProgress(0, scenarios.length);
  const batchRes = await simulateScenarioBatch({
    model,
    sim_config: simConfig,
    scenarios,
    include_baseline: true,
  });
  onProgress(scenarios.length, scenarios.length);

  const ranking: PolicyRank[] = batchRes.runs.map((run) => ({
    scenarioId: run.scenario_id,
    scenarioName: run.scenario_name,
    metricValue: extractMetric(run.series, output, metric),
    rank: 0,
    series: run.series,
  }));

  ranking.sort((a, b) =>
    direction === 'minimize' ? a.metricValue - b.metricValue : b.metricValue - a.metricValue,
  );
  ranking.forEach((r, i) => {
    r.rank = i + 1;
  });

  return {
    configId: config.id,
    mode: 'policy',
    policyRanking: ranking,
    totalEvaluations: ranking.length,
    elapsedMs: Date.now() - start,
  };
}

// ── Main entry point ──

export async function runOptimisation(
  config: OptimisationConfig,
  model: ModelDocument,
  simConfig: SimConfig,
  scenarios: ScenarioDefinition[],
  onProgress: (current: number, total: number) => void,
): Promise<OptimisationResult> {
  switch (config.mode) {
    case 'goal-seek':
      return runGoalSeek(config, model, simConfig, onProgress);
    case 'multi-objective':
      return runMultiObjective(config, model, simConfig, onProgress);
    case 'policy':
      return runPolicyRanking(config, model, simConfig, scenarios, onProgress);
  }
}
