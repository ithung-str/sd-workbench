/**
 * Format a number for display in dashboards and charts.
 * Uses compact notation for large/small numbers, otherwise shows up to `digits` significant decimals.
 */
export function formatValue(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return 'N/A';
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs >= 1e6) return formatCompact(value);
  if (abs >= 1) return value.toLocaleString(undefined, { maximumFractionDigits: digits });
  if (abs >= 0.01) return value.toFixed(digits);
  return value.toExponential(digits);
}

/** Compact format: 1.2M, 45.3K, etc. */
export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return 'N/A';
  const abs = Math.abs(value);
  if (abs >= 1e9) return `${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(value / 1e3).toFixed(1)}K`;
  return value.toFixed(1);
}
