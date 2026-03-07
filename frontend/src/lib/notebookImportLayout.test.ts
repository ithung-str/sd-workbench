import { describe, expect, it } from 'vitest';
import type { AnalysisEdge, AnalysisNode } from '../types/model';
import { layoutImportedNotebookNodes, layoutNotebookImportStagePlaceholders } from './notebookImportLayout';

function node(id: string, type: AnalysisNode['type'], patch: Partial<AnalysisNode> = {}): AnalysisNode {
  return {
    id,
    type,
    name: id,
    x: 0,
    y: 0,
    ...patch,
  };
}

function edge(source: string, target: string): AnalysisEdge {
  return { id: `${source}_${target}`, source, target };
}

describe('layoutImportedNotebookNodes', () => {
  it('lays out a linear pipeline from top to bottom', () => {
    const nodes = [
      node('src', 'data_source'),
      node('transform', 'code'),
      node('out', 'output'),
    ];
    const edges = [
      edge('src', 'transform'),
      edge('transform', 'out'),
    ];

    const laidOut = layoutImportedNotebookNodes(nodes, edges, { originX: 100, originY: 100 });

    expect(laidOut.src.y).toBeLessThan(laidOut.transform.y);
    expect(laidOut.transform.y).toBeLessThan(laidOut.out.y);
  });

  it('keeps branching outputs below their shared parent', () => {
    const nodes = [
      node('src', 'data_source'),
      node('clean', 'code'),
      node('table', 'output'),
      node('publish', 'publish'),
    ];
    const edges = [
      edge('src', 'clean'),
      edge('clean', 'table'),
      edge('clean', 'publish'),
    ];

    const laidOut = layoutImportedNotebookNodes(nodes, edges, { originX: 100, originY: 100 });

    expect(laidOut.clean.y).toBeGreaterThan(laidOut.src.y);
    expect(laidOut.table.y).toBeGreaterThan(laidOut.clean.y);
    expect(laidOut.publish.y).toBeGreaterThan(laidOut.clean.y);
  });

  it('parks note nodes in an annotation lane to the left of the main flow', () => {
    const nodes = [
      node('intro', 'note', { content: '# Intro' }),
      node('src', 'data_source'),
      node('transform', 'code'),
    ];
    const edges = [
      edge('src', 'transform'),
    ];

    const laidOut = layoutImportedNotebookNodes(nodes, edges, { originX: 100, originY: 100 });

    expect(laidOut.intro.x).toBeLessThan(laidOut.src.x);
    expect(laidOut.intro.x).toBeLessThan(laidOut.transform.x);
  });
});

describe('layoutNotebookImportStagePlaceholders', () => {
  it('creates stable top-to-bottom stage slots from the planned stage order', () => {
    const laidOut = layoutNotebookImportStagePlaceholders(
      [
        { id: 'sec_ingest', name: 'Load inputs', purpose: 'Reads source tables.' },
        { id: 'sec_prepare', name: 'Prepare materials', purpose: 'Cleans and reshapes inputs.' },
        { id: 'sec_outputs', name: 'Generate outputs', purpose: 'Builds final views.' },
      ],
      { originX: 120, originY: 80 },
    );

    expect(laidOut).toHaveLength(3);
    expect(laidOut[0].id).toBe('sec_ingest');
    expect(laidOut[1].id).toBe('sec_prepare');
    expect(laidOut[2].id).toBe('sec_outputs');
    expect(laidOut[0].y).toBeLessThan(laidOut[1].y);
    expect(laidOut[1].y).toBeLessThan(laidOut[2].y);
    expect(laidOut[0].x).toBe(laidOut[1].x);
    expect(laidOut[1].x).toBe(laidOut[2].x);
    expect(laidOut[0].w).toBeGreaterThan(300);
    expect(laidOut[0].h).toBeGreaterThan(200);
  });
});
