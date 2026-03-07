import { describe, expect, it } from 'vitest';
import type { AnalysisNode } from '../types/model';
import {
  buildNotebookImportPlaceholderStages,
  getNotebookImportPlaceholderGroupId,
  updateNotebookImportPlaceholderStageState,
  attachNotebookImportNodeToPlaceholderStage,
} from './notebookImportPlaceholders';

function node(id: string, patch: Partial<AnalysisNode> = {}): AnalysisNode {
  return {
    id,
    type: 'code',
    name: id,
    x: 0,
    y: 0,
    ...patch,
  };
}

describe('buildNotebookImportPlaceholderStages', () => {
  it('creates imported stage group nodes from the stage plan', () => {
    const groups = buildNotebookImportPlaceholderStages(
      'nb_123',
      [
        { id: 'sec_ingest', name: 'Load inputs', purpose: 'Reads source files.' },
        { id: 'sec_prepare', name: 'Prepare materials', purpose: 'Cleans tables.' },
      ],
      { originX: 100, originY: 120 },
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({
      id: getNotebookImportPlaceholderGroupId('nb_123', 'sec_ingest'),
      type: 'group',
      importedStage: true,
      placeholder: true,
      importStageState: 'queued',
      stageOrder: 0,
      stagePurpose: 'Reads source files.',
      stageNodeCount: 0,
    });
    expect(groups[0].y).toBeLessThan(groups[1].y);
    expect(groups[0].x).toBe(groups[1].x);
  });
});

describe('updateNotebookImportPlaceholderStageState', () => {
  it('updates only the matching placeholder stage state', () => {
    const groups = buildNotebookImportPlaceholderStages(
      'nb_123',
      [
        { id: 'sec_ingest', name: 'Load inputs' },
        { id: 'sec_prepare', name: 'Prepare materials' },
      ],
      { originX: 100, originY: 120 },
    );

    const updated = updateNotebookImportPlaceholderStageState(groups, 'sec_prepare', 'building', 'Prepare materials');

    expect(updated[0].importStageState).toBe('queued');
    expect(updated[1].importStageState).toBe('building');
    expect(updated[1].name).toBe('Prepare materials');
  });
});

describe('attachNotebookImportNodeToPlaceholderStage', () => {
  it('assigns streamed nodes to the matching placeholder group', () => {
    const attached = attachNotebookImportNodeToPlaceholderStage(
      node('transform_1', {
        import_group_id: 'sec_prepare',
        import_group_name: 'Prepare materials',
      }),
      'nb_123',
      new Map([
        ['sec_ingest', getNotebookImportPlaceholderGroupId('nb_123', 'sec_ingest')],
        ['sec_prepare', getNotebookImportPlaceholderGroupId('nb_123', 'sec_prepare')],
      ]),
    );

    expect(attached.parentGroup).toBe(getNotebookImportPlaceholderGroupId('nb_123', 'sec_prepare'));
  });
});
