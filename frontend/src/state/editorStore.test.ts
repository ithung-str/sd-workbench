import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../lib/api';
import { cloneModel, teacupModel } from '../lib/sampleModels';
import { useEditorStore } from './editorStore';
import type { VensimImportResponse } from '../types/model';

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
      activeSimulationMode: 'native_json',
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
      activeSimulationMode: 'native_json',
      scenarios: [{ id: 'policy_1', name: 'Policy 1', status: 'policy', overrides: { params: {}, outputs: [], sim_config: {} } }],
    }));

    await useEditorStore.getState().runScenarioBatch();

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0]?.[0]?.include_baseline).toBe(true);
  });

  it('loads Vensim preset and stores partial status when warnings or gaps exist', async () => {
    const imported: VensimImportResponse = {
      ok: true,
      import_id: 'preset_1',
      source: { filename: 'Random Numbers.mdl', format: 'vensim-mdl' },
      capabilities: {
        tier: 'T2',
        supported: ['INITIAL TIME'],
        partial: ['RANDOM NORMAL'],
        unsupported: [],
        detected_functions: ['RANDOM NORMAL'],
        detected_time_settings: ['INITIAL TIME', 'FINAL TIME', 'TIME STEP', 'SAVEPER'],
        details: [],
        families: [],
      },
      warnings: [{ code: 'VENSIM_PARTIAL_SUPPORT_WARNING', message: 'partial support', severity: 'warning' }],
      errors: [],
      model_view: {
        canonical: cloneModel(teacupModel),
        variables: [],
        import_gaps: {
          dropped_variables: 1,
          dropped_edges: 2,
          unparsed_equations: 0,
          unsupported_constructs: [],
          samples: [],
        },
      },
    };
    vi.spyOn(api, 'importVensimFile').mockResolvedValue(imported);

    await useEditorStore.getState().loadVensimPreset({
      id: 'mdl_random_numbers',
      filename: 'Random Numbers.mdl',
      label: 'Random Numbers',
      source: '{UTF-8}\n',
      features: ['stochastic'],
    });

    const state = useEditorStore.getState();
    expect(state.activeSimulationMode).toBe('vensim');
    expect(state.vensimPresetStatus.mdl_random_numbers?.status).toBe('partial');
    expect(state.vensimPresetCache.mdl_random_numbers?.import_id).toBe('preset_1');
    expect(state.isLoadingVensimPreset).toBe(false);
    expect(state.loadingVensimPresetId).toBeNull();
  });

  it('marks preset as failed and preserves current model when preset import fails', async () => {
    const beforeId = useEditorStore.getState().model.id;
    vi.spyOn(api, 'importVensimFile').mockRejectedValue({
      errors: [{ message: 'translation failed' }],
    });

    await useEditorStore.getState().loadVensimPreset({
      id: 'mdl_broken',
      filename: 'Broken.mdl',
      label: 'Broken',
      source: '{UTF-8}\nBROKEN',
      features: [],
    });

    const state = useEditorStore.getState();
    expect(state.model.id).toBe(beforeId);
    expect(state.vensimPresetStatus.mdl_broken?.status).toBe('failed');
    expect(state.apiError).toContain('translation failed');
    expect(state.isLoadingVensimPreset).toBe(false);
    expect(state.loadingVensimPresetId).toBeNull();
  });

  it('updates backend health state via setter', () => {
    useEditorStore.getState().setBackendHealthy(true);
    expect(useEditorStore.getState().backendHealthy).toBe(true);
    useEditorStore.getState().setBackendHealthy(false);
    expect(useEditorStore.getState().backendHealthy).toBe(false);
    useEditorStore.getState().setBackendHealthy(null);
    expect(useEditorStore.getState().backendHealthy).toBeNull();
  });
});
