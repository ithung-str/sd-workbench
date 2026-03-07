import type { NotebookCell } from './api';
import { notebookImportNodeSize } from './notebookImportLayout';
import type { AnalysisEdge, AnalysisNode } from '../types/model';

const GROUP_PADDING_X = 32;
const GROUP_PADDING_Y = 36;
const COLLAPSED_GROUP_WIDTH = 340;
const COLLAPSED_GROUP_HEIGHT = 220;
const GROUP_GAP_X = 80;
const GROUP_GAP_Y = 60;
const GROUPS_PER_ROW = 4;
const GROUP_COLORS = ['blue', 'teal', 'grape', 'orange', 'green'] as const;
const TERMINAL_TYPES = new Set<AnalysisNode['type']>(['output', 'publish', 'sheets_export']);

type Section = {
  title: string;
  startCell: number;
  endCell: number;
};

type StageDraft = {
  groupNodeId: string;
  name: string;
  nodes: AnalysisNode[];
  color: (typeof GROUP_COLORS)[number];
  order: number;
  x: number;
  y: number;
  w: number;
  h: number;
};

function headingInfo(cell: NotebookCell): { level: number; title: string } | null {
  if (cell.cell_type !== 'markdown') return null;
  const match = cell.source.trim().match(/^(#{1,6})\s+(.+)$/m);
  if (!match) return null;
  return { level: match[1].length, title: match[2].trim() };
}

function notebookSections(cells: NotebookCell[]): Section[] {
  const headings = cells
    .map((cell) => ({ cell, heading: headingInfo(cell) }))
    .filter((item): item is { cell: NotebookCell; heading: { level: number; title: string } } => Boolean(item.heading));

  if (headings.length === 0) return [];

  const targetLevel = headings.some((item) => item.heading.level === 2)
    ? 2
    : headings[0].heading.level;

  const sectionHeadings = headings.filter((item) => item.heading.level === targetLevel);
  return sectionHeadings
    .map((item, index) => {
      const next = sectionHeadings[index + 1];
      return {
        title: item.heading.title,
        startCell: item.cell.index,
        endCell: next ? next.cell.index - 1 : Number.MAX_SAFE_INTEGER,
      };
    })
    .filter((section) => section.title.length > 0);
}

function intersectsSection(node: AnalysisNode, section: Section): boolean {
  return (node.original_cells ?? []).some((cellIndex) => cellIndex >= section.startCell && cellIndex <= section.endCell);
}

function nodeLabel(node: AnalysisNode | undefined): string | null {
  if (!node) return null;
  const label = node.name?.trim() || node.description?.trim();
  return label && label.length > 0 ? label : null;
}

function dedupe(items: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of items) {
    const trimmed = item?.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    result.push(trimmed);
  }
  return result;
}

function stagePurpose(nodes: AnalysisNode[]): string | undefined {
  return nodes
    .map((node) => node.description?.trim())
    .find((description): description is string => Boolean(description && description.length > 0));
}

function buildStageDraft(
  name: string,
  nodes: AnalysisNode[],
  idPrefix: string,
  order: number,
): StageDraft {
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const member of nodes) {
    const size = notebookImportNodeSize(member);
    minX = Math.min(minX, member.x);
    minY = Math.min(minY, member.y);
    maxX = Math.max(maxX, member.x + size.width);
    maxY = Math.max(maxY, member.y + size.height);
  }

  return {
    groupNodeId: `${idPrefix}_group_${order}`,
    name,
    nodes,
    color: GROUP_COLORS[order % GROUP_COLORS.length],
    order,
    x: minX - GROUP_PADDING_X,
    y: minY - GROUP_PADDING_Y,
    w: maxX - minX + GROUP_PADDING_X * 2,
    h: maxY - minY + GROUP_PADDING_Y * 2,
  };
}

function topologicalOrder(stageIds: string[], stageEdges: Map<string, Set<string>>): string[] {
  const indegree = new Map(stageIds.map((id) => [id, 0]));
  for (const targets of stageEdges.values()) {
    for (const target of targets) indegree.set(target, (indegree.get(target) ?? 0) + 1);
  }

  const queue = stageIds.filter((id) => (indegree.get(id) ?? 0) === 0);
  const ordered: string[] = [];
  while (queue.length > 0) {
    const current = queue.shift()!;
    ordered.push(current);
    for (const target of stageEdges.get(current) ?? []) {
      indegree.set(target, (indegree.get(target) ?? 0) - 1);
      if ((indegree.get(target) ?? 0) === 0) queue.push(target);
    }
  }

  return ordered.length === stageIds.length ? ordered : stageIds;
}

function detectMainPath(stageDrafts: StageDraft[], edges: AnalysisEdge[]): Set<string> {
  if (stageDrafts.length === 0) return new Set<string>();

  const stageByMember = new Map<string, string>();
  for (const stage of stageDrafts) {
    for (const node of stage.nodes) stageByMember.set(node.id, stage.groupNodeId);
  }

  const stageEdges = new Map(stageDrafts.map((stage) => [stage.groupNodeId, new Set<string>()]));
  const indegree = new Map(stageDrafts.map((stage) => [stage.groupNodeId, 0]));
  const outdegree = new Map(stageDrafts.map((stage) => [stage.groupNodeId, 0]));

  for (const edge of edges) {
    const sourceStage = stageByMember.get(edge.source);
    const targetStage = stageByMember.get(edge.target);
    if (!sourceStage || !targetStage || sourceStage === targetStage) continue;
    const targets = stageEdges.get(sourceStage)!;
    if (!targets.has(targetStage)) {
      targets.add(targetStage);
      indegree.set(targetStage, (indegree.get(targetStage) ?? 0) + 1);
      outdegree.set(sourceStage, (outdegree.get(sourceStage) ?? 0) + 1);
    }
  }

  const hasStageEdges = [...stageEdges.values()].some((targets) => targets.size > 0);
  if (!hasStageEdges) return new Set(stageDrafts.map((stage) => stage.groupNodeId));

  const stageScore = new Map(
    stageDrafts.map((stage) => [
      stage.groupNodeId,
      stage.nodes.length + (stage.nodes.some((node) => TERMINAL_TYPES.has(node.type)) ? 8 : 0),
    ]),
  );

  const score = new Map<string, number>();
  const previous = new Map<string, string | null>();
  const ordered = topologicalOrder(stageDrafts.map((stage) => stage.groupNodeId), stageEdges);

  for (const stageId of ordered) {
    if ((indegree.get(stageId) ?? 0) === 0) {
      score.set(stageId, stageScore.get(stageId) ?? 0);
      previous.set(stageId, null);
    }
    for (const target of stageEdges.get(stageId) ?? []) {
      const candidate = (score.get(stageId) ?? Number.NEGATIVE_INFINITY) + (stageScore.get(target) ?? 0);
      if (candidate > (score.get(target) ?? Number.NEGATIVE_INFINITY)) {
        score.set(target, candidate);
        previous.set(target, stageId);
      }
    }
  }

  const sinkIds = stageDrafts
    .map((stage) => stage.groupNodeId)
    .filter((stageId) => (outdegree.get(stageId) ?? 0) === 0);
  const endStage = sinkIds.reduce((best, stageId) => (
    (score.get(stageId) ?? Number.NEGATIVE_INFINITY) > (score.get(best) ?? Number.NEGATIVE_INFINITY) ? stageId : best
  ), sinkIds[0]);

  const mainPath = new Set<string>();
  let cursor: string | null | undefined = endStage;
  while (cursor) {
    mainPath.add(cursor);
    cursor = previous.get(cursor) ?? null;
  }
  return mainPath;
}

function summarizeStage(
  stage: StageDraft,
  stageByMember: Map<string, string>,
  edges: AnalysisEdge[],
  nodeMap: Map<string, AnalysisNode>,
): Pick<AnalysisNode, 'stagePurpose' | 'stageInputs' | 'stageOutputs' | 'stageNodeCount'> {
  const members = new Set(stage.nodes.map((node) => node.id));
  const externalInputs: string[] = [];
  const entryNodes: string[] = [];
  const outputs: string[] = [];

  for (const node of stage.nodes) {
    const incoming = edges.filter((edge) => edge.target === node.id);
    const outgoing = edges.filter((edge) => edge.source === node.id);

    const internalParents = incoming.filter((edge) => members.has(edge.source));
    const externalParents = incoming.filter((edge) => !members.has(edge.source) && stageByMember.get(edge.source) !== stage.groupNodeId);
    const internalChildren = outgoing.filter((edge) => members.has(edge.target));
    const externalChildren = outgoing.filter((edge) => !members.has(edge.target) && stageByMember.get(edge.target) !== stage.groupNodeId);

    if (externalParents.length > 0) {
      for (const edge of externalParents) {
        const label = nodeLabel(nodeMap.get(edge.source));
        if (label) externalInputs.push(label);
      }
    } else if (internalParents.length === 0 && node.type === 'data_source') {
      const label = nodeLabel(node);
      if (label) entryNodes.push(label);
    }

    if (externalChildren.length > 0 || internalChildren.length === 0 || TERMINAL_TYPES.has(node.type)) {
      const label = nodeLabel(node);
      if (label) outputs.push(label);
    }
  }

  return {
    stagePurpose: stagePurpose(stage.nodes),
    stageInputs: dedupe([...externalInputs, ...entryNodes]),
    stageOutputs: dedupe(outputs),
    stageNodeCount: stage.nodes.length,
  };
}

function attachStageMetadata(
  stageDrafts: StageDraft[],
  nodeMap: Map<string, AnalysisNode>,
  edges: AnalysisEdge[],
  _collapseSecondary: boolean,
  originX: number,
  originY: number,
): AnalysisNode[] {
  const stageByMember = new Map<string, string>();
  for (const stage of stageDrafts) {
    for (const node of stage.nodes) stageByMember.set(node.id, stage.groupNodeId);
  }

  const mainPath = detectMainPath(stageDrafts, edges);

  return stageDrafts.map((stage, index) => {
    const summary = summarizeStage(stage, stageByMember, edges, nodeMap);
    const col = index % GROUPS_PER_ROW;
    const row = Math.floor(index / GROUPS_PER_ROW);
    return {
      id: stage.groupNodeId,
      type: 'group',
      name: stage.name,
      description: summary.stagePurpose ?? `Imported notebook stage: ${stage.name}`,
      x: originX + col * (COLLAPSED_GROUP_WIDTH + GROUP_GAP_X),
      y: originY + row * (COLLAPSED_GROUP_HEIGHT + GROUP_GAP_Y),
      w: COLLAPSED_GROUP_WIDTH,
      h: COLLAPSED_GROUP_HEIGHT,
      groupColor: stage.color,
      collapsed: true,
      importedStage: true,
      stageOrder: stage.order,
      stagePurpose: summary.stagePurpose,
      stageInputs: summary.stageInputs,
      stageOutputs: summary.stageOutputs,
      stageNodeCount: summary.stageNodeCount,
      stageRole: mainPath.has(stage.groupNodeId) ? 'main' : 'branch',
    };
  });
}

function buildInterGroupEdges(
  stageDrafts: StageDraft[],
  edges: AnalysisEdge[],
  idPrefix: string,
): AnalysisEdge[] {
  const memberToGroup = new Map<string, string>();
  for (const stage of stageDrafts) {
    for (const node of stage.nodes) memberToGroup.set(node.id, stage.groupNodeId);
  }

  const seen = new Set<string>();
  const groupEdges: AnalysisEdge[] = [];
  for (const edge of edges) {
    const sourceGroup = memberToGroup.get(edge.source);
    const targetGroup = memberToGroup.get(edge.target);
    if (!sourceGroup || !targetGroup || sourceGroup === targetGroup) continue;
    const key = `${sourceGroup}->${targetGroup}`;
    if (seen.has(key)) continue;
    seen.add(key);
    groupEdges.push({
      id: `${idPrefix}_ge_${groupEdges.length}`,
      source: sourceGroup,
      target: targetGroup,
    });
  }
  return groupEdges;
}

export function buildImportedNotebookGroups(
  cells: NotebookCell[],
  nodes: AnalysisNode[],
  edges: AnalysisEdge[],
  idPrefix: string,
  opts?: { originX?: number; originY?: number },
): { groups: AnalysisNode[]; nodes: AnalysisNode[]; groupEdges: AnalysisEdge[] } {
  const originX = opts?.originX ?? 100;
  const originY = opts?.originY ?? 100;
  const importGroups = new Map<string, { id: string; name: string; nodes: AnalysisNode[] }>();
  for (const node of nodes) {
    if (node.type === 'note' || node.type === 'group' || !node.import_group_id || !node.import_group_name) continue;
    const existing = importGroups.get(node.import_group_id) ?? {
      id: node.import_group_id,
      name: node.import_group_name,
      nodes: [],
    };
    existing.nodes.push(node);
    importGroups.set(node.import_group_id, existing);
  }

  const noteNodes = nodes.filter((node) => node.type === 'note');
  const mainNodes = nodes.filter((node) => node.type !== 'note' && node.type !== 'group');
  const nodeMap = new Map(nodes.map((node) => [node.id, { ...node }]));
  const collapseSecondary = mainNodes.length > 20;

  function finalize(stageDrafts: StageDraft[]): { groups: AnalysisNode[]; nodes: AnalysisNode[]; groupEdges: AnalysisEdge[] } {
    for (const stage of stageDrafts) {
      for (const member of stage.nodes) {
        const existing = nodeMap.get(member.id);
        if (existing) {
          existing.parentGroup = stage.groupNodeId;
          nodeMap.set(member.id, existing);
        }
      }
    }

    const groups = attachStageMetadata(stageDrafts, nodeMap, edges, collapseSecondary, originX, originY);
    const groupEdges = buildInterGroupEdges(stageDrafts, edges, idPrefix);

    return {
      groups,
      groupEdges,
      nodes: [
        ...noteNodes.map((node) => nodeMap.get(node.id) ?? node),
        ...mainNodes.map((node) => nodeMap.get(node.id) ?? node),
      ],
    };
  }

  if (importGroups.size > 0) {
    const orderedGroups = [...importGroups.values()].sort((a, b) => {
      const aMinCell = Math.min(...a.nodes.flatMap((node) => node.original_cells ?? [Number.MAX_SAFE_INTEGER]));
      const bMinCell = Math.min(...b.nodes.flatMap((node) => node.original_cells ?? [Number.MAX_SAFE_INTEGER]));
      return aMinCell - bMinCell;
    });

    const stageDrafts = orderedGroups.map((group, index) => buildStageDraft(group.name, group.nodes, idPrefix, index));
    return finalize(stageDrafts);
  }

  const sections = notebookSections(cells);
  if (sections.length === 0) return { groups: [], nodes, groupEdges: [] };

  const stageDrafts = sections
    .map((section, index) => {
      const members = mainNodes.filter((node) => intersectsSection(node, section));
      return members.length > 0 ? buildStageDraft(section.title, members, idPrefix, index) : null;
    })
    .filter((stage): stage is StageDraft => Boolean(stage));

  return finalize(stageDrafts);
}
