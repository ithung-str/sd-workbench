import { tokenizeEquation } from '../components/inspector/equationEditorUtils';
import type { EdgeModel, ModelDocument, NodeModel } from '../types/model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LinkPolarity = '+' | '-' | '?';

export type LoopLink = {
  sourceId: string;
  sourceName: string;
  targetId: string;
  targetName: string;
  edgeId: string;
  polarity: LinkPolarity;
};

export type DetectedLoop = {
  id: string;
  /** Node IDs in traversal order */
  nodeIds: string[];
  /** Node names in traversal order */
  nodeNames: string[];
  /** Edge IDs in the loop */
  edgeIds: string[];
  /** Links with polarity */
  links: LoopLink[];
  /** R = reinforcing, B = balancing, ? = unknown (has ambiguous links) */
  type: 'R' | 'B' | '?';
};

// ---------------------------------------------------------------------------
// Polarity inference from equations
// ---------------------------------------------------------------------------

/**
 * Infer the polarity of the influence from variable `sourceName` on `targetNode`.
 *
 * Heuristic approach based on equation structure:
 * - If sourceName appears after a '-' operator (subtraction) → negative
 * - If sourceName appears in a denominator (after '/') → negative
 * - Otherwise (addition, multiplication, standalone) → positive
 *
 * For flow_link edges the polarity comes from the structural role:
 * - flow → stock (inflow): the flow adds to the stock → '+'
 * - stock → flow (outflow): stock provides to the flow, but the flow
 *   subtracts from the stock. The link polarity in CLD terms is '+' because
 *   "if the stock increases, the outflow rate equation sees a higher value".
 *   The actual sign depends on the flow's equation referencing the stock.
 */
function inferInfluencePolarity(
  sourceName: string,
  targetNode: NodeModel | undefined,
): LinkPolarity {
  if (!targetNode) return '?';
  const equation = 'equation' in targetNode ? (targetNode as { equation: string }).equation : '';
  if (!equation) return '?';

  return inferPolarityFromEquation(sourceName, equation);
}

/**
 * Analyze an equation string to determine if `variableName` has a positive
 * or negative effect.
 *
 * Strategy: tokenize the equation and look at the operator immediately
 * preceding each occurrence of the variable.
 *
 * Cases:
 *   "A + B"         → B is +
 *   "A - B"         → B is -
 *   "A * B"         → B is + (multiplicative, same direction)
 *   "A / B"         → B is - (denominator, inverse)
 *   "(A - B) * C"   → B is -, C is +
 *   "B"             → + (standalone)
 *   "-B"            → - (negation)
 */
export function inferPolarityFromEquation(
  variableName: string,
  equation: string,
): LinkPolarity {
  const tokens = tokenizeEquation(equation);
  const identifierTokens = tokens.filter((t) => t.kind !== 'whitespace');

  let hasPositive = false;
  let hasNegative = false;

  for (let i = 0; i < identifierTokens.length; i++) {
    const token = identifierTokens[i];
    if (token.kind !== 'identifier' || token.text !== variableName) continue;

    // Look at preceding non-whitespace token
    const prev = i > 0 ? identifierTokens[i - 1] : null;

    if (!prev) {
      // First token in expression → positive
      hasPositive = true;
      continue;
    }

    if (prev.kind === 'operator') {
      const op = prev.text;
      if (op === '-') {
        // Check if this is subtraction (binary) or negation (unary)
        // Unary if prev-prev is an operator, open paren, or doesn't exist
        const prevPrev = i > 1 ? identifierTokens[i - 2] : null;
        if (!prevPrev || prevPrev.kind === 'operator' || prevPrev.kind === 'paren') {
          hasNegative = true; // unary negation
        } else {
          hasNegative = true; // subtraction
        }
      } else if (op === '/') {
        hasNegative = true; // in denominator
      } else {
        // +, *, etc. → positive
        hasPositive = true;
      }
    } else if (prev.kind === 'paren' && prev.text === '(') {
      // After open paren → positive (start of sub-expression)
      hasPositive = true;
    } else if (prev.kind === 'punctuation' && prev.text === ',') {
      // Function argument → positive (we assume functions preserve sign)
      hasPositive = true;
    } else {
      // After another identifier or number (implicit multiplication) → positive
      hasPositive = true;
    }
  }

  if (hasPositive && !hasNegative) return '+';
  if (hasNegative && !hasPositive) return '-';
  if (!hasPositive && !hasNegative) return '?'; // variable not found in equation
  return '?'; // mixed: appears both positively and negatively
}

/**
 * For flow_link edges, determine the polarity.
 * - flow → stock: this is an inflow, polarity is '+' (more flow → more stock)
 * - stock → flow: the stock feeds the flow's equation. Polarity depends on
 *   whether the flow equation uses the stock positively or negatively.
 *   But in standard SD, a stock→flow link means the stock level is an input.
 *   We infer from the flow's equation.
 */
function inferFlowLinkPolarity(
  edge: EdgeModel,
  nodeById: Map<string, NodeModel>,
): LinkPolarity {
  const src = nodeById.get(edge.source);
  const tgt = nodeById.get(edge.target);
  if (!src || !tgt) return '?';

  if (src.type === 'flow' && tgt.type === 'stock') {
    // Inflow: more flow → more stock → positive
    return '+';
  }
  if (src.type === 'stock' && tgt.type === 'flow') {
    // Stock feeds flow equation — infer from equation
    const srcName = 'name' in src ? src.name : '';
    return inferInfluencePolarity(srcName, tgt);
  }
  if (src.type === 'cloud') return '+'; // cloud → flow, structural positive
  if (tgt.type === 'cloud') return '+'; // flow → cloud, structural positive

  return '?';
}

// ---------------------------------------------------------------------------
// Cycle detection (Johnson's algorithm simplified for small SD models)
// ---------------------------------------------------------------------------

/**
 * Find all elementary cycles in a directed graph.
 * Uses a DFS-based approach suitable for small graphs (< 200 nodes).
 * Returns cycles as arrays of node IDs.
 */
function findAllCycles(adjacency: Map<string, string[]>, allNodes: string[]): string[][] {
  const cycles: string[][] = [];
  const MAX_CYCLES = 50; // safety limit

  for (const startNode of allNodes) {
    if (cycles.length >= MAX_CYCLES) break;

    const visited = new Set<string>();
    const path: string[] = [];

    function dfs(node: string): void {
      if (cycles.length >= MAX_CYCLES) return;

      if (node === startNode && path.length > 1) {
        cycles.push([...path]);
        return;
      }

      if (visited.has(node)) return;
      if (path.length > 0 && node < startNode) return; // avoid duplicate cycles

      visited.add(node);
      path.push(node);

      for (const neighbor of adjacency.get(node) ?? []) {
        if (neighbor === startNode && path.length > 1) {
          cycles.push([...path]);
          if (cycles.length >= MAX_CYCLES) return;
        } else if (!visited.has(neighbor) && neighbor >= startNode) {
          dfs(neighbor);
        }
      }

      path.pop();
      visited.delete(node);
    }

    dfs(startNode);
  }

  return cycles;
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Detect all feedback loops in the model, infer polarity from equations,
 * and classify as Reinforcing (R) or Balancing (B).
 */
export function detectLoops(model: ModelDocument): DetectedLoop[] {
  const nodeById = new Map(model.nodes.map((n) => [n.id, n]));

  // Build directed adjacency (skip clouds — they're sources/sinks, not in loops)
  const adjacency = new Map<string, string[]>();
  const edgeLookup = new Map<string, EdgeModel>(); // "source→target" → edge

  const relevantNodes = model.nodes.filter(
    (n) => n.type !== 'cloud' && n.type !== 'text' && n.type !== 'cld_symbol',
  );
  const relevantNodeIds = new Set(relevantNodes.map((n) => n.id));

  for (const node of relevantNodes) {
    adjacency.set(node.id, []);
  }

  for (const edge of model.edges) {
    if (!relevantNodeIds.has(edge.source) || !relevantNodeIds.has(edge.target)) continue;
    adjacency.get(edge.source)?.push(edge.target);
    edgeLookup.set(`${edge.source}→${edge.target}`, edge);
  }

  // Find all cycles
  const sortedNodeIds = [...relevantNodeIds].sort();
  const rawCycles = findAllCycles(adjacency, sortedNodeIds);

  // Deduplicate (same set of nodes in same order, different starting points)
  const seen = new Set<string>();
  const uniqueCycles: string[][] = [];

  for (const cycle of rawCycles) {
    const key = canonicalCycleKey(cycle);
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCycles.push(cycle);
  }

  // Build DetectedLoop for each cycle
  return uniqueCycles.map((cycle, idx) => {
    const links: LoopLink[] = [];
    const edgeIds: string[] = [];

    for (let i = 0; i < cycle.length; i++) {
      const srcId = cycle[i];
      const tgtId = cycle[(i + 1) % cycle.length];
      const edge = edgeLookup.get(`${srcId}→${tgtId}`);
      const srcNode = nodeById.get(srcId);
      const tgtNode = nodeById.get(tgtId);

      let polarity: LinkPolarity = '?';
      if (edge) {
        edgeIds.push(edge.id);
        if (edge.type === 'flow_link') {
          polarity = inferFlowLinkPolarity(edge, nodeById);
        } else {
          const srcName = srcNode && 'name' in srcNode ? (srcNode as { name: string }).name : '';
          polarity = inferInfluencePolarity(srcName, tgtNode);
        }
      }

      links.push({
        sourceId: srcId,
        sourceName: srcNode && 'name' in srcNode ? (srcNode as { name: string }).name : srcId,
        targetId: tgtId,
        targetName: tgtNode && 'name' in tgtNode ? (tgtNode as { name: string }).name : tgtId,
        edgeId: edge?.id ?? '',
        polarity,
      });
    }

    // Classify: product of polarities
    const negativeCount = links.filter((l) => l.polarity === '-').length;
    const hasUnknown = links.some((l) => l.polarity === '?');
    const loopType: DetectedLoop['type'] = hasUnknown
      ? '?'
      : negativeCount % 2 === 0
        ? 'R'
        : 'B';

    return {
      id: `loop_${idx + 1}`,
      nodeIds: cycle,
      nodeNames: cycle.map((id) => {
        const n = nodeById.get(id);
        return n && 'name' in n ? (n as { name: string }).name : id;
      }),
      edgeIds,
      links,
      type: loopType,
    };
  });
}

/** Canonical key for a cycle: rotate to smallest element first, then join. */
function canonicalCycleKey(cycle: string[]): string {
  if (cycle.length === 0) return '';
  let minIdx = 0;
  for (let i = 1; i < cycle.length; i++) {
    if (cycle[i] < cycle[minIdx]) minIdx = i;
  }
  const rotated = [...cycle.slice(minIdx), ...cycle.slice(0, minIdx)];
  return rotated.join('→');
}
