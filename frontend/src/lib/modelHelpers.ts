import { tokenizeEquation, DEFAULT_FUNCTION_NAMES, DEFAULT_RESERVED_NAMES } from '../components/inspector/equationEditorUtils';
import type { EdgeModel, ModelDocument, NodeModel } from '../types/model';

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
    eq += t.startsWith('-') ? ` - ${t.slice(1)}` : ` + ${t}`;
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

// ---------------------------------------------------------------------------
// Auto-sync influence edges from equation references
// ---------------------------------------------------------------------------

const BUILTIN_NAMES = new Set<string>(
  [...DEFAULT_RESERVED_NAMES, ...DEFAULT_FUNCTION_NAMES].map((n) => n.toLowerCase()),
);

/** Extract deduplicated variable-name references from an equation, excluding builtins. */
export function extractEquationRefs(equation: string): string[] {
  if (!equation) return [];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const segment of tokenizeEquation(equation)) {
    if (segment.kind !== 'identifier') continue;
    const text = segment.text;
    if (BUILTIN_NAMES.has(text.toLowerCase())) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    result.push(text);
  }
  return result;
}

/**
 * Compute missing influence edges for a node based on its equation references.
 * Returns the edges array with any new edges appended (never removes edges).
 */
export function syncInfluenceEdgesForNode(
  nodeId: string,
  node: NodeModel,
  allNodes: NodeModel[],
  currentEdges: EdgeModel[],
): EdgeModel[] {
  // Only aux, flow, and lookup trigger auto-edges (not stock — its equation is derived)
  if (node.type !== 'aux' && node.type !== 'flow' && node.type !== 'lookup') {
    return currentEdges;
  }

  const equation = node.equation;
  if (!equation) return currentEdges;

  const referencedNames = extractEquationRefs(equation);
  if (referencedNames.length === 0) return currentEdges;

  // Build name → node map for variable nodes only
  const nodeByName = new Map<string, NodeModel>();
  for (const n of allNodes) {
    if (n.type === 'text' || n.type === 'cloud' || n.type === 'cld_symbol' || n.type === 'phantom') continue;
    nodeByName.set(n.name, n);
  }

  // Track source IDs that already have any edge targeting this node
  const existingSourceIds = new Set<string>();
  for (const edge of currentEdges) {
    if (edge.target === nodeId) {
      existingSourceIds.add(edge.source);
    }
  }

  const validSourceTypes = new Set(['stock', 'aux', 'flow', 'lookup']);
  const newEdges: EdgeModel[] = [];
  const timestamp = Date.now();

  for (const refName of referencedNames) {
    const sourceNode = nodeByName.get(refName);
    if (!sourceNode) continue;
    if (sourceNode.id === nodeId) continue;
    if (existingSourceIds.has(sourceNode.id)) continue;
    if (!validSourceTypes.has(sourceNode.type)) continue;

    newEdges.push({
      id: `e_auto_${timestamp}_${newEdges.length}`,
      type: 'influence',
      source: sourceNode.id,
      target: nodeId,
    });
    existingSourceIds.add(sourceNode.id);
  }

  if (newEdges.length === 0) return currentEdges;
  return [...currentEdges, ...newEdges];
}
