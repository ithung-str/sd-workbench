import { create } from 'zustand';
import {
  executeAiCommandStream,
  executePipeline,
  runMonteCarlo,
  runOATSensitivity,
  simulateModel,
  simulateScenarioBatch,
  validateModel,
} from '../lib/api';
import type { NodeResultResponse } from '../lib/api';
import { firstFreeRect, resolveCardRect } from '../lib/dashboardLayout';
import { computeAutoLayout } from '../lib/autoLayout';
import { syncInfluenceEdgesForNode } from '../lib/modelHelpers';
import { detectLoops } from '../lib/loopDetection';
import { localValidate } from '../lib/modelValidation';
import { blankModel, cloneModel, teacupModel } from '../lib/sampleModels';
import {
  saveModelToStorage,
  loadModelFromStorage,
  getActiveModelId,
  setActiveModelId,
} from '../lib/modelStorage';
import type {
  AIChatComponentGroup,
  AIChatMessage,
  AnalysisPipeline,
  BatchSimulateResponse,
  CldSymbol,
  CldLoopDirection,
  DashboardCard,
  DashboardDefinition,
  DimensionDefinition,
  EdgeModel,
  GlobalVariable,
  ModelDocument,
  MonteCarloParameter,
  MonteCarloResponse,
  NodeModel,
  OATSensitivityResponse,
  OptimisationConfig,
  OptimisationResult,
  ScenarioDefinition,
  SensitivityConfig,
  SimConfig,
  SimulateResponse,
  StreamChunk,
  ValidateResponse,
  ValidationIssue,
} from '../types/model';

export type DockTab = 'validation' | 'chart' | 'table' | 'compare';
export type WorkbenchTab = 'canvas' | 'formulas' | 'dashboard' | 'scenarios' | 'sensitivity' | 'optimisation' | 'data' | 'analysis';
export type RightSidebarMode = 'inspector' | 'chat' | 'simulation' | 'validation';

type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'global_variable'; id: string }
  | null;

type CanvasInsertNodeType = Exclude<NodeModel['type'], 'cld_symbol'>;

const VISIBLE_NODE_TYPES = new Set(['stock', 'flow', 'aux', 'lookup']);
const TYPE_LABELS: Record<string, string> = { stock: 'Stocks', flow: 'Flows', aux: 'Variables', lookup: 'Lookups' };

function buildComponentGroups(newModel: ModelDocument): AIChatComponentGroup[] {
  const grouped: Record<string, string[]> = {};
  for (const node of newModel.nodes) {
    if (!VISIBLE_NODE_TYPES.has(node.type)) continue;
    const name = 'name' in node ? (node as any).name : undefined;
    if (!name) continue;
    const type = node.type;
    if (!grouped[type]) grouped[type] = [];
    grouped[type].push(name);
  }
  const order = ['stock', 'flow', 'aux', 'lookup'];
  return order
    .filter((t) => grouped[t]?.length)
    .map((t) => ({ type: TYPE_LABELS[t] || t, names: grouped[t] }));
}

type HistoryEntry = { model: ModelDocument; selected: Selection };
type PendingCommit = {
  key: string;
  timerId: ReturnType<typeof setTimeout> | null;
  before: HistoryEntry;
  after: HistoryEntry;
};

const HISTORY_LIMIT = 100;
const GROUPED_COMMIT_DEBOUNCE_MS = 350;

type EditorState = {
  model: ModelDocument;
  selected: Selection;
  simConfig: SimConfig;
  scenarios: ScenarioDefinition[];
  activeScenarioId: string;
  dashboards: DashboardDefinition[];
  activeDashboardId: string | null;
  sensitivityConfigs: SensitivityConfig[];
  activeSensitivityConfigId: string;
  optimisationConfigs: OptimisationConfig[];
  activeOptimisationConfigId: string;
  optimisationResults: OptimisationResult | null;
  isRunningOptimisation: boolean;
  optimisationProgress: { current: number; total: number } | null;
  compareResults: BatchSimulateResponse | null;
  oatResults: OATSensitivityResponse | null;
  monteCarloResults: MonteCarloResponse | null;
  aiCommand: string;
  aiChatHistory: AIChatMessage[];
  rightSidebarMode: RightSidebarMode;
  validation: ValidateResponse;
  localIssues: ValidationIssue[];
  results: SimulateResponse | null;
  apiError: string | null;
  activeDockTab: DockTab;
  isValidating: boolean;
  isSimulating: boolean;
  isApplyingAi: boolean;
  aiStatusMessage: string;
  aiStreamingRaw: string;
  aiStreamingChunks: StreamChunk[];
  isRunningBatch: boolean;
  isRunningSensitivity: boolean;
  multiSelectedNodeIds: string[];
  isCanvasLocked: boolean;
  activeTab: WorkbenchTab;
  backendHealthy: boolean | null;
  undoStack: HistoryEntry[];
  redoStack: HistoryEntry[];
  historyLimit: number;
  pendingCommit: PendingCommit | null;
  setSelected: (selected: Selection) => void;
  setMultiSelectedNodeIds: (ids: string[]) => void;
  deleteMultiSelected: () => void;
  bulkUpdateNodes: (ids: string[], patch: Partial<NodeModel>) => void;
  setCanvasLocked: (locked: boolean) => void;
  addNode: (type: CanvasInsertNodeType) => void;
  addCldSymbol: (symbol: CldSymbol) => void;
  addGlobalVariable: () => void;
  updateGlobalVariable: (id: string, patch: Partial<GlobalVariable>) => void;
  deleteGlobalVariable: (id: string) => void;
  // Dimension management
  addDimension: (name: string, elements: string[]) => void;
  updateDimension: (id: string, patch: Partial<Pick<DimensionDefinition, 'name' | 'elements'>>) => void;
  deleteDimension: (id: string) => void;
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
  startNewModel: () => void;
  setAiCommand: (value: string) => void;
  runAiCommand: () => Promise<void>;
  clearAiChat: () => void;
  setRightSidebarMode: (mode: RightSidebarMode) => void;
  createScenario: () => void;
  duplicateScenario: (id: string) => void;
  updateScenario: (id: string, patch: Partial<ScenarioDefinition>) => void;
  deleteScenario: (id: string) => void;
  setActiveScenario: (id: string) => void;
  createDashboard: (name?: string, cards?: Omit<DashboardCard, 'id' | 'order'>[]) => void;
  updateDashboard: (id: string, patch: Partial<DashboardDefinition>) => void;
  deleteDashboard: (id: string) => void;
  setActiveDashboard: (id: string) => void;
  createSensitivityConfig: () => void;
  duplicateSensitivityConfig: (id: string) => void;
  updateSensitivityConfig: (id: string, patch: Partial<SensitivityConfig>) => void;
  deleteSensitivityConfig: (id: string) => void;
  setActiveSensitivityConfig: (id: string) => void;
  runActiveSensitivity: () => Promise<void>;
  createOptimisationConfig: () => void;
  duplicateOptimisationConfig: (id: string) => void;
  updateOptimisationConfig: (id: string, patch: Partial<OptimisationConfig>) => void;
  deleteOptimisationConfig: (id: string) => void;
  setActiveOptimisationConfig: (id: string) => void;
  runActiveOptimisation: () => Promise<void>;
  // Analysis pipelines
  pipelines: AnalysisPipeline[];
  activePipelineId: string | null;
  analysisResults: Record<string, NodeResultResponse>;
  isRunningPipeline: boolean;
  createPipeline: (name?: string) => void;
  updatePipeline: (id: string, patch: Partial<AnalysisPipeline>) => void;
  deletePipeline: (id: string) => void;
  setActivePipeline: (id: string) => void;
  runPipeline: (runFrom?: string) => Promise<void>;
  addDashboardCard: (dashboardId: string, card: Omit<DashboardCard, 'id' | 'order'> & { id?: string; order?: number }) => void;
  updateDashboardCard: (dashboardId: string, cardId: string, patch: Partial<DashboardCard>) => void;
  moveDashboardCard: (dashboardId: string, cardId: string, direction: 'up' | 'down') => void;
  deleteDashboardCard: (dashboardId: string, cardId: string) => void;
  updateDefaultStyle: (nodeType: 'stock' | 'flow' | 'aux' | 'lookup', style: Partial<import('../types/model').VisualStyle>) => void;
  setActiveTab: (tab: WorkbenchTab) => void;
  setBackendHealthy: (value: boolean | null) => void;
  autoOrganize: () => void;
  alignNodes: (direction: 'left' | 'right' | 'top' | 'bottom' | 'center-h' | 'center-v', nodeIds: string[]) => void;
  detectedLoops: import('../lib/loopDetection').DetectedLoop[];
  highlightedLoopId: string | null;
  refreshLoops: () => void;
  setHighlightedLoop: (id: string | null) => void;
};

function defaultValidation(): ValidateResponse {
  return { ok: true, errors: [], warnings: [] };
}

function nextNodeDefaults(type: CanvasInsertNodeType, count: number): NodeModel {
  const n = count + 1;
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  if (type === 'stock') {
    return {
      id: `stock_${uid}`,
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
      id: `flow_${uid}`,
      type: 'flow',
      name: `flow_${n}`,
      label: `Flow ${n}`,
      equation: '0',
      position: { x: 280 + n * 40, y: 160 + n * 30 },
    };
  }
  if (type === 'cloud') {
    return {
      id: `cloud_${uid}`,
      type: 'cloud',
      position: { x: 200 + n * 40, y: 160 + n * 30 },
    };
  }
  if (type === 'lookup') {
    return {
      id: `lookup_${uid}`,
      type: 'lookup',
      name: `lookup_${n}`,
      label: `Lookup ${n}`,
      equation: 'TIME',
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
      id: `text_${uid}`,
      type: 'text',
      text: 'Note',
      position: { x: 260 + n * 20, y: 140 + n * 20 },
    };
  }
  return {
    id: `aux_${uid}`,
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

function defaultSensitivityConfigs(model: ModelDocument): { sensitivityConfigs: SensitivityConfig[]; activeSensitivityConfigId: string } {
  const existing = model.metadata?.analysis?.sensitivity_configs ?? [];
  if (existing.length > 0) {
    const activeId =
      model.metadata?.analysis?.defaults?.active_sensitivity_config_id ??
      existing[0].id;
    return { sensitivityConfigs: existing, activeSensitivityConfigId: activeId };
  }
  return { sensitivityConfigs: [], activeSensitivityConfigId: '' };
}

function defaultOptimisationConfigs(model: ModelDocument): { optimisationConfigs: OptimisationConfig[]; activeOptimisationConfigId: string } {
  const existing = model.metadata?.analysis?.optimisation_configs ?? [];
  if (existing.length > 0) {
    const activeId =
      model.metadata?.analysis?.defaults?.active_optimisation_config_id ??
      existing[0].id;
    return { optimisationConfigs: existing, activeOptimisationConfigId: activeId };
  }
  return { optimisationConfigs: [], activeOptimisationConfigId: '' };
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
  sensitivityConfigs?: SensitivityConfig[],
  activeSensitivityConfigId?: string,
  optimisationConfigs?: OptimisationConfig[],
  activeOptimisationConfigId?: string,
  pipelines?: AnalysisPipeline[],
  activePipelineId?: string | null,
): ModelDocument {
  return {
    ...model,
    metadata: {
      ...(model.metadata ?? {}),
      analysis: {
        scenarios,
        dashboards,
        sensitivity_configs: sensitivityConfigs,
        optimisation_configs: optimisationConfigs,
        pipelines: pipelines,
        defaults: {
          baseline_scenario_id: activeScenarioId,
          active_dashboard_id: activeDashboardId ?? undefined,
          active_sensitivity_config_id: activeSensitivityConfigId ?? undefined,
          active_optimisation_config_id: activeOptimisationConfigId ?? undefined,
          active_pipeline_id: activePipelineId ?? undefined,
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

export const useEditorStore = create<EditorState>((set, get) => {
  const savedId = getActiveModelId();
  const savedModel = savedId ? loadModelFromStorage(savedId) : null;
  const initialModel = cloneModel(savedModel ?? teacupModel);
  const initialScenarios = defaultScenarios(initialModel);
  const initialDashboards = defaultDashboards(initialModel);
  const initialSensitivityConfigs = defaultSensitivityConfigs(initialModel);
  const initialOptimisationConfigs = defaultOptimisationConfigs(initialModel);
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
  return {
    model: persistAnalysis(
      initialModel,
      initialScenarios.scenarios,
      initialScenarios.activeScenarioId,
      initialDashboards.dashboards,
      initialDashboards.activeDashboardId,
      initialSensitivityConfigs.sensitivityConfigs,
      initialSensitivityConfigs.activeSensitivityConfigId,
      initialOptimisationConfigs.optimisationConfigs,
      initialOptimisationConfigs.activeOptimisationConfigId,
      (initialModel.metadata?.analysis as any)?.pipelines ?? [],
      (initialModel.metadata?.analysis as any)?.defaults?.active_pipeline_id ?? null,
    ),
    selected: null,
    simConfig: { start: 0, stop: 30, dt: 1, method: 'euler' },
    scenarios: initialScenarios.scenarios,
    activeScenarioId: initialScenarios.activeScenarioId,
    dashboards: initialDashboards.dashboards,
    activeDashboardId: initialDashboards.activeDashboardId,
    sensitivityConfigs: initialSensitivityConfigs.sensitivityConfigs,
    activeSensitivityConfigId: initialSensitivityConfigs.activeSensitivityConfigId,
    optimisationConfigs: initialOptimisationConfigs.optimisationConfigs,
    activeOptimisationConfigId: initialOptimisationConfigs.activeOptimisationConfigId,
    pipelines: (initialModel.metadata?.analysis as any)?.pipelines ?? [],
    activePipelineId: (initialModel.metadata?.analysis as any)?.defaults?.active_pipeline_id ?? null,
    analysisResults: {},
    isRunningPipeline: false,
    optimisationResults: null,
    isRunningOptimisation: false,
    optimisationProgress: null,
    compareResults: null,
    oatResults: null,
    monteCarloResults: null,
    aiCommand: '',
    aiChatHistory: [],
    rightSidebarMode: 'inspector' as RightSidebarMode,
    validation: defaultValidation(),
    localIssues: [],
    results: null,
    apiError: null,
    activeDockTab: 'validation',
    isValidating: false,
    isSimulating: false,
    isApplyingAi: false,
    aiStatusMessage: '',
    aiStreamingRaw: '',
    aiStreamingChunks: [],
    isRunningBatch: false,
    isRunningSensitivity: false,
    multiSelectedNodeIds: [],
    isCanvasLocked: false,
    activeTab: 'canvas',
    backendHealthy: null,
    undoStack: [],
    redoStack: [],
    historyLimit: HISTORY_LIMIT,
    pendingCommit: null,
    detectedLoops: [],
    highlightedLoopId: null,
    refreshLoops: () => {
      const loops = detectLoops(get().model);
      set({ detectedLoops: loops });
    },
    setHighlightedLoop: (id) => set({ highlightedLoopId: id }),
    setSelected: (selected) => set({ selected, multiSelectedNodeIds: [] }),
    setMultiSelectedNodeIds: (ids) => {
      if (ids.length >= 2) {
        set({ multiSelectedNodeIds: ids, selected: null });
      } else {
        set({ multiSelectedNodeIds: [] });
      }
    },
    deleteMultiSelected: () => {
      const { multiSelectedNodeIds } = get();
      if (multiSelectedNodeIds.length < 2) return;
      flushPendingCommit();
      const before = snapshotFromState(get().model, get().selected);
      const idsToDelete = new Set(multiSelectedNodeIds);
      set((state) => {
        const nodes = state.model.nodes.filter((n) => !idsToDelete.has(n.id));
        const edges = state.model.edges.filter(
          (e) => !idsToDelete.has(e.source) && !idsToDelete.has(e.target),
        );
        const model = { ...state.model, nodes, edges };
        return { model, selected: null, multiSelectedNodeIds: [], localIssues: localValidate(model) };
      });
      const afterState = get();
      pushHistory(before, snapshotFromState(afterState.model, afterState.selected));
    },
    bulkUpdateNodes: (ids, patch) => {
      if (ids.length === 0) return;
      flushPendingCommit();
      const before = snapshotFromState(get().model, get().selected);
      const idSet = new Set(ids);
      set((state) => {
        const nodes = state.model.nodes.map((n) =>
          idSet.has(n.id) ? ({ ...n, ...patch } as NodeModel) : n,
        );
        const model = { ...state.model, nodes };
        return { model, localIssues: localValidate(model) };
      });
      const afterState = get();
      pushHistory(before, snapshotFromState(afterState.model, afterState.selected));
    },
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
    addDimension: (name, elements) => {
      const before = snapshotFromState(get().model, get().selected);
      set((state) => {
        const id = `dim_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
        const dim: DimensionDefinition = { id, name, elements };
        const dimensions = [...(state.model.dimensions ?? []), dim];
        const model = { ...state.model, dimensions };
        return { model };
      });
      const afterState = get();
      scheduleGroupedCommit('dimension:add', before, snapshotFromState(afterState.model, afterState.selected));
    },
    updateDimension: (id, patch) => {
      const before = snapshotFromState(get().model, get().selected);
      set((state) => {
        const dimensions = (state.model.dimensions ?? []).map((d) =>
          d.id === id ? { ...d, ...patch } : d
        );
        const model = { ...state.model, dimensions };
        return { model };
      });
      const afterState = get();
      scheduleGroupedCommit(`dimension:${id}`, before, snapshotFromState(afterState.model, afterState.selected));
    },
    deleteDimension: (id) => {
      const before = snapshotFromState(get().model, get().selected);
      set((state) => {
        const deletedDim = (state.model.dimensions ?? []).find((d) => d.id === id);
        const dimensions = (state.model.dimensions ?? []).filter((d) => d.id !== id);
        // Strip this dimension from any nodes that reference it
        let nodes = state.model.nodes;
        if (deletedDim) {
          nodes = nodes.map((n) => {
            if ('dimensions' in n && n.dimensions?.includes(deletedDim.name)) {
              return {
                ...n,
                dimensions: n.dimensions.filter((d: string) => d !== deletedDim.name),
                equation_overrides: {},
              } as typeof n;
            }
            return n;
          });
        }
        const model = { ...state.model, dimensions, nodes };
        return { model };
      });
      const afterState = get();
      scheduleGroupedCommit('dimension:delete', before, snapshotFromState(afterState.model, afterState.selected));
    },
    updateNode: (id, patch) => {
      const before = snapshotFromState(get().model, get().selected);
      set((state) => {
        const nodes = state.model.nodes.map((node) => (node.id === id ? ({ ...node, ...patch } as NodeModel) : node));
        let edges = state.model.edges;

        // Auto-create influence edges when equation references unconnected variables
        if ('equation' in patch) {
          const updatedNode = nodes.find((n) => n.id === id);
          if (updatedNode) {
            edges = syncInfluenceEdgesForNode(id, updatedNode, nodes, edges);
          }
        }

        const model = { ...state.model, nodes, edges };
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
    setAiCommand: (aiCommand) => set({ aiCommand }),
    setSimConfig: (patch) => set((state) => ({ simConfig: { ...state.simConfig, ...patch } })),
    runValidate: async () => {
      const { model } = get();
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
      const { model, simConfig } = get();
      set({ isSimulating: true, apiError: null });
      try {
        const results = await simulateModel({ model, sim_config: simConfig });
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
      } = get();
      const hasBaselineScenario = scenarios.some(
        (scenario) =>
          scenario.status !== 'archived' &&
          (scenario.id === 'baseline' || scenario.status === 'baseline'),
      );
      set({ isRunningBatch: true, apiError: null, compareResults: null });
      try {
        const compareResults = await simulateScenarioBatch({
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
      const { model, simConfig, scenarios, activeScenarioId } = get();
      set({ isRunningSensitivity: true, apiError: null, oatResults: null });
      try {
        const oatResults = await runOATSensitivity({
          model,
          sim_config: simConfig,
          scenarios,
          scenario_id: activeScenarioId,
          output,
          metric,
          parameters,
        });
        set({ oatResults, monteCarloResults: null, isRunningSensitivity: false });
      } catch (error) {
        set({ isRunningSensitivity: false, apiError: 'OAT sensitivity failed' });
      }
    },
    runMonteCarlo: async ({ output, metric, runs, seed, parameters }) => {
      const { model, simConfig, scenarios, activeScenarioId } = get();
      set({ isRunningSensitivity: true, apiError: null, monteCarloResults: null });
      try {
        const monteCarloResults = await runMonteCarlo({
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
        set({ monteCarloResults, oatResults: null, isRunningSensitivity: false });
      } catch (error) {
        set({ isRunningSensitivity: false, apiError: 'Monte Carlo analysis failed' });
      }
    },
    runAiCommand: async () => {
      const { model, aiCommand, aiChatHistory, simConfig } = get();
      if (!aiCommand.trim()) return;
      const userMessage = aiCommand.trim();
      // Add user message to chat history immediately and open chat
      const updatedHistory: AIChatMessage[] = [...aiChatHistory, { role: 'user', content: userMessage }];
      set({ isApplyingAi: true, aiStatusMessage: 'Sending to AI...', aiStreamingRaw: '', aiStreamingChunks: [], apiError: null, aiCommand: '', aiChatHistory: updatedHistory, rightSidebarMode: 'chat' as RightSidebarMode });

      try {
        const response = await executeAiCommandStream(
          userMessage, model, aiChatHistory, simConfig,
          (msg) => set({ aiStatusMessage: msg }),
          (chunk) => set((s) => ({ aiStreamingRaw: s.aiStreamingRaw + chunk })),
          (chunk) => set((s) => ({ aiStreamingChunks: [...s.aiStreamingChunks, chunk] })),
          (update) => set((s) => ({
            aiStreamingChunks: s.aiStreamingChunks.map((c, i) =>
              i === update.index ? { ...c, status: update.status, errors: update.errors } : c
            ),
          })),
        );

        if (response.needs_clarification) {
          // AI is asking a clarifying question — add to history with suggestions, keep chat open
          set({
            isApplyingAi: false,
            aiStatusMessage: '',
            aiStreamingRaw: '',
            aiChatHistory: [
              ...updatedHistory,
              {
                role: 'assistant',
                content: response.assistant_message,
                suggestions: response.suggestions?.length ? response.suggestions : undefined,
                debugRawResponse: response.debug_raw_response ?? undefined,
              },
            ],
          });
          return;
        }

        let assistantMsg = response.assistant_message || 'Model updated successfully.';
        const retryLog = response.retry_log?.length ? response.retry_log : undefined;
        const debugRawResponse = response.debug_raw_response ?? undefined;
        const components = response.model ? buildComponentGroups(response.model) : undefined;
        const finalHistory: AIChatMessage[] = [...updatedHistory, { role: 'assistant', content: assistantMsg, retryLog, debugRawResponse, components: components?.length ? components : undefined }];

        // --- Patch mode: apply patches individually via updateNode for undo support ---
        if (response.patches && response.patches.length > 0) {
          const { updateNode } = get();
          for (const patch of response.patches) {
            // Resolve node by name → id
            const node = get().model.nodes.find((n) => 'name' in n && (n as any).name === patch.node_name);
            if (node) {
              updateNode(node.id, { [patch.field]: patch.value } as any);
            }
          }
        }

        // --- Actions: dispatch to store ---
        if (response.actions && response.actions.length > 0) {
          const { dispatchAiActions } = await import('../lib/aiActionDispatcher');
          const result = await dispatchAiActions(response.actions, get);
          if (result.errors.length > 0) {
            assistantMsg += `\n\nAction errors: ${result.errors.join('; ')}`;
            finalHistory[finalHistory.length - 1] = { role: 'assistant', content: assistantMsg };
          }
        }

        // If patches or actions were handled (but no full model), we're done
        if ((response.patches && response.patches.length > 0) || (response.actions && response.actions.length > 0 && !response.model)) {
          set({ isApplyingAi: false, aiStatusMessage: '', aiStreamingRaw: '', aiChatHistory: finalHistory });
          return;
        }

        // --- Actions-only with no model/patches ---
        if (!response.model) {
          set({ isApplyingAi: false, aiStatusMessage: '', aiStreamingRaw: '', aiChatHistory: finalHistory });
          return;
        }

        // --- Full model mode: replace entire model ---
        // Apply auto-layout only if the AI didn't already provide meaningful positions.
        // Consider positions meaningful if at least some nodes have non-zero coordinates.
        const rawUpdated = cloneModel(response.model);
        const hasAiPositions = rawUpdated.nodes.some(
          (n) => 'position' in n && (n.position.x !== 0 || n.position.y !== 0),
        );
        let updated = rawUpdated;
        if (!hasAiPositions) {
          const layoutPositions = computeAutoLayout(rawUpdated);
          updated = {
            ...rawUpdated,
            nodes: rawUpdated.nodes.map((n) => {
              const pos = layoutPositions.find((p) => p.id === n.id);
              return pos ? { ...n, position: { x: pos.x, y: pos.y } } : n;
            }),
          };
        }
        const scenarioDefaults = defaultScenarios(updated);
        const dashboardDefaults = defaultDashboards(updated);
        const sensitivityDefaults = defaultSensitivityConfigs(updated);
        const optimisationDefaults = defaultOptimisationConfigs(updated);
        const persisted = persistAnalysis(
          updated,
          scenarioDefaults.scenarios,
          scenarioDefaults.activeScenarioId,
          dashboardDefaults.dashboards,
          dashboardDefaults.activeDashboardId,
          sensitivityDefaults.sensitivityConfigs,
          sensitivityDefaults.activeSensitivityConfigId,
          optimisationDefaults.optimisationConfigs,
          optimisationDefaults.activeOptimisationConfigId,
          state.pipelines,
          state.activePipelineId,
        );
        set({
          model: persisted,
          scenarios: scenarioDefaults.scenarios,
          activeScenarioId: scenarioDefaults.activeScenarioId,
          dashboards: dashboardDefaults.dashboards,
          activeDashboardId: dashboardDefaults.activeDashboardId,
          sensitivityConfigs: sensitivityDefaults.sensitivityConfigs,
          activeSensitivityConfigId: sensitivityDefaults.activeSensitivityConfigId,
          optimisationConfigs: optimisationDefaults.optimisationConfigs,
          activeOptimisationConfigId: optimisationDefaults.activeOptimisationConfigId,
          selected: null,
          localIssues: localValidate(persisted),
          validation: defaultValidation(),
          results: null,
          compareResults: null,
          oatResults: null,
          monteCarloResults: null,
          isApplyingAi: false,
          aiStatusMessage: '',
          aiStreamingRaw: '',
          aiChatHistory: finalHistory,
        });
        clearHistory();
      } catch (error: any) {
        const errMsg = error?.errors?.[0]?.message ?? error?.message ?? 'AI command failed';
        const errorRetryLog = error?.retry_log?.length ? error.retry_log : undefined;
        const streamedText = get().aiStreamingRaw;
        const debugRawResponse = error?.debug_raw_response || streamedText || undefined;
        set({
          isApplyingAi: false,
          aiStatusMessage: '',
          aiStreamingRaw: '',
          aiChatHistory: [...updatedHistory, { role: 'assistant', content: `Error: ${errMsg}`, retryLog: errorRetryLog, debugRawResponse }],
          apiError: errMsg,
        });
      }
    },
    clearAiChat: () => set({ aiChatHistory: [], aiStreamingChunks: [], rightSidebarMode: 'inspector' as RightSidebarMode, aiCommand: '' }),
    setRightSidebarMode: (mode) => set({ rightSidebarMode: mode }),
    startNewModel: () => {
      const fresh = cloneModel(blankModel);
      fresh.id = `model_${Date.now()}`;
      fresh.name = 'Untitled Model';
      const scenarioDefaults = defaultScenarios(fresh);
      const dashboardDefaults = defaultDashboards(fresh);
      const sensitivityDefaults = defaultSensitivityConfigs(fresh);
      const optimisationDefaults = defaultOptimisationConfigs(fresh);
      set({
        model: fresh,
        scenarios: scenarioDefaults.scenarios,
        activeScenarioId: scenarioDefaults.activeScenarioId,
        dashboards: dashboardDefaults.dashboards,
        activeDashboardId: dashboardDefaults.activeDashboardId,
        sensitivityConfigs: sensitivityDefaults.sensitivityConfigs,
        activeSensitivityConfigId: sensitivityDefaults.activeSensitivityConfigId,
        optimisationConfigs: optimisationDefaults.optimisationConfigs,
        activeOptimisationConfigId: optimisationDefaults.activeOptimisationConfigId,
        optimisationResults: null,
        isRunningOptimisation: false,
        optimisationProgress: null,
        selected: null,
        results: null,
        compareResults: null,
        oatResults: null,
        monteCarloResults: null,
        validation: defaultValidation(),
        localIssues: [],
        aiChatHistory: [],
        aiStreamingChunks: [],
        aiStreamingRaw: '',
        aiCommand: '',
        apiError: null,
      });
      clearHistory();
    },
    loadModel: (model) => {
      const cloned = cloneModel({ ...model, global_variables: model.global_variables ?? [] });
      const scenarioDefaults = defaultScenarios(cloned);
      const dashboardDefaults = defaultDashboards(cloned);
      const sensitivityDefaults = defaultSensitivityConfigs(cloned);
      const optimisationDefaults = defaultOptimisationConfigs(cloned);
      const pipelinesFromModel = (cloned.metadata?.analysis as any)?.pipelines ?? [];
      const activePipelineFromModel = (cloned.metadata?.analysis as any)?.defaults?.active_pipeline_id ?? null;
      const persisted = persistAnalysis(
        cloned,
        scenarioDefaults.scenarios,
        scenarioDefaults.activeScenarioId,
        dashboardDefaults.dashboards,
        dashboardDefaults.activeDashboardId,
        sensitivityDefaults.sensitivityConfigs,
        sensitivityDefaults.activeSensitivityConfigId,
        optimisationDefaults.optimisationConfigs,
        optimisationDefaults.activeOptimisationConfigId,
        pipelinesFromModel,
        activePipelineFromModel,
      );
      set({
        model: persisted,
        scenarios: scenarioDefaults.scenarios,
        activeScenarioId: scenarioDefaults.activeScenarioId,
        dashboards: dashboardDefaults.dashboards,
        activeDashboardId: dashboardDefaults.activeDashboardId,
        sensitivityConfigs: sensitivityDefaults.sensitivityConfigs,
        activeSensitivityConfigId: sensitivityDefaults.activeSensitivityConfigId,
        optimisationConfigs: optimisationDefaults.optimisationConfigs,
        activeOptimisationConfigId: optimisationDefaults.activeOptimisationConfigId,
        pipelines: pipelinesFromModel,
        activePipelineId: activePipelineFromModel,
        analysisResults: {},
        isRunningPipeline: false,
        optimisationResults: null,
        isRunningOptimisation: false,
        optimisationProgress: null,
        selected: null,
        results: null,
        compareResults: null,
        oatResults: null,
        monteCarloResults: null,
        validation: defaultValidation(),
        localIssues: localValidate(persisted),
      });
      clearHistory();
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
            state.model, scenarios, activeScenarioId,
            state.dashboards, state.activeDashboardId,
            state.sensitivityConfigs, state.activeSensitivityConfigId,
            state.optimisationConfigs, state.activeOptimisationConfigId,
            state.pipelines, state.activePipelineId,
          ),
        };
      });
    },
    duplicateScenario: (id) => {
      set((state) => {
        const source = scenarioById(state.scenarios, id);
        if (!source) return {};
        const next: ScenarioDefinition = {
          id: `scenario_${Date.now()}`,
          name: `${source.name} (copy)`,
          status: 'draft',
          color: source.color,
          description: source.description,
          overrides: {
            params: { ...(source.overrides?.params ?? {}) },
            sim_config: { ...(source.overrides?.sim_config ?? {}) },
            outputs: [...(source.overrides?.outputs ?? [])],
          },
        };
        const scenarios = [...state.scenarios, next];
        const activeScenarioId = next.id;
        return {
          scenarios,
          activeScenarioId,
          model: persistAnalysis(
            state.model, scenarios, activeScenarioId,
            state.dashboards, state.activeDashboardId,
            state.sensitivityConfigs, state.activeSensitivityConfigId,
            state.optimisationConfigs, state.activeOptimisationConfigId,
            state.pipelines, state.activePipelineId,
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
            state.model, scenarios, state.activeScenarioId,
            state.dashboards, state.activeDashboardId,
            state.sensitivityConfigs, state.activeSensitivityConfigId,
            state.optimisationConfigs, state.activeOptimisationConfigId,
            state.pipelines, state.activePipelineId,
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
            state.model, scenarios, baseline,
            state.dashboards, state.activeDashboardId,
            state.sensitivityConfigs, state.activeSensitivityConfigId,
            state.optimisationConfigs, state.activeOptimisationConfigId,
            state.pipelines, state.activePipelineId,
          ),
        };
      });
    },
    setActiveScenario: (id) => {
      set((state) => ({
        activeScenarioId: id,
        model: persistAnalysis(state.model, state.scenarios, id, state.dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, state.pipelines, state.activePipelineId),
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
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, dashboards, id, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, state.pipelines, state.activePipelineId),
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
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, state.pipelines, state.activePipelineId),
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
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, dashboards, activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, state.pipelines, state.activePipelineId),
        };
      });
    },
    setActiveDashboard: (id) => {
      set((state) => ({
        activeDashboardId: id,
        model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, state.dashboards, id, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, state.pipelines, state.activePipelineId),
      }));
    },
    createSensitivityConfig: () => {
      set((state) => {
        const outputOptions = state.model.nodes
          .filter((n) => n.type !== 'text' && n.type !== 'cloud' && n.type !== 'cld_symbol' && n.type !== 'phantom')
          .map((n) => n.name);
        const next: SensitivityConfig = {
          id: `sensitivity_${Date.now()}`,
          name: `Analysis ${state.sensitivityConfigs.length + 1}`,
          type: 'oat',
          output: outputOptions[0] ?? '',
          metric: 'final',
          parameters: [],
          color: '#1b6ca8',
        };
        const sensitivityConfigs = [...state.sensitivityConfigs, next];
        const activeSensitivityConfigId = next.id;
        return {
          sensitivityConfigs,
          activeSensitivityConfigId,
          model: persistAnalysis(
            state.model, state.scenarios, state.activeScenarioId,
            state.dashboards, state.activeDashboardId,
            sensitivityConfigs, activeSensitivityConfigId,
            state.optimisationConfigs, state.activeOptimisationConfigId,
            state.pipelines, state.activePipelineId,
          ),
        };
      });
    },
    duplicateSensitivityConfig: (id) => {
      set((state) => {
        const source = state.sensitivityConfigs.find((c) => c.id === id);
        if (!source) return {};
        const next: SensitivityConfig = {
          ...structuredClone(source),
          id: `sensitivity_${Date.now()}`,
          name: `${source.name} (copy)`,
        };
        const sensitivityConfigs = [...state.sensitivityConfigs, next];
        const activeSensitivityConfigId = next.id;
        return {
          sensitivityConfigs,
          activeSensitivityConfigId,
          model: persistAnalysis(
            state.model, state.scenarios, state.activeScenarioId,
            state.dashboards, state.activeDashboardId,
            sensitivityConfigs, activeSensitivityConfigId,
            state.optimisationConfigs, state.activeOptimisationConfigId,
            state.pipelines, state.activePipelineId,
          ),
        };
      });
    },
    updateSensitivityConfig: (id, patch) => {
      set((state) => {
        const sensitivityConfigs = state.sensitivityConfigs.map((c) =>
          c.id === id ? { ...c, ...patch } : c,
        );
        return {
          sensitivityConfigs,
          model: persistAnalysis(
            state.model, state.scenarios, state.activeScenarioId,
            state.dashboards, state.activeDashboardId,
            sensitivityConfigs, state.activeSensitivityConfigId,
            state.optimisationConfigs, state.activeOptimisationConfigId,
            state.pipelines, state.activePipelineId,
          ),
        };
      });
    },
    deleteSensitivityConfig: (id) => {
      set((state) => {
        const sensitivityConfigs = state.sensitivityConfigs.filter((c) => c.id !== id);
        const activeSensitivityConfigId =
          state.activeSensitivityConfigId === id
            ? (sensitivityConfigs[0]?.id ?? '')
            : state.activeSensitivityConfigId;
        return {
          sensitivityConfigs,
          activeSensitivityConfigId,
          model: persistAnalysis(
            state.model, state.scenarios, state.activeScenarioId,
            state.dashboards, state.activeDashboardId,
            sensitivityConfigs, activeSensitivityConfigId,
            state.optimisationConfigs, state.activeOptimisationConfigId,
            state.pipelines, state.activePipelineId,
          ),
        };
      });
    },
    setActiveSensitivityConfig: (id) => {
      set((state) => ({
        activeSensitivityConfigId: id,
        model: persistAnalysis(
          state.model, state.scenarios, state.activeScenarioId,
          state.dashboards, state.activeDashboardId,
          state.sensitivityConfigs, id,
          state.optimisationConfigs, state.activeOptimisationConfigId,
          state.pipelines, state.activePipelineId,
        ),
      }));
    },
    runActiveSensitivity: async () => {
      const state = get();
      const config = state.sensitivityConfigs.find(
        (c) => c.id === state.activeSensitivityConfigId,
      );
      if (!config || config.parameters.length === 0) return;
      if (config.type === 'oat') {
        await state.runOATSensitivity({
          output: config.output,
          metric: config.metric,
          parameters: config.parameters,
        });
      } else {
        await state.runMonteCarlo({
          output: config.output,
          metric: config.metric,
          runs: config.runs ?? 100,
          seed: config.seed ?? 42,
          parameters: config.parameters.map((p) => ({
            name: p.name,
            distribution: 'uniform' as const,
            min: p.low,
            max: p.high,
          })),
        });
      }
    },
    createOptimisationConfig: () => {
      set((state) => {
        const outputOptions = state.model.nodes
          .filter((n) => n.type !== 'text' && n.type !== 'cloud' && n.type !== 'cld_symbol' && n.type !== 'phantom')
          .map((n) => n.name);
        const next: OptimisationConfig = {
          id: `optimisation_${Date.now()}`,
          name: `Optimisation ${state.optimisationConfigs.length + 1}`,
          mode: 'goal-seek',
          output: outputOptions[0] ?? '',
          metric: 'final',
          target_value: 0,
          parameters: [],
          color: '#5c2d91',
        };
        const optimisationConfigs = [...state.optimisationConfigs, next];
        const activeOptimisationConfigId = next.id;
        return {
          optimisationConfigs,
          activeOptimisationConfigId,
          model: persistAnalysis(
            state.model, state.scenarios, state.activeScenarioId,
            state.dashboards, state.activeDashboardId,
            state.sensitivityConfigs, state.activeSensitivityConfigId,
            optimisationConfigs, activeOptimisationConfigId,
            state.pipelines, state.activePipelineId,
          ),
        };
      });
    },
    duplicateOptimisationConfig: (id) => {
      set((state) => {
        const source = state.optimisationConfigs.find((c) => c.id === id);
        if (!source) return {};
        const next: OptimisationConfig = {
          ...structuredClone(source),
          id: `optimisation_${Date.now()}`,
          name: `${source.name} (copy)`,
        };
        const optimisationConfigs = [...state.optimisationConfigs, next];
        const activeOptimisationConfigId = next.id;
        return {
          optimisationConfigs,
          activeOptimisationConfigId,
          model: persistAnalysis(
            state.model, state.scenarios, state.activeScenarioId,
            state.dashboards, state.activeDashboardId,
            state.sensitivityConfigs, state.activeSensitivityConfigId,
            optimisationConfigs, activeOptimisationConfigId,
            state.pipelines, state.activePipelineId,
          ),
        };
      });
    },
    updateOptimisationConfig: (id, patch) => {
      set((state) => {
        const optimisationConfigs = state.optimisationConfigs.map((c) =>
          c.id === id ? { ...c, ...patch } : c,
        );
        return {
          optimisationConfigs,
          model: persistAnalysis(
            state.model, state.scenarios, state.activeScenarioId,
            state.dashboards, state.activeDashboardId,
            state.sensitivityConfigs, state.activeSensitivityConfigId,
            optimisationConfigs, state.activeOptimisationConfigId,
            state.pipelines, state.activePipelineId,
          ),
        };
      });
    },
    deleteOptimisationConfig: (id) => {
      set((state) => {
        const optimisationConfigs = state.optimisationConfigs.filter((c) => c.id !== id);
        const activeOptimisationConfigId =
          state.activeOptimisationConfigId === id
            ? (optimisationConfigs[0]?.id ?? '')
            : state.activeOptimisationConfigId;
        return {
          optimisationConfigs,
          activeOptimisationConfigId,
          optimisationResults: null,
          model: persistAnalysis(
            state.model, state.scenarios, state.activeScenarioId,
            state.dashboards, state.activeDashboardId,
            state.sensitivityConfigs, state.activeSensitivityConfigId,
            optimisationConfigs, activeOptimisationConfigId,
            state.pipelines, state.activePipelineId,
          ),
        };
      });
    },
    setActiveOptimisationConfig: (id) => {
      set((state) => ({
        activeOptimisationConfigId: id,
        optimisationResults: null,
        model: persistAnalysis(
          state.model, state.scenarios, state.activeScenarioId,
          state.dashboards, state.activeDashboardId,
          state.sensitivityConfigs, state.activeSensitivityConfigId,
          state.optimisationConfigs, id,
          state.pipelines, state.activePipelineId,
        ),
      }));
    },
    runActiveOptimisation: async () => {
      const state = get();
      const config = state.optimisationConfigs.find(
        (c) => c.id === state.activeOptimisationConfigId,
      );
      if (!config) return;
      set({ isRunningOptimisation: true, optimisationResults: null, optimisationProgress: null, apiError: null });
      try {
        const { runOptimisation } = await import('../lib/optimiser');
        const result = await runOptimisation(
          config,
          state.model,
          state.simConfig,
          state.scenarios,
          (current, total) => set({ optimisationProgress: { current, total } }),
        );
        set({ optimisationResults: result, isRunningOptimisation: false, optimisationProgress: null });
      } catch (error) {
        set({ isRunningOptimisation: false, optimisationProgress: null, apiError: 'Optimisation failed' });
      }
    },
    createPipeline: (name) => {
      set((state) => {
        const id = `pipeline_${Date.now()}`;
        const pipeline: AnalysisPipeline = {
          id,
          name: name?.trim() || `Pipeline ${state.pipelines.length + 1}`,
          nodes: [],
          edges: [],
        };
        const pipelines = [...state.pipelines, pipeline];
        return {
          pipelines,
          activePipelineId: id,
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, state.dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, pipelines, id),
        };
      });
    },
    updatePipeline: (id, patch) => {
      set((state) => {
        const pipelines = state.pipelines.map((p) => (p.id === id ? { ...p, ...patch } : p));
        return {
          pipelines,
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, state.dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, pipelines, state.activePipelineId),
        };
      });
    },
    deletePipeline: (id) => {
      set((state) => {
        const pipelines = state.pipelines.filter((p) => p.id !== id);
        const activePipelineId = state.activePipelineId === id ? (pipelines[0]?.id ?? null) : state.activePipelineId;
        return {
          pipelines,
          activePipelineId,
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, state.dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, pipelines, activePipelineId),
        };
      });
    },
    setActivePipeline: (id) => {
      set((state) => ({
        activePipelineId: id,
        analysisResults: {},
        model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, state.dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, state.pipelines, id),
      }));
    },
    runPipeline: async (runFrom) => {
      const { pipelines, activePipelineId } = get();
      const pipeline = pipelines.find((p) => p.id === activePipelineId);
      if (!pipeline) return;

      set({ isRunningPipeline: true, analysisResults: {} });

      try {
        const execNodes = [];
        for (const node of pipeline.nodes) {
          if (node.type === 'data_source' && node.data_table_id) {
            const { loadDataTable } = await import('../lib/dataTableStorage');
            const table = await loadDataTable(node.data_table_id);
            execNodes.push({
              id: node.id,
              type: node.type as 'data_source',
              data_table: table ? { columns: table.columns, rows: table.rows } : undefined,
            });
          } else {
            execNodes.push({
              id: node.id,
              type: node.type as 'code' | 'output',
              code: node.code,
            });
          }
        }

        const response = await executePipeline({
          pipeline_id: pipeline.id,
          run_from: runFrom ?? null,
          nodes: execNodes,
          edges: pipeline.edges,
        });

        set({ analysisResults: response.results, isRunningPipeline: false });
      } catch {
        set({ isRunningPipeline: false });
      }
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
            variables: card.variables,
            scale_nodes: card.scale_nodes,
            data_table_id: card.data_table_id,
            x_column: card.x_column,
            y_columns: card.y_columns,
            group_column: card.group_column,
            value_column: card.value_column,
            aggregate_fn: card.aggregate_fn,
            data_table_rows: card.data_table_rows,
            x: card.x ?? fallbackRect.x,
            y: card.y ?? fallbackRect.y,
            w: card.w ?? fallbackRect.w,
            h: card.h ?? fallbackRect.h,
          };
          return { ...dashboard, cards: [...dashboard.cards, nextCard] };
        });
        return {
          dashboards,
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, state.pipelines, state.activePipelineId),
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
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, state.pipelines, state.activePipelineId),
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
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, state.pipelines, state.activePipelineId),
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
          model: persistAnalysis(state.model, state.scenarios, state.activeScenarioId, dashboards, state.activeDashboardId, state.sensitivityConfigs, state.activeSensitivityConfigId, state.optimisationConfigs, state.activeOptimisationConfigId, state.pipelines, state.activePipelineId),
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

// ── Auto-save to localStorage ──
let _saveTimer: ReturnType<typeof setTimeout> | null = null;
useEditorStore.subscribe((state) => {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(() => {
    saveModelToStorage(state.model);
    setActiveModelId(state.model.id);
  }, 1000);
});
