import type { FunctionCatalogEntry } from '../../types/model';

const CORE_FUNCTIONS: FunctionCatalogEntry[] = [
  {
    key: 'min',
    displayName: 'min',
    template: 'min(a, b)',
    category: 'Math',
    description: 'Returns the smaller of two values.',
    source: 'core',
  },
  {
    key: 'max',
    displayName: 'max',
    template: 'max(a, b)',
    category: 'Math',
    description: 'Returns the larger of two values.',
    source: 'core',
  },
  {
    key: 'abs',
    displayName: 'abs',
    template: 'abs(x)',
    category: 'Math',
    description: 'Returns absolute value.',
    source: 'core',
  },
  {
    key: 'exp',
    displayName: 'exp',
    template: 'exp(x)',
    category: 'Math',
    description: 'Natural exponential.',
    source: 'core',
  },
  {
    key: 'log',
    displayName: 'log',
    template: 'log(x)',
    category: 'Math',
    description: 'Natural logarithm.',
    source: 'core',
  },
  {
    key: 'step',
    displayName: 'step',
    template: 'step(height, time)',
    category: 'Time Inputs',
    description: 'Applies a step change at a given time.',
    source: 'core',
  },
  {
    key: 'ramp',
    displayName: 'ramp',
    template: 'ramp(slope, start, end)',
    category: 'Time Inputs',
    description: 'Linear ramp from start to end time.',
    source: 'core',
  },
  {
    key: 'pulse',
    displayName: 'pulse',
    template: 'pulse(volume, first_time, width)',
    category: 'Time Inputs',
    description: 'Single pulse of specified volume and width.',
    source: 'core',
  },
  {
    key: 'pulse_train',
    displayName: 'pulse_train',
    template: 'pulse_train(height, first_time, interval, last_time)',
    category: 'Time Inputs',
    description: 'Periodic pulses at regular intervals.',
    source: 'core',
  },
  {
    key: 'if_then_else',
    displayName: 'if_then_else',
    template: 'if_then_else(condition, true_value, false_value)',
    category: 'Conditional',
    description: 'Returns true_value if condition is non-zero, otherwise false_value.',
    source: 'core',
  },
  {
    key: 'delay1',
    displayName: 'delay1',
    template: 'delay1(input, delay_time)',
    category: 'Delays',
    description: 'First-order exponential delay.',
    source: 'core',
  },
  {
    key: 'delay3',
    displayName: 'delay3',
    template: 'delay3(input, delay_time)',
    category: 'Delays',
    description: 'Third-order S-shaped delay.',
    source: 'core',
  },
  {
    key: 'delayn',
    displayName: 'delayn',
    template: 'delayn(input, delay_time, order)',
    category: 'Delays',
    description: 'Nth-order delay with configurable order.',
    source: 'core',
  },
  {
    key: 'smooth',
    displayName: 'smooth',
    template: 'smooth(input, smooth_time)',
    category: 'Delays',
    description: 'Exponential smoothing (alias for delay1).',
    source: 'core',
  },
  {
    key: 'smooth3',
    displayName: 'smooth3',
    template: 'smooth3(input, smooth_time)',
    category: 'Delays',
    description: 'Third-order smoothing (alias for delay3).',
    source: 'core',
  },
  {
    key: 'delay_fixed',
    displayName: 'delay_fixed',
    template: 'delay_fixed(input, delay_time, initial_value)',
    category: 'Delays',
    description: 'Pipeline delay — exact time shift of input.',
    source: 'core',
  },
  {
    key: 'sin',
    displayName: 'sin',
    template: 'sin(x)',
    category: 'Math',
    description: 'Sine function (x in radians).',
    source: 'core',
  },
  {
    key: 'cos',
    displayName: 'cos',
    template: 'cos(x)',
    category: 'Math',
    description: 'Cosine function (x in radians).',
    source: 'core',
  },
];

export const coreFunctions = CORE_FUNCTIONS;

function normalizeFunctionName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function buildContextFunctions(): FunctionCatalogEntry[] {
  const deduped = new Map<string, FunctionCatalogEntry>();
  for (const entry of CORE_FUNCTIONS) {
    const key = normalizeFunctionName(entry.key || entry.displayName);
    if (!deduped.has(key)) {
      deduped.set(key, { ...entry, key });
    }
  }

  return [...deduped.values()].sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    return a.displayName.localeCompare(b.displayName);
  });
}

export function normalizeFunctionKey(name: string): string {
  return normalizeFunctionName(name);
}
