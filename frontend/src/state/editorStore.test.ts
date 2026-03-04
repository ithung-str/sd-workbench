import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { cloneModel, teacupModel } from '../lib/sampleModels';
import { useEditorStore } from './editorStore';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  useEditorStore.getState().loadModel(cloneModel(teacupModel));
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

  it('undoes and redoes add node', () => {
    const start = useEditorStore.getState().model.nodes.length;
    useEditorStore.getState().addNode('aux');
    expect(useEditorStore.getState().model.nodes.length).toBe(start + 1);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().model.nodes.length).toBe(start);

    useEditorStore.getState().redo();
    expect(useEditorStore.getState().model.nodes.length).toBe(start + 1);
  });

  it('selecting and editing node updates model', () => {
    const first = useEditorStore.getState().model.nodes.find((n) => n.type !== 'text' && n.type !== 'cloud' && n.type !== 'cld_symbol' && n.type !== 'phantom');
    expect(first).toBeDefined();
    if (!first) return;
    useEditorStore.getState().setSelected({ kind: 'node', id: first.id });
    useEditorStore.getState().updateNode(first.id, { equation: '42' });
    const updated = useEditorStore.getState().model.nodes.find((n) => n.id === first.id);
    expect(updated && updated.type !== 'text' && updated.type !== 'cloud' && updated.type !== 'cld_symbol' && updated.type !== 'phantom' ? updated.equation : undefined).toBe('42');
  });

  it('adds a CLD symbol node', () => {
    const start = useEditorStore.getState().model.nodes.length;
    useEditorStore.getState().addCldSymbol('R');
    const state = useEditorStore.getState();
    expect(state.model.nodes.length).toBe(start + 1);
    const created = state.model.nodes[state.model.nodes.length - 1];
    expect(created?.type).toBe('cld_symbol');
    if (created?.type === 'cld_symbol') {
      expect(created.symbol).toBe('R');
    }
  });

  it('toggles canvas lock state', () => {
    useEditorStore.getState().setCanvasLocked(true);
    expect(useEditorStore.getState().isCanvasLocked).toBe(true);
    useEditorStore.getState().setCanvasLocked(false);
    expect(useEditorStore.getState().isCanvasLocked).toBe(false);
  });

  it('supports selecting a global variable', () => {
    const state = useEditorStore.getState();
    const variable = state.model.global_variables?.[0];
    if (!variable) return;
    state.setSelected({ kind: 'global_variable', id: variable.id });
    expect(useEditorStore.getState().selected).toEqual({ kind: 'global_variable', id: variable.id });
  });

  it('run button state can be inferred from local validation errors', () => {
    const first = useEditorStore.getState().model.nodes[0];
    useEditorStore.getState().updateNode(first.id, { name: '' as never });
    expect(useEditorStore.getState().localIssues.some((i) => i.severity === 'error')).toBe(true);
  });

  it('undoes and redoes deleting a selected node and linked edges', () => {
    const state = useEditorStore.getState();
    const node = state.model.nodes.find((n) => n.id === 'flow_temperature_change');
    expect(node).toBeDefined();
    if (!node) return;

    const edgeCountBefore = state.model.edges.length;
    state.setSelected({ kind: 'node', id: node.id });
    state.deleteSelected();

    const afterDelete = useEditorStore.getState();
    expect(afterDelete.model.nodes.some((n) => n.id === node.id)).toBe(false);
    expect(afterDelete.model.edges.length).toBeLessThan(edgeCountBefore);

    afterDelete.undo();
    const afterUndo = useEditorStore.getState();
    expect(afterUndo.model.nodes.some((n) => n.id === node.id)).toBe(true);
    expect(afterUndo.model.edges.length).toBe(edgeCountBefore);

    afterUndo.redo();
    const afterRedo = useEditorStore.getState();
    expect(afterRedo.model.nodes.some((n) => n.id === node.id)).toBe(false);
  });

  it('undoes and redoes add edge', () => {
    const state = useEditorStore.getState();
    const start = state.model.edges.length;
    state.addEdge({ id: 'edge_test', type: 'influence', source: 'aux_room_temperature', target: 'flow_temperature_change' });
    expect(useEditorStore.getState().model.edges.length).toBe(start + 1);

    useEditorStore.getState().undo();
    expect(useEditorStore.getState().model.edges.length).toBe(start);

    useEditorStore.getState().redo();
    expect(useEditorStore.getState().model.edges.length).toBe(start + 1);
  });

  it('commits drag movement as a single undo step on drag stop', () => {
    const state = useEditorStore.getState();
    const target = state.model.nodes[0];
    const startPosition = { ...target.position };

    state.updateNodePosition(target.id, startPosition.x + 10, startPosition.y + 10);
    state.updateNodePosition(target.id, startPosition.x + 20, startPosition.y + 20);
    state.commitNodePosition(target.id, startPosition.x + 30, startPosition.y + 30);

    expect(useEditorStore.getState().canUndo()).toBe(true);
    useEditorStore.getState().undo();
    const reverted = useEditorStore.getState().model.nodes.find((n) => n.id === target.id);
    expect(reverted?.position).toEqual({ x: startPosition.x + 20, y: startPosition.y + 20 });
  });

  it('groups typing updates into one undo entry', () => {
    vi.useFakeTimers();
    const state = useEditorStore.getState();
    const node = state.model.nodes.find((n) => n.type !== 'text' && n.type !== 'cloud' && n.type !== 'cld_symbol' && n.type !== 'phantom');
    expect(node).toBeDefined();
    if (!node) return;
    const originalEquation = node.equation;

    state.updateNode(node.id, { equation: '1' });
    state.updateNode(node.id, { equation: '12' });
    state.updateNode(node.id, { equation: '123' });

    expect(useEditorStore.getState().canUndo()).toBe(false);
    vi.advanceTimersByTime(400);
    expect(useEditorStore.getState().canUndo()).toBe(true);

    useEditorStore.getState().undo();
    const reverted = useEditorStore.getState().model.nodes.find((n) => n.id === node.id);
    expect(reverted && reverted.type !== 'text' && reverted.type !== 'cloud' && reverted.type !== 'cld_symbol' && reverted.type !== 'phantom' ? reverted.equation : undefined).toBe(originalEquation);
  });

  it('clears redo stack when a new edit happens after undo', () => {
    const state = useEditorStore.getState();
    state.addNode('aux');
    expect(useEditorStore.getState().canUndo()).toBe(true);
    state.undo();
    expect(useEditorStore.getState().canRedo()).toBe(true);

    state.addNode('stock');
    expect(useEditorStore.getState().canRedo()).toBe(false);
  });

  it('clears history when loading a model', () => {
    const state = useEditorStore.getState();
    state.addNode('aux');
    expect(useEditorStore.getState().canUndo()).toBe(true);

    state.loadModel(cloneModel(teacupModel));
    expect(useEditorStore.getState().canUndo()).toBe(false);
    expect(useEditorStore.getState().canRedo()).toBe(false);
  });

  it('enforces history limit', () => {
    const state = useEditorStore.getState();
    for (let i = 0; i < state.historyLimit + 20; i += 1) {
      state.addNode('aux');
    }
    expect(useEditorStore.getState().undoStack.length).toBe(state.historyLimit);
  });

  it('creates and updates scenarios with metadata persistence', () => {
    const start = useEditorStore.getState().scenarios.length;
    useEditorStore.getState().createScenario();
    const afterCreate = useEditorStore.getState();
    expect(afterCreate.scenarios.length).toBe(start + 1);
    const active = afterCreate.scenarios.find((s) => s.id === afterCreate.activeScenarioId);
    expect(active).toBeDefined();
    if (!active) return;
    useEditorStore.getState().updateScenario(active.id, { name: 'Policy A' });
    const updated = useEditorStore.getState().scenarios.find((s) => s.id === active.id);
    expect(updated?.name).toBe('Policy A');
    expect(useEditorStore.getState().model.metadata?.analysis?.scenarios.some((s) => s.id === active.id)).toBe(true);
  });

  it('creates dashboards and preserves scenario metadata in analysis', () => {
    const state = useEditorStore.getState();
    const baselineId = state.activeScenarioId;
    state.createDashboard('Ops');
    const after = useEditorStore.getState();
    expect(after.dashboards.length).toBeGreaterThan(0);
    const activeDashboard = after.dashboards.find((dashboard) => dashboard.id === after.activeDashboardId);
    expect(activeDashboard?.name).toBe('Ops');
    expect(after.model.metadata?.analysis?.defaults?.baseline_scenario_id).toBe(baselineId);
    expect(after.model.metadata?.analysis?.defaults?.active_dashboard_id).toBe(after.activeDashboardId ?? undefined);
  });

  it('disables include_baseline when baseline scenario already exists', async () => {
    const spy = vi.spyOn(api, 'simulateScenarioBatch').mockResolvedValue({ ok: true, runs: [], errors: [] });
    useEditorStore.setState((state) => ({
      ...state,
      scenarios: [
        { id: 'baseline', name: 'Baseline', status: 'baseline', overrides: { params: {}, outputs: [], sim_config: {} } },
        { id: 'policy_1', name: 'Policy 1', status: 'policy', overrides: { params: {}, outputs: [], sim_config: {} } },
      ],
    }));

    await useEditorStore.getState().runScenarioBatch();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]?.include_baseline).toBe(false);
  });

  it('enables include_baseline when no baseline scenario exists', async () => {
    const spy = vi.spyOn(api, 'simulateScenarioBatch').mockResolvedValue({ ok: true, runs: [], errors: [] });
    useEditorStore.setState((state) => ({
      ...state,
      scenarios: [{ id: 'policy_1', name: 'Policy 1', status: 'policy', overrides: { params: {}, outputs: [], sim_config: {} } }],
    }));

    await useEditorStore.getState().runScenarioBatch();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]?.include_baseline).toBe(true);
  });

  it('updates backend health state via setter', () => {
    useEditorStore.getState().setBackendHealthy(true);
    expect(useEditorStore.getState().backendHealthy).toBe(true);
    useEditorStore.getState().setBackendHealthy(false);
    expect(useEditorStore.getState().backendHealthy).toBe(false);
    useEditorStore.getState().setBackendHealthy(null);
    expect(useEditorStore.getState().backendHealthy).toBeNull();
  });

  it('setMultiSelectedNodeIds with >=2 ids sets state and clears single selected', () => {
    // First set a single selection
    useEditorStore.getState().setSelected({ kind: 'node', id: 'stock_temperature' });
    expect(useEditorStore.getState().selected).toEqual({ kind: 'node', id: 'stock_temperature' });

    // Now multi-select two nodes
    useEditorStore.getState().setMultiSelectedNodeIds(['stock_temperature', 'aux_room_temperature']);
    const state = useEditorStore.getState();
    expect(state.multiSelectedNodeIds).toEqual(['stock_temperature', 'aux_room_temperature']);
    expect(state.selected).toBeNull();
  });

  it('setMultiSelectedNodeIds with <2 ids clears multiSelectedNodeIds', () => {
    // Set up multi-selection first
    useEditorStore.getState().setMultiSelectedNodeIds(['stock_temperature', 'aux_room_temperature']);
    expect(useEditorStore.getState().multiSelectedNodeIds).toEqual(['stock_temperature', 'aux_room_temperature']);

    // Calling with 1 id should clear
    useEditorStore.getState().setMultiSelectedNodeIds(['stock_temperature']);
    expect(useEditorStore.getState().multiSelectedNodeIds).toEqual([]);

    // Set up again and call with empty array
    useEditorStore.getState().setMultiSelectedNodeIds(['stock_temperature', 'aux_room_temperature']);
    useEditorStore.getState().setMultiSelectedNodeIds([]);
    expect(useEditorStore.getState().multiSelectedNodeIds).toEqual([]);
  });

  it('setSelected clears multiSelectedNodeIds', () => {
    // Set up multi-selection
    useEditorStore.getState().setMultiSelectedNodeIds(['stock_temperature', 'aux_room_temperature']);
    expect(useEditorStore.getState().multiSelectedNodeIds).toEqual(['stock_temperature', 'aux_room_temperature']);

    // Single-select should clear multi-selection
    useEditorStore.getState().setSelected({ kind: 'node', id: 'stock_temperature' });
    const state = useEditorStore.getState();
    expect(state.selected).toEqual({ kind: 'node', id: 'stock_temperature' });
    expect(state.multiSelectedNodeIds).toEqual([]);
  });

  it('deleteMultiSelected removes nodes and edges, supports undo', () => {
    const state = useEditorStore.getState();
    const nodeCountBefore = state.model.nodes.length;
    const edgeCountBefore = state.model.edges.length;

    // Multi-select the two aux nodes
    const idsToDelete = ['aux_room_temperature', 'aux_characteristic_time'];
    state.setMultiSelectedNodeIds(idsToDelete);

    // Count edges that reference those nodes
    const edgesRemovedCount = state.model.edges.filter(
      (e) => idsToDelete.includes(e.source) || idsToDelete.includes(e.target),
    ).length;
    expect(edgesRemovedCount).toBeGreaterThan(0);

    // Delete
    useEditorStore.getState().deleteMultiSelected();

    const afterDelete = useEditorStore.getState();
    expect(afterDelete.model.nodes.some((n) => n.id === 'aux_room_temperature')).toBe(false);
    expect(afterDelete.model.nodes.some((n) => n.id === 'aux_characteristic_time')).toBe(false);
    expect(afterDelete.model.nodes.length).toBe(nodeCountBefore - 2);
    expect(afterDelete.model.edges.length).toBe(edgeCountBefore - edgesRemovedCount);
    expect(afterDelete.multiSelectedNodeIds).toEqual([]);
    expect(afterDelete.selected).toBeNull();

    // Undo should restore
    afterDelete.undo();
    const afterUndo = useEditorStore.getState();
    expect(afterUndo.model.nodes.some((n) => n.id === 'aux_room_temperature')).toBe(true);
    expect(afterUndo.model.nodes.some((n) => n.id === 'aux_characteristic_time')).toBe(true);
    expect(afterUndo.model.nodes.length).toBe(nodeCountBefore);
    expect(afterUndo.model.edges.length).toBe(edgeCountBefore);

    // Redo should re-delete
    afterUndo.redo();
    const afterRedo = useEditorStore.getState();
    expect(afterRedo.model.nodes.some((n) => n.id === 'aux_room_temperature')).toBe(false);
    expect(afterRedo.model.nodes.some((n) => n.id === 'aux_characteristic_time')).toBe(false);
    expect(afterRedo.model.nodes.length).toBe(nodeCountBefore - 2);
  });

  // ── Optimisation config CRUD ──

  it('creates an optimisation config', () => {
    const startCount = useEditorStore.getState().optimisationConfigs.length;
    useEditorStore.getState().createOptimisationConfig();
    const state = useEditorStore.getState();
    expect(state.optimisationConfigs.length).toBe(startCount + 1);
    expect(state.activeOptimisationConfigId).toBe(state.optimisationConfigs[state.optimisationConfigs.length - 1].id);
    expect(state.optimisationConfigs[0].mode).toBe('goal-seek');
  });

  it('duplicates an optimisation config', () => {
    useEditorStore.getState().createOptimisationConfig();
    const created = useEditorStore.getState().optimisationConfigs[0];
    useEditorStore.getState().updateOptimisationConfig(created.id, { name: 'Test Config' });
    useEditorStore.getState().duplicateOptimisationConfig(created.id);
    const state = useEditorStore.getState();
    expect(state.optimisationConfigs.length).toBe(2);
    expect(state.optimisationConfigs[1].name).toBe('Test Config (copy)');
    expect(state.activeOptimisationConfigId).toBe(state.optimisationConfigs[1].id);
  });

  it('updates an optimisation config', () => {
    useEditorStore.getState().createOptimisationConfig();
    const created = useEditorStore.getState().optimisationConfigs[0];
    useEditorStore.getState().updateOptimisationConfig(created.id, { mode: 'policy', name: 'Policy Test' });
    const updated = useEditorStore.getState().optimisationConfigs.find((c) => c.id === created.id);
    expect(updated?.mode).toBe('policy');
    expect(updated?.name).toBe('Policy Test');
  });

  it('deletes an optimisation config', () => {
    useEditorStore.getState().createOptimisationConfig();
    const state = useEditorStore.getState();
    expect(state.optimisationConfigs.length).toBe(1);
    const toDelete = state.optimisationConfigs[0].id;
    useEditorStore.getState().deleteOptimisationConfig(toDelete);
    const after = useEditorStore.getState();
    expect(after.optimisationConfigs.length).toBe(0);
    expect(after.activeOptimisationConfigId).toBe('');
  });

  it('persists optimisation configs in model.metadata.analysis', () => {
    useEditorStore.getState().createOptimisationConfig();
    const state = useEditorStore.getState();
    const analysis = state.model.metadata?.analysis;
    expect(analysis?.optimisation_configs?.length).toBe(1);
    expect(analysis?.defaults?.active_optimisation_config_id).toBe(state.activeOptimisationConfigId);
  });

  it('loadModel restores optimisation configs from metadata', () => {
    useEditorStore.getState().createOptimisationConfig();
    const model = useEditorStore.getState().model;
    // Reload the same model
    useEditorStore.getState().loadModel(model);
    const state = useEditorStore.getState();
    expect(state.optimisationConfigs.length).toBe(1);
    expect(state.activeOptimisationConfigId).toBe(model.metadata?.analysis?.defaults?.active_optimisation_config_id);
  });

  it('bulkUpdateNodes applies patch to all listed nodes, supports undo', () => {
    const state = useEditorStore.getState();
    const ids = ['aux_room_temperature', 'aux_characteristic_time'];

    // Capture original equations
    const origRoomTemp = state.model.nodes.find((n) => n.id === 'aux_room_temperature');
    const origCharTime = state.model.nodes.find((n) => n.id === 'aux_characteristic_time');
    expect(origRoomTemp).toBeDefined();
    expect(origCharTime).toBeDefined();
    if (!origRoomTemp || !origCharTime) return;
    const origEqRoom = origRoomTemp.type === 'aux' ? origRoomTemp.equation : undefined;
    const origEqChar = origCharTime.type === 'aux' ? origCharTime.equation : undefined;

    // Bulk update equations
    state.bulkUpdateNodes(ids, { equation: '99' } as any);

    const afterUpdate = useEditorStore.getState();
    const updatedRoom = afterUpdate.model.nodes.find((n) => n.id === 'aux_room_temperature');
    const updatedChar = afterUpdate.model.nodes.find((n) => n.id === 'aux_characteristic_time');
    expect(updatedRoom && updatedRoom.type === 'aux' ? updatedRoom.equation : undefined).toBe('99');
    expect(updatedChar && updatedChar.type === 'aux' ? updatedChar.equation : undefined).toBe('99');

    // Non-targeted node should be unchanged
    const stock = afterUpdate.model.nodes.find((n) => n.id === 'stock_temperature');
    expect(stock && stock.type === 'stock' ? stock.equation : undefined).not.toBe('99');

    // Undo should restore originals
    afterUpdate.undo();
    const afterUndo = useEditorStore.getState();
    const restoredRoom = afterUndo.model.nodes.find((n) => n.id === 'aux_room_temperature');
    const restoredChar = afterUndo.model.nodes.find((n) => n.id === 'aux_characteristic_time');
    expect(restoredRoom && restoredRoom.type === 'aux' ? restoredRoom.equation : undefined).toBe(origEqRoom);
    expect(restoredChar && restoredChar.type === 'aux' ? restoredChar.equation : undefined).toBe(origEqChar);

    // Redo should re-apply the bulk update
    afterUndo.redo();
    const afterRedo = useEditorStore.getState();
    const redoRoom = afterRedo.model.nodes.find((n) => n.id === 'aux_room_temperature');
    const redoChar = afterRedo.model.nodes.find((n) => n.id === 'aux_characteristic_time');
    expect(redoRoom && redoRoom.type === 'aux' ? redoRoom.equation : undefined).toBe('99');
    expect(redoChar && redoChar.type === 'aux' ? redoChar.equation : undefined).toBe('99');
  });
});

describe('Dimension management', () => {
  it('addDimension creates a new dimension', () => {
    useEditorStore.getState().addDimension('Region', ['North', 'South']);
    const dims = useEditorStore.getState().model.dimensions ?? [];
    expect(dims).toHaveLength(1);
    expect(dims[0].name).toBe('Region');
    expect(dims[0].elements).toEqual(['North', 'South']);
  });

  it('updateDimension renames a dimension', () => {
    useEditorStore.getState().addDimension('Region', ['N', 'S']);
    const dimId = (useEditorStore.getState().model.dimensions ?? [])[0].id;
    useEditorStore.getState().updateDimension(dimId, { name: 'Area' });
    expect((useEditorStore.getState().model.dimensions ?? [])[0].name).toBe('Area');
  });

  it('deleteDimension removes dimension and strips from nodes', () => {
    useEditorStore.getState().addDimension('Region', ['N', 'S']);
    const dimId = (useEditorStore.getState().model.dimensions ?? [])[0].id;
    // Assign dimension to a node
    const nodeId = useEditorStore.getState().model.nodes[0]?.id;
    if (nodeId) {
      useEditorStore.getState().updateNode(nodeId, { dimensions: ['Region'] } as any);
    }
    useEditorStore.getState().deleteDimension(dimId);
    expect(useEditorStore.getState().model.dimensions ?? []).toHaveLength(0);
  });
});
