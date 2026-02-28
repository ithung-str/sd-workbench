import type { FunctionCatalogEntry, VensimImportResponse } from '../../types/model';

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
];

const KNOWN_TEMPLATES: Record<string, string> = {
  min: 'min(a, b)',
  max: 'max(a, b)',
  abs: 'abs(x)',
  exp: 'exp(x)',
  log: 'log(x)',
  step: 'step(height, time)',
  ramp: 'ramp(slope, start, end)',
  pulse: 'pulse(volume, first_time, width)',
  pulse_train: 'pulse_train(volume, first_time, interval, width, end_time)',
  delay1: 'delay1(input, delay_time)',
  delay3: 'delay3(input, delay_time)',
  delayn: 'delayn(input, delay_time, order)',
  smooth: 'smooth(input, smooth_time)',
  smooth3: 'smooth3(input, smooth_time)',
  smoothn: 'smoothn(input, smooth_time, order)',
  random_uniform: 'random_uniform(min, max, seed)',
  random_normal: 'random_normal(mean, stddev, seed)',
};

const FAMILY_TO_CATEGORY: Record<string, FunctionCatalogEntry['category']> = {
  time: 'Time Inputs',
  'time settings': 'Time Inputs',
  delays: 'Delays/Smoothing',
  smoothing: 'Delays/Smoothing',
  stochastic: 'Stochastic',
  random: 'Stochastic',
  lookup: 'Lookups',
  lookups: 'Lookups',
  math: 'Math',
};

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

function inferCategory(normalizedName: string, family?: string): FunctionCatalogEntry['category'] {
  const familyKey = family?.trim().toLowerCase();
  if (familyKey && FAMILY_TO_CATEGORY[familyKey]) {
    return FAMILY_TO_CATEGORY[familyKey];
  }
  if (normalizedName.startsWith('delay') || normalizedName.startsWith('smooth')) return 'Delays/Smoothing';
  if (normalizedName.startsWith('random')) return 'Stochastic';
  if (normalizedName.includes('lookup')) return 'Lookups';
  if (normalizedName === 'step' || normalizedName === 'ramp' || normalizedName.startsWith('pulse')) return 'Time Inputs';
  return 'Other Detected';
}

function templateForFunction(normalizedName: string): string {
  const known = KNOWN_TEMPLATES[normalizedName];
  if (known) return known;
  if (!normalizedName) return 'function_name(x)';
  return `${normalizedName}(x)`;
}

function catalogFromVensim(importedVensim: VensimImportResponse): FunctionCatalogEntry[] {
  const fromDetails = importedVensim.capabilities.details ?? [];
  if (fromDetails.length > 0) {
    return fromDetails.map((detail) => {
      const normalizedName = normalizeFunctionName(detail.function);
      return {
        key: normalizedName,
        displayName: detail.function,
        template: templateForFunction(normalizedName),
        category: inferCategory(normalizedName, detail.family),
        description: detail.notes || `Detected Vensim function in ${detail.family} family.`,
        source: 'vensim',
      } satisfies FunctionCatalogEntry;
    });
  }

  return importedVensim.capabilities.detected_functions.map((fn) => {
    const normalizedName = normalizeFunctionName(fn);
    return {
      key: normalizedName,
      displayName: fn,
      template: templateForFunction(normalizedName),
      category: inferCategory(normalizedName),
      description: 'Detected from imported Vensim model.',
      source: 'vensim',
    } satisfies FunctionCatalogEntry;
  });
}

export function buildContextFunctions(
  activeSimulationMode: 'native_json' | 'vensim',
  importedVensim: VensimImportResponse | null,
): FunctionCatalogEntry[] {
  const merged = [...CORE_FUNCTIONS];

  if (activeSimulationMode === 'vensim' && importedVensim) {
    merged.push(...catalogFromVensim(importedVensim));
  }

  const deduped = new Map<string, FunctionCatalogEntry>();
  for (const entry of merged) {
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
