import type { ModelDocument } from '../types/model';

/** Convert an arbitrary string to a valid equation identifier (lowercase, underscores, no leading digits). */
export function toIdentifier(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
  // Ensure it doesn't start with a digit
  if (/^[0-9]/.test(slug)) return `_${slug}`;
  return slug || '_';
}

/** Return the names of variables connected to `nodeId` via edges (excluding text/cloud/cld_symbol). */
export function getConnectedNames(nodeId: string, model: ModelDocument): string[] {
  const neighborIds = new Set<string>();
  for (const edge of model.edges) {
    if (edge.source === nodeId) neighborIds.add(edge.target);
    if (edge.target === nodeId) neighborIds.add(edge.source);
  }
  return model.nodes
    .filter(
      (n) =>
        neighborIds.has(n.id) &&
        n.id !== nodeId &&
        n.type !== 'text' &&
        n.type !== 'cloud' &&
        n.type !== 'cld_symbol',
    )
    .flatMap((n) =>
      n.type === 'text' || n.type === 'cloud' || n.type === 'cld_symbol' || n.type === 'phantom' ? [] : [n.name],
    )
    .filter(Boolean);
}

/**
 * For a stock node, compute the derived flow equation from flow_link edges.
 * Returns e.g. "inflow1 + inflow2 - outflow1" or null if no flows are connected.
 * Mirrors the backend _build_stock_equations logic.
 */
export function getStockFlowEquation(stockId: string, model: ModelDocument): string | null {
  const nodeNameById = new Map<string, string>();
  const flowIds = new Set<string>();
  for (const node of model.nodes) {
    if (node.type === 'text' || node.type === 'cloud' || node.type === 'cld_symbol' || node.type === 'phantom') continue;
    nodeNameById.set(node.id, node.name);
    if (node.type === 'flow') flowIds.add(node.id);
  }

  const inflows: string[] = [];
  const outflows: string[] = [];
  for (const edge of model.edges) {
    if (edge.type !== 'flow_link') continue;
    // stock → flow: outflow
    if (edge.source === stockId && flowIds.has(edge.target)) {
      const name = nodeNameById.get(edge.target);
      if (name) outflows.push(name);
    }
    // flow → stock: inflow
    if (edge.target === stockId && flowIds.has(edge.source)) {
      const name = nodeNameById.get(edge.source);
      if (name) inflows.push(name);
    }
  }

  if (inflows.length === 0 && outflows.length === 0) return null;

  const terms: string[] = [];
  for (const f of inflows) terms.push(f);
  for (const f of outflows) terms.push(`-${f}`);

  let eq = terms[0];
  for (let i = 1; i < terms.length; i++) {
    const t = terms[i];
    eq += t.startsWith('-') ? ` ${t}` : ` + ${t}`;
  }
  return eq;
}

/** Return all variable names valid for use in equations (node names + globals). */
export function getEquationVariableNames(model: ModelDocument): string[] {
  return model.nodes
    .flatMap((n) => (n.type === 'text' || n.type === 'cloud' || n.type === 'cld_symbol' || n.type === 'phantom' ? [] : [n.name]))
    .concat((model.global_variables ?? []).map((v) => v.name))
    .filter(Boolean);
}
