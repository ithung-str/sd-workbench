import type { ModelDocument, SimulateResponse } from '../types/model';

type MfaNode = {
  id: string;
  title: string;
  name: string;
  stock?: number;
};

type MfaLink = {
  source: string;
  target: string;
  value: number;
  id: string;
};

type MfaYamlDocument = {
  title: string;
  nodes: MfaNode[];
  links: MfaLink[];
};

function quoteYamlString(value: string): string {
  if (/^[A-Za-z0-9_ .\-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function flowEndpoints(model: ModelDocument): Map<string, { source?: string; target?: string }> {
  const byId = new Map(model.nodes.map((n) => [n.id, n]));
  const map = new Map<string, { source?: string; target?: string }>();

  console.log('[flowEndpoints] Starting analysis');

  for (const node of model.nodes) {
    if (node.type !== 'flow') continue;
    console.log('[flowEndpoints] Flow node:', node.id, 'source_stock_id:', node.source_stock_id, 'target_stock_id:', node.target_stock_id);
    map.set(node.id, {
      source: node.source_stock_id,
      target: node.target_stock_id,
    });
  }

  console.log('[flowEndpoints] After node processing:', Array.from(map.entries()));

  for (const edge of model.edges) {
    if (edge.type !== 'flow_link') continue;
    console.log('[flowEndpoints] Processing flow_link edge:', edge);
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) {
      console.log('[flowEndpoints] Missing node for edge:', edge);
      continue;
    }

    if (source.type === 'flow') {
      console.log('[flowEndpoints] Flow is source, target is:', target.id, target.type);
      const endpoints = map.get(source.id) ?? {};
      endpoints.target = target.id;
      map.set(source.id, endpoints);
      continue;
    }
    if (target.type === 'flow') {
      console.log('[flowEndpoints] Flow is target, source is:', source.id, source.type);
      const endpoints = map.get(target.id) ?? {};
      endpoints.source = source.id;
      map.set(target.id, endpoints);
    }
  }

  console.log('[flowEndpoints] Final result:', Array.from(map.entries()));
  return map;
}

function nearestTimeIndex(time: number[], requestedTime?: number): number {
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

function flowValueAtIndex(series: Record<string, number[]>, flowName: string, equation: string, index: number): number {
  const values = series[flowName];
  if (values && Number.isFinite(values[index])) return values[index];
  const numeric = Number(equation);
  if (Number.isFinite(numeric)) return numeric;
  return 0;
}

function stockValueAtIndex(
  series: Record<string, number[]>,
  nodeName: string,
  initialValue: number | string,
  index: number,
): number | undefined {
  const values = series[nodeName];
  if (values && Number.isFinite(values[index])) return values[index];
  const numericInitial = Number(initialValue);
  if (Number.isFinite(numericInitial)) return numericInitial;
  return undefined;
}

export function buildMfaYamlDocument(
  model: ModelDocument,
  results: SimulateResponse,
  requestedTime?: number,
): MfaYamlDocument {
  console.log('[buildMfaYamlDocument] Starting with model:', model.name);
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const endpoints = flowEndpoints(model);
  const time = results.series.time ?? [];
  const idx = nearestTimeIndex(time, requestedTime);

  const links: MfaLink[] = [];
  const usedNodeIds = new Set<string>();
  const implicitCloudNodes = new Map<string, { id: string; title: string; name: string }>();

  console.log('[buildMfaYamlDocument] Processing flows...');
  for (const node of model.nodes) {
    if (node.type !== 'flow') continue;
    console.log('[buildMfaYamlDocument] Flow node:', node.id);
    const edge = endpoints.get(node.id);
    console.log('[buildMfaYamlDocument] Endpoints for flow:', edge);
    if (!edge?.source && !edge?.target) {
      console.log('[buildMfaYamlDocument] Skipping - both source and target missing');
      continue;
    }

    // Handle source: use existing node or create implicit cloud
    let sourceLabel: string;
    let sourceId: string;
    if (edge?.source) {
      const sourceNode = nodeById.get(edge.source);
      console.log('[buildMfaYamlDocument] Source node:', sourceNode?.id, sourceNode?.type);
      if (!sourceNode) {
        console.log('[buildMfaYamlDocument] Skipping - source node not found');
        continue;
      }
      if (sourceNode.type === 'text') {
        console.log('[buildMfaYamlDocument] Skipping - source is text node');
        continue;
      }
      sourceLabel = sourceNode.type === 'cloud' ? sourceNode.id : sourceNode.label;
      sourceId = sourceNode.id;
      usedNodeIds.add(sourceId);
    } else {
      // Create implicit cloud for missing source
      const cloudId = `cloud_source_${node.id}`;
      const flowLabel = node.label || node.name;
      const boundaryLabel = `${flowLabel} Source`;
      sourceLabel = boundaryLabel;
      sourceId = cloudId;
      if (!implicitCloudNodes.has(cloudId)) {
        implicitCloudNodes.set(cloudId, { id: boundaryLabel, title: boundaryLabel, name: cloudId });
      }
      console.log('[buildMfaYamlDocument] Created implicit cloud for source:', cloudId, 'with label:', boundaryLabel);
    }

    // Handle target: use existing node or create implicit cloud
    let targetLabel: string;
    let targetId: string;
    if (edge?.target) {
      const targetNode = nodeById.get(edge.target);
      console.log('[buildMfaYamlDocument] Target node:', targetNode?.id, targetNode?.type);
      if (!targetNode) {
        console.log('[buildMfaYamlDocument] Skipping - target node not found');
        continue;
      }
      if (targetNode.type === 'text') {
        console.log('[buildMfaYamlDocument] Skipping - target is text node');
        continue;
      }
      targetLabel = targetNode.type === 'cloud' ? targetNode.id : targetNode.label;
      targetId = targetNode.id;
      usedNodeIds.add(targetId);
    } else {
      // Create implicit cloud for missing target
      const cloudId = `cloud_target_${node.id}`;
      const flowLabel = node.label || node.name;
      const boundaryLabel = `${flowLabel} Target`;
      targetLabel = boundaryLabel;
      targetId = cloudId;
      if (!implicitCloudNodes.has(cloudId)) {
        implicitCloudNodes.set(cloudId, { id: boundaryLabel, title: boundaryLabel, name: cloudId });
      }
      console.log('[buildMfaYamlDocument] Created implicit cloud for target:', cloudId, 'with label:', boundaryLabel);
    }

    const link = {
      source: sourceLabel,
      target: targetLabel,
      value: flowValueAtIndex(results.series, node.name, node.equation, idx),
      id: `${sourceLabel}-${targetLabel}`,
    };
    console.log('[buildMfaYamlDocument] Created link:', link);
    links.push(link);
  }
  console.log('[buildMfaYamlDocument] Total links created:', links.length);

  const nodes: MfaNode[] = [
    ...Array.from(usedNodeIds)
      .map((id) => nodeById.get(id))
      .filter((node): node is NonNullable<typeof node> => Boolean(node))
      .map((node) => {
        if (node.type === 'cloud') {
          return { id: node.id, title: node.id, name: node.id };
        }
        if (node.type === 'text') {
          return { id: node.id, title: node.text, name: node.text };
        }
        if (node.type === 'stock') {
          return {
            id: node.label,
            title: node.label,
            name: node.name,
            stock: stockValueAtIndex(results.series, node.name, node.initial_value, idx),
          };
        }
        return {
          id: node.label,
          title: node.label,
          name: node.name,
        };
      }),
    ...Array.from(implicitCloudNodes.values()),
  ];

  const sampledTime = time[idx];
  const title =
    Number.isFinite(sampledTime) && sampledTime !== undefined
      ? `Material Flow Analysis (t=${sampledTime})`
      : 'Material Flow Analysis';

  return { title, nodes, links };
}

export function mfaYamlString(doc: MfaYamlDocument): string {
  const lines: string[] = [];
  lines.push(`title: ${quoteYamlString(doc.title)}`);
  lines.push('nodes:');
  for (const node of doc.nodes) {
    lines.push(`  - id: ${quoteYamlString(node.id)}`);
    lines.push(`    title: ${quoteYamlString(node.title)}`);
    lines.push(`    name: ${quoteYamlString(node.name)}`);
    if (Number.isFinite(node.stock)) {
      lines.push(`    stock: ${node.stock}`);
    }
  }
  lines.push('links:');
  for (const link of doc.links) {
    lines.push(`  - source: ${quoteYamlString(link.source)}`);
    lines.push(`    target: ${quoteYamlString(link.target)}`);
    lines.push(`    value: ${Number.isFinite(link.value) ? link.value : 0}`);
    lines.push(`    id: ${quoteYamlString(link.id)}`);
  }
  return `${lines.join('\n')}\n`;
}
