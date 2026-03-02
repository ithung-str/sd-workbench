import { create } from 'zustand';
import {
  executeAiCommand,
  getVensimDiagnostics,
  importVensimFile,
  runMonteCarlo,
  runOATSensitivity,
  runVensimMonteCarlo,
  runVensimOATSensitivity,
  simulateImportedVensim,
  simulateImportedVensimBatch,
  simulateModel,
  simulateScenarioBatch,
  validateModel,
} from '../lib/api';
import { firstFreeRect, resolveCardRect } from '../lib/dashboardLayout';
import { computeAutoLayout } from '../lib/autoLayout';
import { localValidate } from '../lib/modelValidation';
import { blankModel, cloneModel, teacupModel } from '../lib/sampleModels';
import type {
  AIChatMessage,
  BatchSimulateResponse,
  CldSymbol,
  CldLoopDirection,
  DashboardCard,
  DashboardDefinition,
  EdgeModel,
  GlobalVariable,
  ModelDocument,
  MonteCarloParameter,
  MonteCarloResponse,
  NodeModel,
  OATSensitivityResponse,
  ScenarioDefinition,
  SimConfig,
  SimulateResponse,
  ValidateResponse,
  ValidationIssue,
  VensimImportResponse,
  VensimPresetLoadStatus,
} from '../types/model';
import type { VensimPresetDescriptor } from '../lib/vensimPresets';

export type DockTab = 'validation' | 'chart' | 'table' | 'compare' | 'sensitivity';
export type WorkbenchTab = 'canvas' | 'formulas' | 'dashboard' | 'scenarios';

type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'global_variable'; id: string }
  | null;

type CanvasInsertNodeType = Exclude<NodeModel['type'], 'cld_symbol'>;
type HistoryEntry = { model: ModelDocument; selected: Selection };
type PendingCommit = {
  key: string;
  timerId: ReturnType<typeof setTimeout> | null;
  before: HistoryEntry;
  after: HistoryEntry;
};

const HISTORY_LIMIT = 100;
const GROUPED_COMMIT_DEBOUNCE_MS = 350;

type VensimPresetStatus = {
  status: VensimPresetLoadStatus;
  summary: string;
  import_id?: string;
};

type EditorState = {
  model: ModelDocument;
  selected: Selection;
  simConfig: SimConfig;
  activeSimulationMode: 'native_json' | 'vensim';
  importedVensim: VensimImportResponse | null;
  vensimSelectedOutputs: string[];
  vensimParamOverrides: Record<string, number | string>;
  vensimPresetCache: Record<string, VensimImportResponse>;
  vensimPresetStatus: Record<string, VensimPresetStatus>;
  scenarios: ScenarioDefinition[];
  activeScenarioId: string;
  dashboards: DashboardDefinition[];
  activeDashboardId: string | null;
  compareResults: BatchSimulateResponse | null;
  oatResults: OATSensitivityResponse | null;
  monteCarloResults: MonteCarloResponse | null;
  aiCommand: string;
  aiChatHistory: AIChatMessage[];
  aiChatOpen: boolean;
  validation: ValidateResponse;
  localIssues: ValidationIssue[];
  results: SimulateResponse | null;
  apiError: string | null;
  activeDockTab: DockTab;
  isValidating: boolean;
  isSimulating: boolean;
  isApplyingAi: boolean;
  isRunningBatch: boolean;
  isRunningSensitivity: boolean;
  isCanvasLocked: boolean;
  activeTab: WorkbenchTab;
  backendHealthy: boolean | null;
  isLoadingVensimPreset: boolean;
  loadingVensimPresetId: string | null;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  historyLimit: number;
  pendingCommit: PendingCommit | null;
  setSelected: (selected: Selection) => void;
  setCanvasLocked: (locked: boolean) => void;
  addNode: (type: CanvasInsertNodeType) => void;
  addCldSymbol: (symbol: CldSymbol) => void;
  addGlobalVariable: () => void;
  updateGlobalVariable: (id: string, patch: Partial<GlobalVariable>) => void;
  deleteGlobalVariable: (id: string) => void;
  updateNode: (id: string, patch: Partial<NodeModel>) => void;
  updateNodePosition: (id: string, x: number, y: number) => void;
  commitNodePosition: (id: string, x: number, y: number) => void;
  addEdge: (edge: EdgeModel) => void;
  deleteSelected: () => void;
  cleanPhantoms: () => void;
  addDanglingEdge: (sourceId: string, sourceHandle: string | null, position: { x: number; y: number }) => void;
  completeDanglingEdge: (phantomId: string, targetId: string) => void;
  createFlowBetweenStocks: (sourceStockId: string, targetStockId: string) => void;
  createFlowToCloud: (sourceStockId: string, dropPosition: { x: number; y: number }) => void;
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
  setActiveDockTab: (tab: DockTab) => void;
  setSimConfig: (patch: Partial<SimConfig>) => void;
  runValidate: () => Promise<void>;
  runSimulate: () => Promise<void>;
  runScenarioBatch: () => Promise<void>;
  runOATSensitivity: (args: {
    output: string;
    metric: 'final' | 'max' | 'min' | 'mean';
    parameters: Array<{ name: string; low: number; high: number; steps: number }>;
  }) => Promise<void>;
  runMonteCarlo: (args: {
    output: string;
    metric: 'final' | 'max' | 'min' | 'mean';
    runs: number;
    seed: number;
    parameters: MonteCarloParameter[];
  }) => Promise<void>;
  loadModel: (model: ModelDocument) => void;
  importVensim: (file: File) => Promise<void>;
  loadVensimPreset: (preset: VensimPresetDescriptor) => Promise<void>;
  setVensimSelectedOutputs: (outputs: string[]) => void;
  setVensimParamOverride: (name: string, value: number | string | undefined) => void;
  setAiCommand: (value: string) => void;
  runAiCommand: () => Promise<void>;
  clearAiChat: () => void;
  setAiChatOpen: (open: boolean) => void;
  createScenario: () => void;
  updateScenario: (id: string, patch: Partial<ScenarioDefinition>) => void;
  deleteScenario: (id: string) => void;
  setActiveScenario: (id: string) => void;
  createDashboard: (name?: string, cards?: Omit<DashboardCard, 'id' | 'order'>[]) => void;
  updateDashboard: (id: string, patch: Partial<DashboardDefinition>) => void;
  deleteDashboard: (id: string) => void;
  setActiveDashboard: (id: string) => void;
  addDashboardCard: (dashboardId: string, card: Omit<DashboardCard, 'id' | 'order'> & { id?: string; order?: number }) => void;
  updateDashboardCard: (dashboardId: string, cardId: string, patch: Partial<DashboardCard>) => void;
  moveDashboardCard: (dashboardId: string, cardId: string, direction: 'up' | 'down') => void;
  deleteDashboardCard: (dashboardId: string, cardId: string) => void;
  updateDefaultStyle: (nodeType: 'stock' | 'flow' | 'aux' | 'lookup', style: Partial<import('../types/model').VisualStyle>) => void;
  setActiveTab: (tab: WorkbenchTab) => void;
  setBackendHealthy: (value: boolean | null) => void;
  autoOrganize: () => void;
  alignNodes: (direction: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v', nodeIds: string[]) => void;
};

function defaultValidation(): ValidateResponse {
  return { ok: true, errors: [], warnings: [] };
}

function nextNodeDefaults(type: CanvasInsertNodeType, count: number): NodeModel {
  const n = count + 1;
  if (type === 'stock') {
    return {
      id: `stock_${n}`,
      type: 'stock',
      name: `stock_${n}`,
      label: `Stock ${n}`,
      equation: '0',
      initial_value: 0,
      position: { x: 160 + n * 40, y: 100 + n * 30 },
    };
  }
  if (type === 'flow') {
    return {
      id: `flow_${n}`,
      type: 'flow',
      name: `flow_${n}`,
      label: `Flow ${n}`,
      equation: '0',
      position: { x: 280 + n * 40, y: 160 + n * 30 },
    };
  }
  if (type === 'cloud') {
    return {
      id: `cloud_${n}`,
      type: 'cloud',
      position: { x: 200 + n * 40, y: 160 + n * 30 },
    };
  }
  if (type === 'lookup') {
    return {
      id: `lookup_${n}`,
      type: 'lookup',
      name: `lookup_${n}`,
      label: `Lookup ${n}`,
      equation: '0',
      points: [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      interpolation: 'linear',
      position: { x: 240 + n * 40, y: 140 + n * 30 },
    };
  }
  if (type === 'text') {
    return {
      id: `text_${n}`,
      type: 'text',
      text: 'Note',
      position: { x: 260 + n * 20, y: 140 + n * 20 },
    };
  }
  return {
    id: `aux_${n}`,
    type: 'aux',
    name: `aux_${n}`,
    label: `Variable ${n}`,
    equation: '0',
    position: { x: 220 + n * 40, y: 120 + n * 30 },
  };
}

function defaultLoopDirection(symbol: CldSymbol): CldLoopDirection {
  return symbol === 'B' ? 'counterclockwise' : 'clockwise';
}

function nextCldSymbolNode(symbol: CldSymbol, count: number): NodeModel {
  const n = count + 1;
  return {
    id: `cld_symbol_${n}`,
    type: 'cld_symbol',
    symbol,
    loop_direction: defaultLoopDirection(symbol),
    position: { x: 260 + n * 20, y: 110 + n * 20 },
  };
}

function defaultScenarios(model: ModelDocument): { scenarios: ScenarioDefinition[]; activeScenarioId: string } {
  const existing = model.metadata?.analysis?.scenarios ?? [];
  if (existing.length > 0) {
    const baseline =
      model.metadata?.analysis?.defaults?.baseline_scenario_id ??
      existing.find((scenario) => scenario.status === 'baseline')?.id ??
      existing[0].id;
    return { scenarios: existing, activeScenarioId: baseline };
  }
  const baseline: ScenarioDefinition = {
    id: 'baseline',
    name: 'Baseline',
    status: 'baseline',
    color: '#1b6ca8',
    overrides: { params: {}, outputs: [], sim_config: {} },
  };
  return { scenarios: [baseline], activeScenarioId: baseline.id };
}

function persistScenarios(model: ModelDocument, scenarios: ScenarioDefinition[], activeScenarioId: string): ModelDocument {
  const existingAnalysis = model.metadata?.analysis;
  const existingDashboards = existingAnalysis?.dashboards ?? [];
  const existingActiveDashboardId = existingAnalysis?.defaults?.active_dashboard_id;
  return {
    ...model,
    metadata: {
      ...(model.metadata ?? {}),
      analysis: {
        scenarios,
        dashboards: existingDashboards,
        defaults: {
          baseline_scenario_id: activeScenarioId,
          active_dashboard_id: existingActiveDashboardId,
        },
      },
    },
  };
}

function defaultDashboards(model: ModelDocument): { dashboards: DashboardDefinition[]; activeDashboardId: string | null } {
  const existing = model.metadata?.analysis?.dashboards ?? [];
  if (existing.length === 0) {
    return { dashboards: [], activeDashboardId: null };
  }
  const activeId = model.metadata?.analysis?.defaults?.active_dashboard_id ?? existing[0].id;
  const hasActive = existing.some((dashboard) => dashboard.id === activeId);
  return { dashboards: existing, activeDashboardId: hasActive ? activeId : existing[0].id };
}

function persistAnalysis(
  model: ModelDocument,
  scenarios: ScenarioDefinition[],
  activeScenarioId: string,
  dashboards: DashboardDefinition[],
  activeDashboardId: string | null,
): ModelDocument {
  return {
    ...model,
    metadata: {
      ...(model.metadata ?? {}),
      analysis: {
        scenarios,
        dashboards,
        defaults: {
          baseline_scenario_id: activeScenarioId,
          active_dashboard_id: activeDashboardId ?? undefined,
        },
      },
    },
  };
}

function scenarioById(scenarios: ScenarioDefinition[], id: string): ScenarioDefinition | undefined {
  return scenarios.find((scenario) => scenario.id === id);
}

function requestErrorMessage(action: 'Validation' | 'Simulation', error: unknown): string {
  if (error instanceof TypeError) {
    return `${action} request failed (backend unreachable)`;
  }
  return `${action} request failed`;
}

function cloneSelection(selection: Selection): Selection {
  return selection ? { ...selection } : null;
}

function snapshotFromState(model: ModelDocument, selected: Selection): HistoryEntry {
  return { model: cloneModel(model), selected: cloneSelection(selected) };
}

function snapshotsEqual(a: HistoryEntry, b: HistoryEntry): boolean {
  const aSel = a.selected;
  const bSel = b.selected;
  const selectedEqual = !aSel && !bSel
    ? true
    : Boolean(aSel && bSel && aSel.kind === bSel.kind && aSel.id === bSel.id);
  if (!selectedEqual) return false;
  return JSON.stringify(a.model) === JSON.stringify(b.model);
}

function summarizeImportStatus(imported: VensimImportResponse): VensimPresetStatus {
  const gaps = imported.model_view.import_gaps;
  const hasWarnings = imported.warnings.length > 0;
  const hasErrors = imported.errors.length > 0;
  const hasGaps =
    (gaps?.dropped_variables ?? 0) > 0 ||
    (gaps?.dropped_edges ?? 0) > 0 ||
    (gaps?.unparsed_equations ?? 0) > 0 ||
    (gaps?.unsupported_constructs?.length ?? 0) > 0;
  if (hasWarnings || hasErrors || hasGaps) {
    const parts: string[] = [];
    if ((gaps?.dropped_variables ?? 0) > 0) parts.push(`${gaps?.dropped_variables} variable gaps`);
    if ((gaps?.dropped_edges ?? 0) > 0) parts.push(`${gaps?.dropped_edges} edge gaps`);
    if ((gaps?.unsupported_constructs?.length ?? 0) > 0) parts.push(`${gaps?.unsupported_constructs.length} unsupported constructs`);
    if (parts.length === 0 && hasWarnings) parts.push(`${imported.warnings.length} warning(s)`);
    return {
      status: 'partial',
      summary: parts.join(', ') || 'Partial import',
      import_id: imported.import_id,
    };
  }
  return {
    status: 'ok',
    summary: 'Import successful',
    import_id: imported.import_id,
  };
}

export const useEditorStore = create<EditorState>((set, get) => {
  const initialModel = cloneModel(teacupModel);
  const initialScenarios = defaultScenarios(initialModel);
  const initialDashboards = defaultDashboards(initialModel);
  const pushHistory = (before: HistoryEntry, after: HistoryEntry) => {
    if (snapshotsEqual(before, after)) return;
    set((state) => {
      let undoStack = [...state.undoStack, before];
      if (undoStack.length > state.historyLimit) {
        undoStack = undoStack.slice(undoStack.length - state.historyLimit);
      }
      return { undoStack, redoStack: [] };
    });
  };
  const flushPendingCommit = () => {
    const pending = get().pendingCommit;
    if (!pending) return;
    if (pending.timerId) clearTimeout(pending.timerId);
    set({ pendingCommit: null });
    pushHistory(pending.before, pending.after);
  };
  const scheduleGroupedCommit = (groupKey: string, before: HistoryEntry, after: HistoryEntry, debounceMs = GROUPED_COMMIT_DEBOUNCE_MS) => {
    if (snapshotsEqual(before, after)) return;
    const existing = get().pendingCommit;
    let groupBefore = before;
    if (existing) {
      if (existing.timerId) clearTimeout(existing.timerId);
      if (existing.key === groupKey) {
        groupBefore = existing.before;
      } else {
        set({ pendingCommit: null });
        pushHistory(existing.before, existing.after);
      }
    }
    const pending: PendingCommit = {
      key: groupKey,
      timerId: null,
      before: groupBefore,
      after,
    };
    const timerId = setTimeout(() => {
      const current = get().pendingCommit;
      if (!current || current.key !== groupKey) return;
      set({ pendingCommit: null });
      pushHistory(current.before, current.after);
    }, debounceMs);
    set({ pendingCommit: { ...pending, timerId } });
  };
  const clearHistory = () => {
    const pending = get().pendingCommit;
    if (pending?.timerId) clearTimeout(pending.timerId);
    set({ undoStack: [], redoStack: [], pendingCommit: null });
  };
  const applyImportedVensimState = (
    importedVensim: VensimImportResponse,
    extra?: Partial<Pick<EditorState, 'vensimPresetCache' | 'vensimPresetStatus'>>,
  ) => {
    const canonical = importedVensim.model_view.canonical ?? cloneModel(blankModel);
    const scenarioDefaults = defaultScenarios(canonical);
    const dashboardDefaults = defaultDashboards(canonical);
    const persisted = persistAnalysis(
      canonical,
      scenarioDefaults.scenarios,
      scenarioDefaults.activeScenarioId,
      dashboardDefaults.dashboards,
      dashboardDefaults.activeDashboardId,
    );
    const time = importedVensim.model_view.time_settings;
    set({
      importedVensim,
      activeSimulationMode: 'vensim',
      model: cloneModel(persisted),
      scenarios: scenarioDefaults.scenarios,
      activeScenarioId: scenarioDefaults.activeScenarioId,
      dashboards: dashboardDefaults.dashboards,
      activeDashboardId: dashboardDefaults.activeDashboardId,
      selected: null,
      results: null,
      compareResults: null,
      oatResults: null,
      monteCarloResults: null,
      validation: { ok: importedVensim.errors.length === 0, errors: importedVensim.errors, warnings: importedVensim.warnings },
      localIssues: [],
      isValidating: false,
      activeDockTab: 'validation',
      vensimSelectedOutputs: importedVensim.model_view.variables.slice(0, 20).map((v) => v.name),
      vensimParamOverrides: {},
      simConfig: {
        start: time?.initial_time ?? 0,
        stop: time?.final_time ?? 30,
        dt: time?.time_step ?? 1,
        return_step: time?.saveper ?? time?.time_step ?? 1,
        method: 'euler',
      },
      ...extra,
    });
    clearHistory();
  };
  return {
    model: persistAnalysis(
      initialModel,
      initialScenarios.scenarios,
      initialScenarios.activeScenarioId,
      initialDashboards.dashboards,
      initialDashboards.activeDashboardId,
    ),
    selected: null,
    simConfig: { start: 0, stop: 30, dt: 1, method: 'euler' },
    activeSimulationMode: 'native_json',
    importedVensim: null,
    vensimSelectedOutputs: [],
    vensimParamOverrides: {},
    vensimPresetCache: {},
    vensimPresetStatus: {},
    scenarios: initialScenarios.scenarios,
    activeScenarioId: initialScenarios.activeScenarioId,
    dashboards: initialDashboards.dashboards,
    activeDashboardId: initialDashboards.activeDashboardId,
    compareResults: null,
    oatResults: null,
    monteCarloResults: null,
    aiCommand: '',
    aiChatHistory: [],
    aiChatOpen: false,
    validation: defaultValidation(),
    localIssues: [],
    results: null,
    apiError: null,
    activeDockTab: 'validation',
    isValidating: false,
    isSimulating: false,
    isApplyingAi: false,
    isRunningBatch: false,
    isRunningSensitivity: false,
    isCanvasLocked: false,
    activeTab: 'canvas',
    backendHealthy: null,
    isLoadingVensimPreset: false,
    loadingVensimPresetId: null,
    undoStack: [],
    redoStack: [],
    historyLimit: HISTORY_LIMIT,
    pendingCommit: null,
    setSelected: (selected) => set({ selected }),
    setActiveTab: (activeTab) => set({ activeTab }),
    setBackendHealthy: (value) => set({ backendHealthy: value }),
    setCanvasLocked: (locked) => set({ isCanvasLocked: locked }),
    addNode: (type) => {
      flushPendingCommit();
      const before = snapshotFromState(get().model, get().selected);
      set((state) => {
        const count = state.model.nodes.length;
        if (type === 'flow') {
          const cloudNode = nextNodeDefaults('cloud', count);
          const flowNode = nextNodeDefaults('flow', count);
          const edge: EdgeModel = {
            id: `e_${Date.now()}`,
            type: 'flow_link',
            source: cloudNode.id,
            target: flowNode.id,
          };
          const model = {
            ...state.model,
            nodes: [...state.model.nodes, cloudNode, flowNode],
            edges: [...state.model.edges, edge],
          };
          return { model, selected: { kind: 'node', id: flowNode.id }, localIssues: localValidate(model) };
        }
        const node = nextNodeDefaults(type, count);
        const model = { ...state.model, nodes: [...state.model.nodes, node] };
        return { model, selected: { kind: 'node', id: node.id }, localIssues: localValidate(model) };
      });
      const afterState = get();
      pushHistory(before, snapshotFromState(afterState.model, afterState.selected));
    },
    addCldSymbol: (symbol) => {
      flushPendingCommit();
      const before = snapshotFromState(get().model, get().selected);
      set((state) => {
        const count = state.model.nodes.length;
        const node = nextCldSymbolNode(symbol, count);
        const model = { ...state.model, nodes: [...state.model.nodes, node] };
        return { model, selected: { kind: 'node', id: node.id }, localIssues: localValidate(model) };
      });
      const afterState = get();
      pushHistory(before, snapshotFromState(afterState.model, afterState.selected));
    },
    addGlobalVariable: () => {
      flushPendingCommit();
      const before = snapshotFromState(get().model, get().selected);
      set((state) => {
        const next = (state.model.global_variables?.length ?? 0) + 1;
        const variable: GlobalVariable = {
          id: `global_${next}`,
          name: `global_${next}`,
          equation: '0',
        };
        const model = {
          ...state.model,
          global_variables: [...(state.model.global_variables ?? []), variable],
        };
        return { model, localIssues: localValidate(model) };
      });
      const afterState = get();
      pushHistory(before, snapshotFromState(afterState.model, afterState.selected));
    },
    updateGlobalVariable: (id, patch) => {
      const before = snapshotFromState(get().model, get().selected);
      set((state) => {
        const model = {
          ...state.model,
          global_variables: (state.model.global_variables ?? []).map((variable) =>
            variable.id === id ? { ...variable, ...patch } : variable,
          ),
        };
        return { model, localIssues: localValidate(model) };
      });
      const afterState = get();
      scheduleGroupedCommit(`global:${id}:${Object.keys(patch).sort().join(',')}`, before, snapshotFromState(afterState.model, afterState.selected));
    },
    deleteGlobalVariable: (id) => {
      flushPendingCommit();
      const before = snapshotFromState(get().model, get().selected);
      set((state) => {
        const model = {
          ...state.model,
          global_variables: (state.model.global_variables ?? []).filter((variable) => variable.id !== id),
        };
        return { model, localIssues: localValidate(model), selected: state.selected?.kind === 'global_variable' && state.selected.id === id ? null : state.selected };
      });
      const afterState = get();
      pushHistory(before, snapshotFromState(afterState.model, afterState.selected));
    },
    updateNode: (id, patch) => {
      const before = snapshotFromState(get().model, get().selected);
      set((state) => {
        const nodes = state.model.nodes.map((node) => (node.id === id ? ({ ...node, ...patch } as NodeModel) : node));
        const model = { ...state.model, nodes };
        return { model, localIssues: localValidate(model) };
      });
      const afterState = get();
      scheduleGroupedCommit(`node:${id}:${Object.keys(patch).sort().join(',')}`, before, snapshotFromState(afterState.model, afterState.selected));
    },
    updateNodePosition: (id, x, y) => {
      set((state) => ({
        model: {
          ...state.model,
          nodes: state.model.nodes.map((n) => (n.id === id ? { ...n, position: { x, y } } : n)),
        },
      }));
    },
    commitNodePosition: (id, x, y) => {
      flushPendingCommit();
      const before = snapshotFromState(get().model, get().selected);
      set((state) => ({
        model: {
          ...state.model,
          nodes: state.model.nodes.map((n) => (n.id === id ? { ...n, position: { x, y } } : n)),
        },
      }));
      const afterState = get();
      pushHistory(before, snapshotFromState(afterState.model, afterState.selected));
    },
    addEdge: (edge) => {
      flushPendingCommit();
      const before = snapshotFromState(get().model, get().selected);
      set((state) => ({ model: { ...state.model, edges: [...state.model.edges, edge] } }));
      const afterState = get();
      pushHistory(before, snapshotFromState(afterState.model, afterState.selected));
    },
    deleteSelected: () => {
      flushPendingCommit();
      const before = snapshotFromState(get().model, get().selected);
      set((state) => {
        if (!state.selected) return {} as Partial<EditorState>;
        if (state.selected.kind === 'node') {
          const id = state.selected.id;
          const model = {
            ...state.model,
            nodes: state.model.nodes.filter((n) => n.id !== id),
            edges: state.model.edges.filter((e) => e.source !== id && e.target !== id),
          };
          return { model, selected: null, localIssues: localValidate(model) };
        }
        if (state.selected.kind === 'global_variable') {
          const model = {
            ...state.model,
            global_variables: (state.model.global_variables ?? []).filter((g) => g.id !== state.selected?.id),
          };
          return { model, selected: null, localIssues: localValidate(model) };
        }
        const model = { ...state.model, edges: state.model.edges.filter((e) => e.id !== state.selected?.id) };
        return { model, selected: null };
      });
      const afterState = get();
      pushHistory(before, snapshotFromState(afterState.model, afterState.selected));
    },
    cleanPhantoms: () => {
      const state = get();
      const phantomIds = new Set(state.model.nodes.filter((n) => n.type === 'phantom').map((n) => n.id));
      if (phantomIds.size === 0) return;
      flushPendingCommit();
      const before = snapshotFromState(state.model, state.selected);
      set((s) => {
        const nodes = s.model.nodes.filter((n) => n.type !== 'phantom');
        const edges = s.model.edges.filter((e) => !phantomIds.has(e.source) && !phantomIds.has(e.target));
        const model = { ...s.model, nodes, edges };
        return { model, localIssues: localValidate(model) };
      });
      const afterState2 = get();
      pushHistory(before, snapshotFromState(afterState2.model, afterState2.selected));
    },
    addDanglingEdge: (sourceId, sourceHandle, position) => {
      flushPendingCommit();
      const before = snapshotFromState(get().model, get().selected);
      const phantomId = `phantom_${Date.now()}`;
      set((state) => {
        const phantomNode: NodeModel = { id: phantomId, type: 'phantom', position };
        const edge: EdgeModel = {
          id: `e_${Date.now()}`,
          type: 'influence',
          source: sourceId,
          target: phantomId,
          source_handle: undefined,
          target_handle: undefined,
        };
        const model = {
          ...state.model,
          nodes: [...state.model.nodes, phantomNode],
          edges: [...state.model.edges, edge],
        };
        return { model, localIssues: localValidate(model) };
      });
      const afterState = get();
      pushHistory(before, snapshotFromState(afterState.model, afterState.selected));
    },
    completeDanglingEdge: (phantomId, targetId) => {
      flushPendingCommit();
      // Stocks cannot receive influence edges
      const targetNode = get().model.nodes.find((n) => n.id === targetId);
      if (targetNode?.type === 'stock') return;
      const before = snapshotFromState(get().model, get().selected);
      set((state) => {
        const edges = state.model.edges.map((e) =>
          e.target === phantomId ? { ...e, target: targetId, target_handle: undefined } : e,
        );
        const nodes = state.model.nodes.filter((n) => n.id !== phantomId);
        const model = { ...state.model, nodes, edges };
        return { model, localIssues: localValidate(model) };
      });
      const afterState = get();
      pushHistory(before, snapshotFromState(afterState.model, afterState.selected));
    },
    createFlowBetweenStocks: (sourceStockId, targetStockId) => {
      flushPendingCommit();
      const before = snapshotFromState(get().model, get().selected);
      set((state) => {
        const sourceStock = state.model.nodes.find((n) => n.id === sourceStockId);
        const targetStock = state.model.nodes.find((n) => n.id === targetStockId);
        if (!sourceStock || !targetStock) return {} as Partial<EditorState>;
        const midX = (sourceStock.position.x + targetStock.position.x) / 2;
        const midY = (sourceStock.position.y + targetStock.position.y) / 2;
        const n = state.model.nodes.filter((nd) => nd.type === 'flow').length + 1;
        const flowId = `flow_${Date.now()}`;
        const flowNode: NodeModel = {
          id: flowId,
          type: 'flow',
          name: `flow_${n}`,
          label: `Flow ${n}`,
          equation: '0',
          source_stock_id: sourceStockId,
          target_stock_id: targetStockId,
          position: { x: midX, y: midY },
        };
        const edge1: EdgeModel = { id: `e_${Date.now()}_1`, type: 'flow_link', source: sourceStockId, target: flowId };
        const edge2: EdgeModel = { id: `e_${Date.now()}_2`, type: 'flow_link', source: flowId, target: targetStockId };
        const model = {
          ...state.model,
          nodes: [...state.model.nodes, flowNode],
          edges: [...state.model.edges, edge1, edge2],
        };
        return { model, localIssues: localValidate(model) };
      });
      const afterState = get();
      pushHistory(before, snapshotFromState(afterState.model, afterState.selected));
    },
    createFlowToCloud: (sourceStockId, dropPosition) => {
      flushPendingCommit();
      const before = snapshotFromState(get().model, get().selected);
      set((state) => {
        const sourceStock = state.model.nodes.find((n) => n.id === sourceStockId);
        if (!sourceStock) return {} as Partial<EditorState>;
        const midX = (sourceStock.position.x + dropPosition.x) / 2;
        const midY = (sourceStock.position.y + dropPosition.y) / 2;
        const n = state.model.nodes.filter((nd) => nd.type === 'flow').length + 1;
        const cn = state.model.nodes.filter((nd) => nd.type === 'cloud').length + 1;
        const flowId = `flow_${Date.now()}`;
        const cloudId = `cloud_${Date.now()}`;
        const cloudNode: NodeModel = { id: cloudId, type: 'cloud', position: dropPosition };
        const flowNode: NodeModel = {
          id: flowId,
          type: 'flow',
          name: `flow_${n}`,
          label: `Flow ${n}`,
          equation: '0',
          source_stock_id: sourceStockId,
          target_stock_id: cloudId,
          position: { x: midX, y: midY },
        };
        const edge1: EdgeModel = { id: `e_${Date.now()}_1`, type: 'flow_link', source: sourceStockId, target: flowId };
        const edge2: EdgeModel = { id: `e_${Date.now()}_2`, type: 'flow_link', source: flowId, target: cloudId };
        const model = {
          ...state.model,
          nodes: [...state.model.nodes, cloudNode, flowNode],
          edges: [...state.model.edges, edge1, edge2],
        };
        return { model, localIssues: localValidate(model) };
      });
      const afterState = get();
      pushHistory(before, snapshotFromState(afterState.model, afterState.selected));
    },
    undo: () => {
      flushPendingCommit();
      const state = get();
      const previous = state.undoStack[state.undoStack.length - 1];
      if (!previous) return;
      const current = snapshotFromState(state.model, state.selected);
      let redoStack = [...state.redoStack, current];
      if (redoStack.length > state.historyLimit) {
        redoStack = redoStack.slice(redoStack.length - state.historyLimit);
      }
      set({
        model: cloneModel(previous.model),
        selected: cloneSelection(previous.selected),
        undoStack: state.undoStack.slice(0, -1),
        redoStack,
        localIssues: localValidate(previous.model),
      });
    },
    redo: () => {
      flushPendingCommit();
      const state = get();
      const next = state.redoStack[state.redoStack.length - 1];
      if (!next) return;
      const current = snapshotFromState(state.model, state.selected);
      let undoStack = [...state.undoStack, current];
      if (undoStack.length > state.historyLimit) {
        undoStack = undoStack.slice(undoStack.length - state.historyLimit);
      }
      set({
        model: cloneModel(next.model),
        selected: cloneSelection(next.selected),
        undoStack,
        redoStack: state.redoStack.slice(0, -1),
        localIssues: localValidate(next.model),
      });
    },
    canUndo: () => get().undoStack.length > 0,
    canRedo: () => get().redoStack.length > 0,
    setActiveDockTab: (activeDockTab) => set({ activeDockTab }),
    setVensimSelectedOutputs: (vensimSelectedOutputs) => set({ vensimSelectedOutputs }),
    setVensimParamOverride: (name, value) =>
      set((state) => {
        const next = { ...state.vensimParamOverrides };
        if (value === undefined || value === '') {
          delete next[name];
        } else {
          next[name] = value;
        }
        return { vensimParamOverrides: next };
      }),
    setAiCommand: (aiCommand) => set({ aiCommand }),
    setSimConfig: (patch) => set((state) => ({ simConfig: { ...state.simConfig, ...patch } })),
    runValidate: async () => {
      const { model, activeSimulationMode } = get();
      if (activeSimulationMode === 'vensim') {
        set({ validation: defaultValidation(), localIssues: [], isValidating: false });
        return;
      }
      set({ isValidating: true, apiError: null, localIssues: localValidate(model) });
      try {
        const validation = await validateModel(model);
        set({ validation, isValidating: false, backendHealthy: true });
      } catch (error: unknown) {
        set({
          isValidating: false,
          backendHealthy: false,
          apiError: requestErrorMessage('Validation', error),
        });
      }
    },
    runSimulate: async () => {
      const { model, simConfig, activeSimulationMode, importedVensim, vensimSelectedOutputs, vensimParamOverrides } = get();
      set({ isSimulating: true, apiError: null });
      try {
        const results =
          activeSimulationMode === 'vensim' && importedVensim
            ? await simulateImportedVensim({
                import_id: importedVensim.import_id,
                sim_config: {
                  start: simConfig.start,
                  stop: simConfig.stop,
                  dt: simConfig.dt,
                  saveper: simConfig.return_step,
                },
                outputs: vensimSelectedOutputs,
                params: vensimParamOverrides,
              })
            : await simulateModel({ model, sim_config: simConfig });
        set({ results, isSimulating: false, activeDockTab: 'chart' });
      } catch (error: any) {
        const detail = error?.errors ? error : error?.detail ?? error;
        if (detail?.errors) {
          set({ validation: { ok: false, errors: detail.errors, warnings: detail.warnings ?? [] }, activeDockTab: 'validation' });
        }
        set({
          isSimulating: false,
          backendHealthy: detail?.errors ? true : false,
          apiError: requestErrorMessage('Simulation', error),
        });
      }
    },
    runScenarioBatch: async () => {
      const {
        model,
        simConfig,
        scenarios,
        activeSimulationMode,
        importedVensim,
        vensimSelectedOutputs,
      } = get();
      const hasBaselineScenario = scenarios.some(
        (scenario) =>
          scenario.status !== 'archived' &&
          (scenario.id === 'baseline' || scenario.status === 'baseline'),
      );
      set({ isRunningBatch: true, apiError: null, compareResults: null });
      try {
        const compareResults =
          activeSimulationMode === 'vensim' && importedVensim
            ? await simulateImportedVensimBatch({
                import_id: importedVensim.import_id,
                sim_config: {
                  start: simConfig.start,
                  stop: simConfig.stop,
                  dt: simConfig.dt,
                  saveper: simConfig.return_step,
                },
                scenarios,
                include_baseline: !hasBaselineScenario,
                outputs: vensimSelectedOutputs,
              })
            : await simulateScenarioBatch({
                model,
                sim_config: simConfig,
                scenarios,
                include_baseline: !hasBaselineScenario,
              });
        set({ compareResults, isRunningBatch: false, activeDockTab: 'compare' });
      } catch (error) {
        set({ isRunningBatch: false, apiError: 'Batch simulation failed' });
      }
    },
    runOATSensitivity: async ({ output, metric, parameters }) => {
      const { model, simConfig, scenarios, activeScenarioId, activeSimulationMode, importedVensim } = get();
      set({ isRunningSensitivity: true, apiError: null, oatResults: null });
      try {
        const oatResults =
          activeSimulationMode === 'vensim' && importedVensim
            ? await runVensimOATSensitivity({
                import_id: importedVensim.import_id,
                sim_config: {
                  start: simConfig.start,
                  stop: simConfig.stop,
                  dt: simConfig.dt,
                  saveper: simConfig.return_step,
                },
                scenarios,
                scenario_id: activeScenarioId,
                output,
                metric,
                parameters,
              })
            : await runOATSensitivity({
                model,
                sim_config: simConfig,
                scenarios,
                scenario_id: activeScenarioId,
                output,
                metric,
                parameters,
              });
        set({ oatResults, monteCarloResults: null, isRunningSensitivity: false, activeDockTab: 'sensitivity' });
      } catch (error) {
        set({ isRunningSensitivity: false, apiError: 'OAT sensitivity failed' });
      }
    },
    runMonteCarlo: async ({ output, metric, runs, seed, parameters }) => {
      const { model, simConfig, scenarios, activeScenarioId, activeSimulationMode, importedVensim } = get();
      set({ isRunningSensitivity: true, apiError: null, monteCarloResults: null });
      try {
        const monteCarloResults =
          activeSimulationMode === 'vensim' && importedVensim
            ? await runVensimMonteCarlo({
                import_id: importedVensim.import_id,
                sim_config: {
                  start: simConfig.start,
                  stop: simConfig.stop,
                  dt: simConfig.dt,
                  saveper: simConfig.return_step,
                },
                scenarios,
                scenario_id: activeScenarioId,
                output,
                metric,
                runs,
                seed,
                parameters,
              })
            : await runMonteCarlo({
                model,
                sim_config: simConfig,
                scenarios,
                scenario_id: activeScenarioId,
                output,
                metric,
                runs,
                seed,
                parameters,
              });
        set({ monteCarloResults, oatResults: null, isRunningSensitivity: false, activeDockTab: 'sensitivity' });
      } catch (error) {
        set({ isRunningSensitivity: false, apiError: 'Monte Carlo analysis failed' });
      }
    },
    runAiCommand: async () => {
      const { model, aiCommand, activeSimulationMode, aiChatHistory } = get();
      if (activeSimulationMode === 'vensim') {
        set({ apiError: 'AI canvas editing is currently available for native JSON models only.' });
        return;
      }
      if (!aiCommand.trim()) return;
      const userMessage = aiCommand.trim();
      // Add user message to chat history immediately and open chat
      const updatedHistory: AIChatMessage[] = [...aiChatHistory, { role: 'user', content: userMessage }];
      set({ isApplyingAi: true, apiError: null, aiCommand: '', aiChatHistory: updatedHistory, aiChatOpen: true });
      try {
        const response = await executeAiCommand(userMessage, model, aiChatHistory);

        if (response.needs_clarification) {
          // AI is asking a clarifying question — add to history, keep chat open
          set({
            isApplyingAi: false,
            aiChatHistory: [...updatedHistory, { role: 'assistant', content: response.assistant_message }],
          });
          return;
        }

        // AI returned a model update
        const assistantMsg = response.assistant_message || 'Model updated successfully.';
        const finalHistory: AIChatMessage[] = [...updatedHistory, { role: 'assistant', content: assistantMsg }];

        const updated = cloneModel(response.model!);
        const scenarioDefaults = defaultScenarios(updated);
        const dashboardDefaults = defaultDashboards(updated);
        const persisted = persistAnalysis(
          updated,
          scenarioDefaults.scenarios,
          scenarioDefaults.activeScenarioId,
          dashboardDefaults.dashboards,
          dashboardDefaults.activeDashboardId,
        );
        set({
          model: persisted,
          scenarios: scenarioDefaults.scenarios,
          activeScenarioId: scenarioDefaults.activeScenarioId,
          dashboards: dashboardDefaults.dashboards,
          activeDashboardId: dashboardDefaults.activeDashboardId,
          selected: null,
          localIssues: localValidate(persisted),
          validation: defaultValidation(),
          results: null,
          compareResults: null,
          oatResults: null,
          monteCarloResults: null,
          isApplyingAi: false,
          aiChatHistory: finalHistory,
        });
        clearHistory();
      } catch (error: any) {
        const errMsg = error?.errors?.[0]?.message ?? 'AI command failed';
        set({
          isApplyingAi: false,
          aiChatHistory: [...updatedHistory, { role: 'assistant', content: `Error: ${errMsg}` }],
          apiError: errMsg,
        });
      }
    },
    clearAiChat: () => set({ aiChatHistory: [], aiChatOpen: false, aiCommand: '' }),
    setAiChatOpen: (open) => set({ aiChatOpen: open }),
    loadModel: (model) => {
      const cloned = cloneModel({ ...model, global_variables: model.global_variables ?? [] });
      const scenarioDefaults = defaultScenarios(cloned);
      const dashboardDefaults = defaultDashboards(cloned);
      const persisted = persistAnalysis(
        cloned,
        scenarioDefaults.scenarios,
        scenarioDefaults.activeScenarioId,
        dashboardDefaults.dashboards,
        dashboardDefaults.activeDashboardId,
      );
      set({
        model: persisted,
        scenarios: scenarioDefaults.scenarios,
        activeScenarioId: scenarioDefaults.activeScenarioId,
        dashboards: dashboardDefaults.dashboards,
        activeDashboardId: dashboardDefaults.activeDashboardId,
        selected: null,
        results: null,
        compareResults: null,
        oatResults: null,
        monteCarloResults: null,
        validation: defaultValidation(),
        localIssues: localValidate(persisted),
        activeSimulationMode: 'native_json',
        importedVensim: null,
        vensimSelectedOutputs: [],
        vensimParamOverrides: {},
        isLoadingVensimPreset: false,
        loadingVensimPresetId: null,
      });
      clearHistory();
    },
    importVensim: async (file) => {
      set({ apiError: null, isValidating: true });
      try {
        const importedVensim = await importVensimFile(file);
        applyImportedVensimState(importedVensim);
      } catch (error: any) {
        set({ isValidating: false, apiError: error?.errors?.[0]?.message ?? error?.message ?? 'Vensim import failed' });
      }
    },
    loadVensimPreset: async (preset) => {
      set({
        apiError: null,
        isValidating: true,
        isLoadingVensimPreset: true,
        loadingVensimPresetId: preset.id,
      });
      const state = get();
      const cached = state.vensimPresetCache[preset.id];
      if (cached) {
        try {
          await getVensimDiagnostics(cached.import_id);
          applyImportedVensimState(cached);
          return;
        } catch {
          // Session expired; fallback to fresh import below.
        }
      }
      try {
        const file = new File([preset.source], preset.filename, { type: 'text/plain' });
        const importedVensim = await importVensimFile(file);
        const status = summarizeImportStatus(importedVensim);
        applyImportedVensimState(importedVensim, {
          vensimPresetCache: {
            ...get().vensimPresetCache,
            [preset.id]: importedVensim,
          },
          vensimPresetStatus: {
            ...get().vensimPresetStatus,
            [preset.id]: status,
          },
        });
      } catch (error: any) {
        const message = error?.errors?.[0]?.message ?? error?.message ?? `Vensim preset import failed: ${preset.filename}`;
        set((current) => ({
          isValidating: false,
          apiError: message,
          vensimPresetStatus: {
            ...current.vensimPresetStatus,
            [preset.id]: {
              status: 'failed',
              summary: message,
            },
          },
        }));
      } finally {
        set({ isLoadingVensimPreset: false, loadingVensimPresetId: null });
      }
    },
    createScenario: () => {
      set((state) => {
        const next: ScenarioDefinition = {
          id: `scenario_${Date.now()}`,
          name: `Scenario ${state.scenarios.length + 1}`,
          status: 'policy',
          color: '#d46a00',
          overrides: { params: {}, outputs: [], sim_config: {} },
        };
        const scenarios = [...state.scenarios, next];
        const activeScenarioId = next.id;
        return {
          scenarios,
          activeScenarioId,
          model: persistAnalysis(
            state.model,
            scenarios,
            activeScenarioId,
            state.dashboards,
            state.activeDashboardId,
          ),
        };
      });
    },
    updateScenario: (id, patch) => {
      set((state) => {
        const scenarios = state.scenarios.map((scenario) =>
          scenario.id === id
            ? {
                ...scenario,
                ...patch,
                overrides: {
                  ...(scenario.overrides ?? {}),
                  ...(patch.overrides ?? {}),
                  params: {
                    ...(scenario.overrides?.params ?? {}),
                    ...(patch.overrides?.params ?? {}),
                  },
                },
              }
            : scenario,
        );
        return {
          scenarios,
          model: persistAnalysis(
            state.model,
            scenarios,
            state.activeScenarioId,
            state.dashboards,
            state.activeDashboardId,
          ),
        };
      });
    },
    deleteScenario: (id) => {
      set((state) => {
        const scenarios = state.scenarios.filter((scenario) => scenario.id !== id && scenario.status !== 'baseline');
        const baseline = scenarioById(scenarios, state.activeScenarioId) ? state.activeScenarioId : (scenarios[0]?.id ?? 'baseline');
        return {
          scenarios,
          activeScenarioId: baseline,
          model: persistAnalysis(
            state.model,
            scenarios,
            baseline,
            state.dashboards,
            state.activeDashboardId,
          ),
        };
      });
    },
    setActiveScenario: (id) => {
      set((state) => ({
        activeScenarioId: id,
        model: persistAnalysis(state.model, state.scenarios, id, state.dashboards, state.activeDashboardId),
      }));
    },
    updateDefaultStyle: (nodeType, style) => {
      set((state) => {
        const existing = state.model.metadata?.default_styles ?? {};
        const merged = { ...existing, [nodeType]: { ...(existing[nodeType] ?? {}), ...style } };
        return {
          model: {
            ...state.model,
            metadata: { ...(state.model.metadata ?? {}), default_styles: merged },
          },
        };
      });
    },
    createDashboard: (name, templateCards) => {
      set((state) => {
        const id = `dashboard_${Date.now()}`;
        const builtCards: DashboardCard[] = [];
        const occupied: import('../lib/dashboardLayout').Rect[] = [];
        for (const [i, cardInput] of (templateCards ?? []).entries()) {
          const rect = resolveCardRect({ type: cardInput.type, x: cardInput.x, y: cardInput.y, w: cardInput.w, h: cardInput.h });
          const placed = firstFreeRect({ w: rect.w, h: rect.h }, occupied);
          builtCards.push({
            ...cardInput,
            id: `card_${Date.now()}_${i}`,
            order: i + 1,
            x: cardInput.x ?? placed.x,
            y: cardInput.y ?? placed.y,
            w: cardInput.w ?? placed.w,
            h: cardInput.h ?? placed.h,
          });
          occupied.push(placed);
        }
        const dashboard: DashboardDefinition = {
          id,
          name: name?.trim() || `Dashboard ${state.dashboards.length + 1}`,
          cards: builtCards,
        };
        const dashboards = [...state.dashboards, dashboard];
        return {
          dashboards,
          activeDashboardId: id,
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, dashboards, id),
        };
      });
    },
    updateDashboard: (id, patch) => {
      set((state) => {
        const dashboards = state.dashboards.map((dashboard) =>
          dashboard.id === id ? { ...dashboard, ...patch, cards: patch.cards ?? dashboard.cards } : dashboard,
        );
        return {
          dashboards,
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, dashboards, state.activeDashboardId),
        };
      });
    },
    deleteDashboard: (id) => {
      set((state) => {
        const dashboards = state.dashboards.filter((dashboard) => dashboard.id !== id);
        const activeDashboardId = state.activeDashboardId === id ? (dashboards[0]?.id ?? null) : state.activeDashboardId;
        return {
          dashboards,
          activeDashboardId,
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, dashboards, activeDashboardId),
        };
      });
    },
    setActiveDashboard: (id) => {
      set((state) => ({
        activeDashboardId: id,
        model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, state.dashboards, id),
      }));
    },
    addDashboardCard: (dashboardId, card) => {
      set((state) => {
        const dashboards = state.dashboards.map((dashboard) => {
          if (dashboard.id !== dashboardId) return dashboard;
          const nextOrder = dashboard.cards.length + 1;
          const occupied = dashboard.cards.map((existingCard) => resolveCardRect(existingCard));
          const requestedRect = resolveCardRect({
            type: card.type,
            x: card.x,
            y: card.y,
            w: card.w,
            h: card.h,
          });
          const fallbackRect = firstFreeRect(
            { w: requestedRect.w, h: requestedRect.h },
            occupied,
          );
          const nextCard: DashboardCard = {
            id: card.id ?? `card_${Date.now()}`,
            order: card.order ?? nextOrder,
            type: card.type,
            title: card.title,
            variable: card.variable,
            table_rows: card.table_rows,
            x: card.x ?? fallbackRect.x,
            y: card.y ?? fallbackRect.y,
            w: card.w ?? fallbackRect.w,
            h: card.h ?? fallbackRect.h,
          };
          return { ...dashboard, cards: [...dashboard.cards, nextCard] };
        });
        return {
          dashboards,
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, dashboards, state.activeDashboardId),
        };
      });
    },
    updateDashboardCard: (dashboardId, cardId, patch) => {
      set((state) => {
        const dashboards = state.dashboards.map((dashboard) => {
          if (dashboard.id !== dashboardId) return dashboard;
          return {
            ...dashboard,
            cards: dashboard.cards.map((card) => (card.id === cardId ? { ...card, ...patch } : card)),
          };
        });
        return {
          dashboards,
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, dashboards, state.activeDashboardId),
        };
      });
    },
    moveDashboardCard: (dashboardId, cardId, direction) => {
      set((state) => {
        const dashboards = state.dashboards.map((dashboard) => {
          if (dashboard.id !== dashboardId) return dashboard;
          const cards = [...dashboard.cards].sort((a, b) => a.order - b.order);
          const index = cards.findIndex((card) => card.id === cardId);
          if (index < 0) return dashboard;
          const swapIndex = direction === 'up' ? index - 1 : index + 1;
          if (swapIndex < 0 || swapIndex >= cards.length) return dashboard;
          const current = cards[index];
          cards[index] = cards[swapIndex];
          cards[swapIndex] = current;
          const reordered = cards.map((card, i) => ({ ...card, order: i + 1 }));
          return { ...dashboard, cards: reordered };
        });
        return {
          dashboards,
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, dashboards, state.activeDashboardId),
        };
      });
    },
    deleteDashboardCard: (dashboardId, cardId) => {
      set((state) => {
        const dashboards = state.dashboards.map((dashboard) => {
          if (dashboard.id !== dashboardId) return dashboard;
          const cards = dashboard.cards.filter((card) => card.id !== cardId).map((card, i) => ({ ...card, order: i + 1 }));
          return { ...dashboard, cards };
        });
        return {
          dashboards,
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, dashboards, state.activeDashboardId),
        };
      });
    },
    autoOrganize: () => {
      flushPendingCommit();
      const before = snapshotFromState(get().model, get().selected);
      const positions = computeAutoLayout(get().model);
      set((state) => {
        const nodes = state.model.nodes.map((n) => {
          const pos = positions.find((p) => p.id === n.id);
          return pos ? { ...n, position: { x: pos.x, y: pos.y } } : n;
        });
        return { model: { ...state.model, nodes }, localIssues: localValidate({ ...state.model, nodes }) };
      });
      pushHistory(before, snapshotFromState(get().model, get().selected));
    },
    alignNodes: (direction, nodeIds) => {
      if (nodeIds.length < 2) return;
      flushPendingCommit();
      const before = snapshotFromState(get().model, get().selected);
      const selected = get().model.nodes.filter((n) => nodeIds.includes(n.id));
      if (selected.length < 2) return;

      const NODE_W = 120; // approximate node width for right-align

      let targetX: number | undefined;
      let targetY: number | undefined;
      switch (direction) {
        case 'left':
          targetX = Math.min(...selected.map((n) => n.position.x));
          break;
        case 'right':
          targetX = Math.max(...selected.map((n) => n.position.x + NODE_W)) - NODE_W;
          break;
        case 'top':
          targetY = Math.min(...selected.map((n) => n.position.y));
          break;
        case 'bottom':
          targetY = Math.max(...selected.map((n) => n.position.y));
          break;
        case 'center-h':
          targetX = selected.reduce((s, n) => s + n.position.x, 0) / selected.length;
          break;
        case 'center-v':
          targetY = selected.reduce((s, n) => s + n.position.y, 0) / selected.length;
          break;
      }

      set((state) => {
        const nodes = state.model.nodes.map((n) => {
          if (!nodeIds.includes(n.id)) return n;
          return {
            ...n,
            position: {
              x: targetX !== undefined ? targetX : n.position.x,
              y: targetY !== undefined ? targetY : n.position.y,
            },
          };
        });
        return { model: { ...state.model, nodes }, localIssues: localValidate({ ...state.model, nodes }) };
      });
      pushHistory(before, snapshotFromState(get().model, get().selected));
    },
  };
});
