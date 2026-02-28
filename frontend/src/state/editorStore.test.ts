import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useEditorStore } from './editorStore';

beforeEach(() => {
  useEditorStore.setState((state) => ({
    ...state,
    selected: null,
    validation: { ok: true, errors: [], warnings: [] },
    localIssues: [],
    results: null,
    apiError: null,
    activeDockTab: 'validation',
  }));
});

describe('editorStore', () => {
  it('adds a node', () => {
    const start = useEditorStore.getState().model.nodes.length;
    useEditorStore.getState().addNode('aux');
    expect(useEditorStore.getState().model.nodes.length).toBe(start + 1);
  });

  it('selecting and editing node updates model', () => {
    const first = useEditorStore.getState().model.nodes.find((n) => n.type !== 'text' && n.type !== 'cloud');
    expect(first).toBeDefined();
    if (!first) return;
    useEditorStore.getState().setSelected({ kind: 'node', id: first.id });
    useEditorStore.getState().updateNode(first.id, { equation: '42' });
    const updated = useEditorStore.getState().model.nodes.find((n) => n.id === first.id);
    expect(updated && updated.type !== 'text' && updated.type !== 'cloud' ? updated.equation : undefined).toBe('42');
  });

  it('run button state can be inferred from local validation errors', () => {
    const first = useEditorStore.getState().model.nodes[0];
    useEditorStore.getState().updateNode(first.id, { name: '' as never });
    expect(useEditorStore.getState().localIssues.some((i) => i.severity === 'error')).toBe(true);
  });
});
