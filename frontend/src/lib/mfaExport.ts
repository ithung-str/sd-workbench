import type { ModelDocument, SimulateResponse } from '../types/model';

export type MfaTimeUnit = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
export type MfaMissingValueRule = 'carry_forward' | 'fallback_scalar' | 'exact';

export type MfaExportOptions = {
  requestedTime?: number;
  anchorDate?: string;
  timeUnit?: MfaTimeUnit;
  missingValueRule?: MfaMissingValueRule;
  mode?: 'full_series' | 'time_slice';
};

type MfaNode = {
  id: string;
  title: string;
  stock?: number;
  stockUnit?: string;
  stockSeries?: Record<string, number>;
};

type MfaLink = {
  source: string;
  target: string;
  value?: number;
  id?: string;
  flowUnit?: string;
  valueSeries?: Record<string, number>;
};

type MfaDiagramStyle = {
  timeSeriesEnabled: boolean;
  selectedTimePoint?: string;
  timeSeriesMissingValueRule: MfaMissingValueRule;
};

export type MfaYamlDocument = {
  title: string;
  nodes: MfaNode[];
  links: MfaLink[];
  groups: [];
  diagramStyle: MfaDiagramStyle;
};

type TimeAxisMapping = {
  dateKeys: string[];
  selectedDate?: string;
  anchorDate: string;
};

function quoteYamlString(value: string): string {
  if (/^[A-Za-z0-9_ .\-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function normalizedUnit(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

function toUtcDate(dateString: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) return null;
  const date = new Date(`${dateString}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function formatIsoDay(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function addUtcMonths(anchor: Date, months: number): Date {
  const year = anchor.getUTCFullYear();
  const month = anchor.getUTCMonth();
  const day = anchor.getUTCDate();

  const first = new Date(Date.UTC(year, month + months, 1));
  const endOfMonth = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  const clampedDay = Math.min(day, endOfMonth);
  return new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), clampedDay));
}

function defaultAnchorDateForTime(time: number[]): string {
  const first = time[0];
  if (Number.isFinite(first) && Number.isInteger(first) && first >= 1900 && first <= 2100) {
    return `${first}-01-01`;
  }
  return '2000-01-01';
}

function timeIndexForRequested(time: number[], requestedTime?: number): number {
  if (time.length === 0) return 0;
  if (requestedTime == null || Number.isNaN(requestedTime)) return time.length - 1;
  let best = 0;
  let bestDist = Number.POSITIVE_INFINITY;
  for (let i = 0; i < time.length; i += 1) {
    const dist = Math.abs(time[i] - requestedTime);
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  }
  return best;
}

function mapTimeToDate(anchor: Date, offset: number, unit: MfaTimeUnit): Date {
  const hourMs = 60 * 60 * 1000;
  const dayMs = 24 * hourMs;

  if (unit === 'hour') {
    return new Date(anchor.getTime() + Math.round(offset * hourMs));
  }
  if (unit === 'day') {
    return new Date(anchor.getTime() + Math.round(offset * dayMs));
  }
  if (unit === 'week') {
    return new Date(anchor.getTime() + Math.round(offset * 7 * dayMs));
  }

  const isNearlyInteger = Math.abs(offset - Math.round(offset)) < 1e-9;
  if (unit === 'month') {
    if (isNearlyInteger) return addUtcMonths(anchor, Math.round(offset));
    return new Date(anchor.getTime() + Math.round(offset * 30.4375 * dayMs));
  }
  if (unit === 'quarter') {
    if (isNearlyInteger) return addUtcMonths(anchor, Math.round(offset) * 3);
    return new Date(anchor.getTime() + Math.round(offset * 91.3125 * dayMs));
  }
  if (isNearlyInteger) {
    return addUtcMonths(anchor, Math.round(offset) * 12);
  }
  return new Date(anchor.getTime() + Math.round(offset * 365.25 * dayMs));
}

function buildTimeAxisMapping(time: number[], options: MfaExportOptions): TimeAxisMapping {
  const unit = options.timeUnit ?? 'day';
  const resolvedAnchor = options.anchorDate?.trim() || defaultAnchorDateForTime(time);
  const parsedAnchor = toUtcDate(resolvedAnchor) ?? toUtcDate(defaultAnchorDateForTime(time)) ?? new Date('2000-01-01T00:00:00.000Z');

  if (time.length === 0) {
    return { dateKeys: [], anchorDate: formatIsoDay(parsedAnchor) };
  }

  const start = time[0];
  const dateKeys = time.map((value) => {
    const offset = Number.isFinite(value) && Number.isFinite(start) ? value - start : 0;
    return formatIsoDay(mapTimeToDate(parsedAnchor, offset, unit));
  });

  const selectedIndex = timeIndexForRequested(time, options.requestedTime);
  return {
    dateKeys,
    selectedDate: dateKeys[selectedIndex],
    anchorDate: formatIsoDay(parsedAnchor),
  };
}

function flowEndpoints(model: ModelDocument): Map<string, { source?: string; target?: string }> {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const map = new Map<string, { source?: string; target?: string }>();

  for (const node of model.nodes) {
    if (node.type !== 'flow') continue;
    map.set(node.id, {
      source: node.source_stock_id,
      target: node.target_stock_id,
    });
  }

  for (const edge of model.edges) {
    if (edge.type !== 'flow_link') continue;
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;

    if (source.type === 'flow') {
      const endpoints = map.get(source.id) ?? {};
      endpoints.target = target.id;
      map.set(source.id, endpoints);
      continue;
    }
    if (target.type === 'flow') {
      const endpoints = map.get(target.id) ?? {};
      endpoints.source = source.id;
      map.set(target.id, endpoints);
    }
  }

  return map;
}

function withMissingRule(
  dateKeys: string[],
  values: number[] | undefined,
  fallback: number | undefined,
  rule: MfaMissingValueRule,
): Record<string, number> {
  const output: Record<string, number> = {};
  let previousValue: number | undefined;

  for (let i = 0; i < dateKeys.length; i += 1) {
    const raw = values?.[i];
    const hasRaw = Number.isFinite(raw);

    if (hasRaw) {
      previousValue = raw;
      output[dateKeys[i]] = raw as number;
      continue;
    }

    if (rule === 'exact') {
      continue;
    }

    if (rule === 'carry_forward') {
      const next = previousValue ?? fallback;
      if (Number.isFinite(next)) {
        previousValue = next;
        output[dateKeys[i]] = next as number;
      }
      continue;
    }

    if (Number.isFinite(fallback)) {
      output[dateKeys[i]] = fallback as number;
    }
  }

  return output;
}

function stockFallback(initialValue: number | string): number | undefined {
  const value = Number(initialValue);
  return Number.isFinite(value) ? value : undefined;
}

function flowFallback(equation: string): number | undefined {
  const value = Number(equation);
  return Number.isFinite(value) ? value : undefined;
}

function pickScalar(
  atDate: string | undefined,
  series: Record<string, number>,
  fallback: number | undefined,
): number | undefined {
  if (atDate && Number.isFinite(series[atDate])) return series[atDate];
  if (Number.isFinite(fallback)) return fallback;
  return undefined;
}

export function buildMfaYamlDocument(
  model: ModelDocument,
  results: SimulateResponse,
  options: MfaExportOptions = {},
): MfaYamlDocument {
  const rule = options.missingValueRule ?? 'carry_forward';
  const mode = options.mode ?? 'full_series';
  const time = results.series.time ?? [];
  const timeAxis = buildTimeAxisMapping(time, options);

  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const endpoints = flowEndpoints(model);

  const links: MfaLink[] = [];
  const usedNodeIds = new Set<string>();
  const implicitCloudNodes = new Map<string, { id: string; title: string }>();

  for (const node of model.nodes) {
    if (node.type !== 'flow') continue;
    const edge = endpoints.get(node.id);
    if (!edge?.source && !edge?.target) continue;

    let sourceId: string;
    if (edge?.source) {
      const sourceNode = nodeById.get(edge.source);
      if (!sourceNode) continue;
      if (sourceNode.type === 'text' || sourceNode.type === 'cld_symbol') continue;
      sourceId = sourceNode.id;
      usedNodeIds.add(sourceNode.id);
    } else {
      sourceId = `cloud_source_${node.id}`;
      if (!implicitCloudNodes.has(sourceId)) {
        const flowLabel = node.label || node.name;
        implicitCloudNodes.set(sourceId, { id: sourceId, title: `${flowLabel} Source` });
      }
    }

    let targetId: string;
    if (edge?.target) {
      const targetNode = nodeById.get(edge.target);
      if (!targetNode) continue;
      if (targetNode.type === 'text' || targetNode.type === 'cld_symbol') continue;
      targetId = targetNode.id;
      usedNodeIds.add(targetNode.id);
    } else {
      targetId = `cloud_target_${node.id}`;
      if (!implicitCloudNodes.has(targetId)) {
        const flowLabel = node.label || node.name;
        implicitCloudNodes.set(targetId, { id: targetId, title: `${flowLabel} Target` });
      }
    }

    const fallback = flowFallback(node.equation);
    const valueSeries = withMissingRule(timeAxis.dateKeys, results.series[node.name], fallback, rule);
    const scalarValue = pickScalar(timeAxis.selectedDate, valueSeries, fallback);

    links.push({
      id: `${sourceId}_to_${targetId}`,
      source: sourceId,
      target: targetId,
      value: scalarValue,
      flowUnit: normalizedUnit(node.units),
      valueSeries: mode === 'full_series' && Object.keys(valueSeries).length > 0 ? valueSeries : undefined,
    });
  }

  const nodes: MfaNode[] = [
    ...Array.from(usedNodeIds)
      .map((id) => nodeById.get(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .map((node) => {
        if (node.type === 'cloud') {
          return { id: node.id, title: node.id };
        }

        if (node.type === 'stock') {
          const fallback = stockFallback(node.initial_value);
          const stockSeries = withMissingRule(timeAxis.dateKeys, results.series[node.name], fallback, rule);
          const scalarStock = pickScalar(timeAxis.selectedDate, stockSeries, fallback);
          return {
            id: node.id,
            title: node.label,
            stock: scalarStock,
            stockUnit: normalizedUnit(node.units),
            stockSeries: mode === 'full_series' && Object.keys(stockSeries).length > 0 ? stockSeries : undefined,
          };
        }

        if (node.type === 'text') {
          return { id: node.id, title: node.text };
        }

        if (node.type === 'cld_symbol') {
          return { id: node.id, title: node.name?.trim() || `CLD ${node.symbol}` };
        }

        return { id: node.id, title: node.label };
      }),
    ...Array.from(implicitCloudNodes.values()),
  ];

  const title = model.name?.trim() || 'Model';

  return {
    title,
    nodes,
    links,
    groups: [],
    diagramStyle: {
      timeSeriesEnabled: mode === 'full_series',
      selectedTimePoint: timeAxis.selectedDate,
      timeSeriesMissingValueRule: rule,
    },
  };
}

export function mfaYamlString(doc: MfaYamlDocument): string {
  const lines: string[] = [];
  lines.push(`title: ${quoteYamlString(doc.title)}`);
  lines.push('nodes:');
  for (const node of doc.nodes) {
    lines.push(`  - id: ${quoteYamlString(node.id)}`);
    lines.push(`    title: ${quoteYamlString(node.title)}`);
    if (Number.isFinite(node.stock)) {
      lines.push(`    stock: ${node.stock}`);
    }
    if (node.stockUnit) {
      lines.push(`    stockUnit: ${quoteYamlString(node.stockUnit)}`);
    }
    if (node.stockSeries && Object.keys(node.stockSeries).length > 0) {
      lines.push('    stockSeries:');
      for (const [timeKey, value] of Object.entries(node.stockSeries)) {
        lines.push(`      ${JSON.stringify(timeKey)}: ${Number.isFinite(value) ? value : 0}`);
      }
    }
  }

  lines.push('links:');
  for (const link of doc.links) {
    lines.push(`  - source: ${quoteYamlString(link.source)}`);
    lines.push(`    target: ${quoteYamlString(link.target)}`);
    if (Number.isFinite(link.value)) {
      lines.push(`    value: ${link.value}`);
    }
    if (link.id) {
      lines.push(`    id: ${quoteYamlString(link.id)}`);
    }
    if (link.flowUnit) {
      lines.push(`    flowUnit: ${quoteYamlString(link.flowUnit)}`);
    }
    if (link.valueSeries && Object.keys(link.valueSeries).length > 0) {
      lines.push('    valueSeries:');
      for (const [timeKey, value] of Object.entries(link.valueSeries)) {
        lines.push(`      ${JSON.stringify(timeKey)}: ${Number.isFinite(value) ? value : 0}`);
      }
    }
  }

  lines.push('groups: []');
  lines.push('diagramStyle:');
  lines.push(`  timeSeriesEnabled: ${doc.diagramStyle.timeSeriesEnabled ? 'true' : 'false'}`);
  if (doc.diagramStyle.selectedTimePoint) {
    lines.push(`  selectedTimePoint: ${JSON.stringify(doc.diagramStyle.selectedTimePoint)}`);
  }
  lines.push(`  timeSeriesMissingValueRule: ${doc.diagramStyle.timeSeriesMissingValueRule}`);

  return `${lines.join('\n')}\n`;
}
