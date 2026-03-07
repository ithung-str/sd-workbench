import type { AnalysisEdge, AnalysisNode } from '../types/model';

const NODE_SIZES: Partial<Record<AnalysisNode['type'], { width: number; height: number }>> = {
  data_source: { width: 280, height: 200 },
  code: { width: 600, height: 400 },
  sql: { width: 600, height: 350 },
  output: { width: 380, height: 320 },
  note: { width: 300, height: 200 },
  group: { width: 500, height: 400 },
  sheets_export: { width: 320, height: 280 },
  publish: { width: 300, height: 240 },
};

const DEFAULT_SIZE = { width: 320, height: 240 };
const COLUMN_GAP = 80;
const ROW_GAP = 60;
const NOTE_LANE_GAP = 120;
const PLACEHOLDER_STAGE_WIDTH = 360;
const PLACEHOLDER_STAGE_HEIGHT = 240;
const PLACEHOLDER_STAGE_GAP = 140;

export type NotebookImportStagePlaceholder = {
  id: string;
  name: string;
  purpose?: string;
  x: number;
  y: number;
  w: number;
  h: number;
};

export function notebookImportNodeSize(node: AnalysisNode): { width: number; height: number } {
  return NODE_SIZES[node.type] ?? DEFAULT_SIZE;
}

export function layoutNotebookImportStagePlaceholders(
  stages: Array<{ id: string; name: string; purpose?: string }>,
  opts: { originX: number; originY: number },
): NotebookImportStagePlaceholder[] {
  return stages.map((stage, index) => ({
    id: stage.id,
    name: stage.name,
    purpose: stage.purpose,
    x: opts.originX,
    y: opts.originY + index * (PLACEHOLDER_STAGE_HEIGHT + PLACEHOLDER_STAGE_GAP),
    w: PLACEHOLDER_STAGE_WIDTH,
    h: PLACEHOLDER_STAGE_HEIGHT,
  }));
}

function isTerminalType(type: AnalysisNode['type']): boolean {
  return type === 'output' || type === 'publish' || type === 'sheets_export';
}

export function layoutImportedNotebookNodes(
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
  opts: { originX: number; originY: number },
): Record<string, { x: number; y: number }> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const noteNodes = nodes.filter((node) => node.type === 'note');
  const mainNodes = nodes.filter((node) => node.type !== 'note');
  const mainIds = new Set(mainNodes.map((node) => node.id));

  const validEdges = edges.filter((edge) => mainIds.has(edge.source) && mainIds.has(edge.target) && edge.source !== edge.target);
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  const indegree = new Map<string, number>();
  const order = new Map(nodes.map((node, index) => [node.id, index]));
  const rank = new Map<string, number>();

  for (const node of mainNodes) {
    parents.set(node.id, []);
    children.set(node.id, []);
    indegree.set(node.id, 0);
    rank.set(node.id, 0);
  }

  for (const edge of validEdges) {
    parents.get(edge.target)?.push(edge.source);
    children.get(edge.source)?.push(edge.target);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const queue = mainNodes
    .filter((node) => (indegree.get(node.id) ?? 0) === 0)
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const processed = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    processed.add(current.id);
    const currentRank = rank.get(current.id) ?? 0;

    for (const childId of children.get(current.id) ?? []) {
      const childNode = byId.get(childId);
      const nextRank = currentRank + 1;
      rank.set(childId, Math.max(rank.get(childId) ?? 0, nextRank));
      indegree.set(childId, (indegree.get(childId) ?? 0) - 1);
      if ((indegree.get(childId) ?? 0) === 0 && childNode) {
        queue.push(childNode);
        queue.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
      }
    }
  }

  for (const node of mainNodes) {
    if (!processed.has(node.id)) {
      const parentRanks = (parents.get(node.id) ?? []).map((parentId) => rank.get(parentId) ?? 0);
      rank.set(node.id, parentRanks.length > 0 ? Math.max(...parentRanks) + 1 : 0);
    }
    if (isTerminalType(node.type)) {
      const parentRanks = (parents.get(node.id) ?? []).map((parentId) => rank.get(parentId) ?? 0);
      const minTerminalRank = parentRanks.length > 0 ? Math.max(...parentRanks) + 1 : (rank.get(node.id) ?? 0);
      rank.set(node.id, Math.max(rank.get(node.id) ?? 0, minTerminalRank));
    }
  }

  const columns = new Map<number, AnalysisNode[]>();
  for (const node of mainNodes) {
    const col = rank.get(node.id) ?? 0;
    const column = columns.get(col) ?? [];
    column.push(node);
    columns.set(col, column);
  }
  for (const column of columns.values()) {
    column.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
  }

  // Vertical layout: rank determines Y row, items within a rank go side-by-side in X
  const positioned: Record<string, { x: number; y: number }> = {};
  const rowKeys = [...columns.keys()].sort((a, b) => a - b);

  // Compute cumulative Y offset per row (sum of max node heights in preceding rows)
  const rowYStart = new Map<number, number>();
  let cumulativeY = opts.originY;
  for (const row of rowKeys) {
    rowYStart.set(row, cumulativeY);
    const rowNodes = columns.get(row) ?? [];
    const maxHeight = Math.max(...rowNodes.map((n) => notebookImportNodeSize(n).height));
    cumulativeY += maxHeight + ROW_GAP;
  }

  for (const row of rowKeys) {
    const rowNodes = columns.get(row) ?? [];
    let x = opts.originX;
    const y = rowYStart.get(row) ?? opts.originY;
    for (const node of rowNodes) {
      positioned[node.id] = { x, y };
      x += notebookImportNodeSize(node).width + COLUMN_GAP;
    }
  }

  // Notes go in a column to the left
  const topmostY = rowKeys.length > 0 ? (rowYStart.get(rowKeys[0]) ?? opts.originY) : opts.originY;
  let noteY = topmostY;
  for (const note of noteNodes.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))) {
    const size = notebookImportNodeSize(note);
    positioned[note.id] = {
      x: opts.originX - size.width - NOTE_LANE_GAP,
      y: noteY,
    };
    noteY += size.height + ROW_GAP;
  }

  return positioned;
}
