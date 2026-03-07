import { describe, expect, it } from 'vitest';
import type { AnalysisNode } from '../types/model';
import type { NotebookCell } from './api';
import { buildImportedNotebookGroups } from './notebookImportGroups';

function analysisNode(id: string, type: AnalysisNode['type'], patch: Partial<AnalysisNode> = {}): AnalysisNode {
  return {
    id,
    type,
    name: id,
    x: 100,
    y: 100,
    ...patch,
  };
}

describe('buildImportedNotebookGroups', () => {
  it('creates flat groups from markdown heading sections and assigns matching nodes', () => {
    const cells: NotebookCell[] = [
      { index: 0, cell_type: 'markdown', source: '# Notebook' },
      { index: 1, cell_type: 'markdown', source: '## Load data' },
      { index: 2, cell_type: 'code', source: 'df = pd.read_csv("sales.csv")' },
      { index: 3, cell_type: 'markdown', source: '## Analyze revenue' },
      { index: 4, cell_type: 'code', source: 'df.groupby("region").sum()' },
    ];

    const nodes = [
      analysisNode('note_intro', 'note', { original_cells: [1], x: 20, y: 20 }),
      analysisNode('source', 'data_source', { original_cells: [2], x: 100, y: 120 }),
      analysisNode('summary', 'code', { original_cells: [4], x: 700, y: 120 }),
    ];

    const grouped = buildImportedNotebookGroups(cells, nodes, [], 'nb_test');

    expect(grouped.groups).toHaveLength(2);
    expect(grouped.groups.map((group) => group.name)).toEqual(['Load data', 'Analyze revenue']);
    expect(grouped.nodes.find((node) => node.id === 'source')?.parentGroup).toBe(grouped.groups[0].id);
    expect(grouped.nodes.find((node) => node.id === 'summary')?.parentGroup).toBe(grouped.groups[1].id);
    expect(grouped.nodes.find((node) => node.id === 'note_intro')?.parentGroup).toBeUndefined();
  });

  it('prefers AI-planned import group metadata over raw notebook headings', () => {
    const cells: NotebookCell[] = [
      { index: 0, cell_type: 'markdown', source: '# Notebook' },
      { index: 1, cell_type: 'code', source: 'df = pd.read_csv("sales.csv")' },
      { index: 2, cell_type: 'code', source: 'df.groupby("region").sum()' },
    ];

    const nodes = [
      analysisNode('source', 'data_source', {
        original_cells: [1],
        import_group_id: 'sec_ingest',
        import_group_name: 'Ingest sales',
      }),
      analysisNode('summary', 'code', {
        original_cells: [2],
        import_group_id: 'sec_model',
        import_group_name: 'Model revenue',
      }),
    ];

    const grouped = buildImportedNotebookGroups(cells, nodes, [], 'nb_test');

    expect(grouped.groups.map((group) => group.name)).toEqual(['Ingest sales', 'Model revenue']);
    expect(grouped.nodes.find((node) => node.id === 'source')?.parentGroup).toBe(grouped.groups[0].id);
    expect(grouped.nodes.find((node) => node.id === 'summary')?.parentGroup).toBe(grouped.groups[1].id);
  });

  it('adds imported stage summaries and marks the dominant stage path', () => {
    const cells: NotebookCell[] = [
      { index: 0, cell_type: 'markdown', source: '# Notebook' },
      { index: 1, cell_type: 'code', source: 'profiles = pd.read_excel("profiles.xlsx")' },
      { index: 2, cell_type: 'code', source: 'materials = profiles.merge(products)' },
      { index: 3, cell_type: 'code', source: 'chart = materials.groupby("type").sum()' },
      { index: 4, cell_type: 'code', source: 'materials.to_csv("materials.csv")' },
    ];

    const nodes = [
      analysisNode('source_profiles', 'data_source', {
        name: 'Building profiles',
        description: 'Loads building profile data from Excel.',
        original_cells: [1],
        import_group_id: 'sec_inputs',
        import_group_name: 'Load inputs',
      }),
      analysisNode('merge_materials', 'code', {
        name: 'Prepare materials',
        description: 'Cleans columns and merges material inputs.',
        original_cells: [2],
        import_group_id: 'sec_prepare',
        import_group_name: 'Prepare materials',
      }),
      analysisNode('distribution_table', 'output', {
        name: 'Distribution table',
        description: 'Displays the calculated distribution table.',
        original_cells: [3],
        import_group_id: 'sec_outputs',
        import_group_name: 'Generate outputs',
      }),
      analysisNode('export_materials', 'publish', {
        name: 'Export materials',
        description: 'Writes the final materials dataset to disk.',
        original_cells: [4],
        import_group_id: 'sec_outputs',
        import_group_name: 'Generate outputs',
      }),
      analysisNode('sanity_chart', 'output', {
        name: 'Sanity check chart',
        description: 'Builds a side-branch validation chart.',
        original_cells: [3],
        import_group_id: 'sec_validation',
        import_group_name: 'Validate results',
      }),
    ];

    const edges = [
      { id: 'e1', source: 'source_profiles', target: 'merge_materials' },
      { id: 'e2', source: 'merge_materials', target: 'distribution_table' },
      { id: 'e3', source: 'merge_materials', target: 'export_materials' },
      { id: 'e4', source: 'merge_materials', target: 'sanity_chart' },
    ];

    const grouped = buildImportedNotebookGroups(cells, nodes, edges, 'nb_test');

    expect(grouped.groups.map((group) => group.name)).toEqual([
      'Load inputs',
      'Prepare materials',
      'Generate outputs',
      'Validate results',
    ]);

    const loadStage = grouped.groups[0];
    const prepareStage = grouped.groups[1];
    const outputStage = grouped.groups[2];
    const validationStage = grouped.groups[3];

    expect(loadStage.importedStage).toBe(true);
    expect(loadStage.stagePurpose).toBe('Loads building profile data from Excel.');
    expect(loadStage.stageInputs).toEqual(['Building profiles']);
    expect(loadStage.stageOutputs).toEqual(['Building profiles']);
    expect(loadStage.stageNodeCount).toBe(1);
    expect(loadStage.stageRole).toBe('main');

    expect(prepareStage.stageInputs).toEqual(['Building profiles']);
    expect(prepareStage.stageOutputs).toEqual(['Prepare materials']);
    expect(prepareStage.stageRole).toBe('main');

    expect(outputStage.stageOutputs).toEqual(['Distribution table', 'Export materials']);
    expect(outputStage.stageRole).toBe('main');

    expect(validationStage.stageInputs).toEqual(['Prepare materials']);
    expect(validationStage.stageOutputs).toEqual(['Sanity check chart']);
    expect(validationStage.stageRole).toBe('branch');
  });
});
