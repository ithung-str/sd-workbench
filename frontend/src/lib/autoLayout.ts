import dagre from 'dagre';
import type { EdgeModel, ModelDocument, NodeModel } from '../types/model';

// ---------------------------------------------------------------------------
// Node dimensions (match CSS)
// ---------------------------------------------------------------------------

const NODE_SIZES: Record<string, { width: number; height: number }> = {
  stock: { width: 220, height: 50 },
  flow: { width: 62, height: 62 },
  aux: { width: 120, height: 40 },
  lookup: { width: 160, height: 60 },
  cloud: { width: 40, height: 30 },
  text: { width: 140, height: 40 },
  cld_symbol: { width: 40, height: 40 },
};

const DEFAULT_SIZE = { width: 120, height: 50 };

function nodeSize(type: string) {
  return NODE_SIZES[type] ?? DEFAULT_SIZE;
}

// ---------------------------------------------------------------------------
// Graph analysis helpers
// ---------------------------------------------------------------------------

type NodeById = Map<string, NodeModel>;

/**
 * Extract the stock-flow backbone: ordered chains of [cloud?] → flow → stock → flow → stock → flow → [cloud?]
 * Each chain is a sequence of node IDs following flow_link edges.
 */
function extractFlowChains(nodes: NodeById, edges: EdgeModel[]): string[][] {
  const flowLinks = edges.filter((e) => e.type === 'flow_link');
  // Build adjacency for flow_links only
  const fwd = new Map<string, string[]>(); // source → targets
  const rev = new Map<string, string[]>(); // target → sources
  for (const e of flowLinks) {
    fwd.set(e.source, [...(fwd.get(e.source) ?? []), e.target]);
    rev.set(e.target, [...(rev.get(e.target) ?? []), e.source]);
  }

  // Find chain starting points: nodes with no incoming flow_link (or clouds)
  const visited = new Set<string>();
  const chains: string[][] = [];

  // Start from nodes that have outgoing flow_links but no incoming ones
  const allInChain = new Set([...fwd.keys(), ...Array.from(rev.values()).flat()]);
  const startNodes = [...allInChain].filter((id) => !rev.has(id) || rev.get(id)!.length === 0);

  // If no clear start (circular), pick any unvisited node in a flow_link
  if (startNodes.length === 0 && allInChain.size > 0) {
    startNodes.push(allInChain.values().next().value!);
  }

  for (const start of startNodes) {
    if (visited.has(start)) continue;
    const chain: string[] = [];
    let current: string | undefined = start;
    while (current && !visited.has(current)) {
      visited.add(current);
      chain.push(current);
      const nexts: string[] = fwd.get(current) ?? [];
      current = nexts.find((n: string) => !visited.has(n));
    }
    if (chain.length > 0) chains.push(chain);
  }

  return chains;
}

/**
 * For each flow node in a chain, find its cloud (source/sink not in the chain).
 */
function findCloudPartners(
  chains: string[][],
  edges: EdgeModel[],
  nodes: NodeById,
): Map<string, { cloudId: string; side: 'before' | 'after' }> {
  const chainNodeSet = new Set(chains.flat());
  const result = new Map<string, { cloudId: string; side: 'before' | 'after' }>();
  const flowLinks = edges.filter((e) => e.type === 'flow_link');

  for (const e of flowLinks) {
    const srcNode = nodes.get(e.source);
    const tgtNode = nodes.get(e.target);
    if (srcNode?.type === 'cloud' && !chainNodeSet.has(srcNode.id)) {
      // Cloud feeds into the target (a flow or stock)
      result.set(e.target, { cloudId: srcNode.id, side: 'before' });
    }
    if (tgtNode?.type === 'cloud' && !chainNodeSet.has(tgtNode.id)) {
      // Node drains into a cloud
      result.set(e.source, { cloudId: tgtNode.id, side: 'after' });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main layout algorithm
// ---------------------------------------------------------------------------

/**
 * Compute an SD-aware hierarchical layout.
 *
 * Design principles:
 * 1. Stock-flow chains form the horizontal backbone (left → right).
 *    flow_link edges get high weight so dagre keeps them tightly aligned.
 * 2. Influence edges (causal arrows) get low weight — they inform rank
 *    ordering but don't distort the backbone.
 * 3. Clouds are placed immediately next to their flow, on the opposite side
 *    from the stock.
 * 4. Aux/lookup nodes hang off the backbone via influence edges, naturally
 *    placed above or below.
 * 5. Text and CLD symbols are placed with minimal constraints.
 */
export function computeAutoLayout(
  model: ModelDocument,
): Array<{ id: string; x: number; y: number }> {
  const nodeById: NodeById = new Map(model.nodes.map((n) => [n.id, n]));
  const chains = extractFlowChains(nodeById, model.edges);
  const cloudPartners = findCloudPartners(chains, model.edges, nodeById);

  // Collect cloud IDs that we'll position manually (not via dagre)
  const manualCloudIds = new Set<string>();
  for (const { cloudId } of cloudPartners.values()) {
    manualCloudIds.add(cloudId);
  }

  const g = new dagre.graphlib.Graph();
  g.setGraph({
    rankdir: 'LR',
    nodesep: 50, // vertical spacing between nodes in same rank
    ranksep: 100, // horizontal spacing between ranks
    edgesep: 20,
    marginx: 60,
    marginy: 60,
    ranker: 'network-simplex',
  });
  g.setDefaultEdgeLabel(() => ({}));

  // Add nodes (skip clouds that will be manually positioned)
  for (const node of model.nodes) {
    if (manualCloudIds.has(node.id)) continue;
    const size = nodeSize(node.type);
    g.setNode(node.id, { width: size.width, height: size.height });
  }

  // Add edges with SD-aware weighting
  for (const edge of model.edges) {
    if (manualCloudIds.has(edge.source) || manualCloudIds.has(edge.target)) continue;

    if (edge.type === 'flow_link') {
      // High weight + short min-length: keeps stock-flow chains tight and aligned
      g.setEdge(edge.source, edge.target, { weight: 10, minlen: 1 });
    } else {
      // Influence edges: low weight, allow more separation
      // This prevents aux nodes from pushing apart stock-flow chains
      g.setEdge(edge.source, edge.target, { weight: 1, minlen: 1 });
    }
  }

  dagre.layout(g);

  // Collect dagre results
  const result: Array<{ id: string; x: number; y: number }> = [];
  for (const node of model.nodes) {
    if (manualCloudIds.has(node.id)) continue;
    const pos = g.node(node.id);
    if (pos) {
      const size = nodeSize(node.type);
      result.push({
        id: node.id,
        x: Math.round(pos.x - size.width / 2),
        y: Math.round(pos.y - size.height / 2),
      });
    }
  }

  // Position clouds relative to their flow partner
  const posMap = new Map(result.map((p) => [p.id, p]));
  for (const [partnerId, { cloudId, side }] of cloudPartners) {
    const partnerPos = posMap.get(partnerId);
    if (!partnerPos) continue;

    const partnerSize = nodeSize(nodeById.get(partnerId)?.type ?? 'flow');
    const cloudSize = nodeSize('cloud');

    // Place cloud horizontally adjacent to the partner, vertically centered
    const gap = 30;
    const x =
      side === 'before'
        ? partnerPos.x - cloudSize.width - gap
        : partnerPos.x + partnerSize.width + gap;
    const y = partnerPos.y + (partnerSize.height - cloudSize.height) / 2;

    result.push({ id: cloudId, x: Math.round(x), y: Math.round(y) });
  }

  return result;
}
