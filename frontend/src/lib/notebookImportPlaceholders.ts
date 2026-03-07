import type { AnalysisNode, NotebookImportStageState } from '../types/model';
import { layoutNotebookImportStagePlaceholders } from './notebookImportLayout';

const PLACEHOLDER_STAGE_COLORS = ['blue', 'teal', 'grape', 'orange', 'green'] as const;

export function getNotebookImportPlaceholderGroupId(idPrefix: string, stageId: string): string {
  return `${idPrefix}_placeholder_${stageId}`;
}

export function buildNotebookImportPlaceholderStages(
  idPrefix: string,
  stages: Array<{ id: string; name: string; purpose?: string }>,
  opts: { originX: number; originY: number },
): AnalysisNode[] {
  const slots = layoutNotebookImportStagePlaceholders(stages, opts);
  return slots.map((slot, index) => ({
    id: getNotebookImportPlaceholderGroupId(idPrefix, slot.id),
    type: 'group',
    name: slot.name,
    description: slot.purpose ?? `Imported notebook stage: ${slot.name}`,
    x: slot.x,
    y: slot.y,
    w: slot.w,
    h: slot.h,
    groupColor: PLACEHOLDER_STAGE_COLORS[index % PLACEHOLDER_STAGE_COLORS.length],
    collapsed: false,
    importedStage: true,
    placeholder: true,
    importStageState: 'queued',
    import_group_id: slot.id,
    import_group_name: slot.name,
    stageOrder: index,
    stagePurpose: slot.purpose,
    stageInputs: [],
    stageOutputs: [],
    stageNodeCount: 0,
    stageRole: 'main',
  }));
}

export function updateNotebookImportPlaceholderStageState(
  groups: AnalysisNode[],
  stageId: string,
  state: NotebookImportStageState,
  stageName?: string,
): AnalysisNode[] {
  return groups.map((group) => (
    group.import_group_id === stageId
      ? {
        ...group,
        name: stageName || group.name,
        importStageState: state,
      }
      : group
  ));
}

export function attachNotebookImportNodeToPlaceholderStage(
  node: AnalysisNode,
  idPrefix: string,
  placeholderGroupIdsByStageId: Map<string, string>,
): AnalysisNode {
  const stageId = node.import_group_id;
  if (!stageId) return node;
  return {
    ...node,
    parentGroup: placeholderGroupIdsByStageId.get(stageId) ?? getNotebookImportPlaceholderGroupId(idPrefix, stageId),
  };
}
