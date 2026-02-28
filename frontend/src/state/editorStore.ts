import { create } from 'zustand';
import { executeAiCommand, importVensimFile, simulateImportedVensim, simulateModel, validateModel } from '../lib/api';
import { localValidate } from '../lib/modelValidation';
import { blankModel, cloneModel, teacupModel } from '../lib/sampleModels';
import type {
  EdgeModel,
  GlobalVariable,
  ModelDocument,
  NodeModel,
  SimConfig,
  SimulateResponse,
  ValidateResponse,
  ValidationIssue,
  VensimImportResponse,
} from '../types/model';

export type DockTab = 'validation' | 'chart' | 'table';

type Selection =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | null;

type EditorState = {
  model: ModelDocument;
  selected: Selection;
  simConfig: SimConfig;
  activeSimulationMode: 'native_json' | 'vensim';
  importedVensim: VensimImportResponse | null;
  vensimSelectedOutputs: string[];
  vensimParamOverrides: Record<string, number | string>;
  aiCommand: string;
  validation: ValidateResponse;
  localIssues: ValidationIssue[];
  results: SimulateResponse | null;
  apiError: string | null;
  activeDockTab: DockTab;
  isValidating: boolean;
  isSimulating: boolean;
  isApplyingAi: boolean;
  backendHealthy: boolean | null;
  setSelected: (selected: Selection) => void;
  addNode: (type: NodeModel['type']) => void;
  addGlobalVariable: () => void;
  updateGlobalVariable: (id: string, patch: Partial<GlobalVariable>) => void;
  deleteGlobalVariable: (id: string) => void;
  updateNode: (id: string, patch: Partial<NodeModel>) => void;
  updateNodePosition: (id: string, x: number, y: number) => void;
  addEdge: (edge: EdgeModel) => void;
  deleteSelected: () => void;
  setActiveDockTab: (tab: DockTab) => void;
  setSimConfig: (patch: Partial<SimConfig>) => void;
  runValidate: () => Promise<void>;
  runSimulate: () => Promise<void>;
  loadModel: (model: ModelDocument) => void;
  importVensim: (file: File) => Promise<void>;
  setVensimSelectedOutputs: (outputs: string[]) => void;
  setVensimParamOverride: (name: string, value: number | string | undefined) => void;
  setAiCommand: (value: string) => void;
  runAiCommand: () => Promise<void>;
};

function defaultValidation(): ValidateResponse {
  return { ok: true, errors: [], warnings: [] };
}

function nextNodeDefaults(type: NodeModel['type'], count: number): NodeModel {
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
    label: `Aux ${n}`,
    equation: '0',
    position: { x: 220 + n * 40, y: 120 + n * 30 },
  };
}

export const useEditorStore = create<EditorState>((set, get) => ({
  model: cloneModel(teacupModel),
  selected: null,
  simConfig: { start: 0, stop: 30, dt: 1, method: 'euler' },
  activeSimulationMode: 'native_json',
  importedVensim: null,
  vensimSelectedOutputs: [],
  vensimParamOverrides: {},
  aiCommand: '',
  validation: defaultValidation(),
  localIssues: [],
  results: null,
  apiError: null,
  activeDockTab: 'validation',
  isValidating: false,
  isSimulating: false,
  isApplyingAi: false,
  backendHealthy: null,
  setSelected: (selected) => set({ selected }),
  addNode: (type) => {
    set((state) => {
      const count = state.model.nodes.length;
      if (type === 'flow') {
        // Create cloud node
        const cloudNode = nextNodeDefaults('cloud', count);
        // Create flow node positioned to the right of cloud
        const flowNode = nextNodeDefaults('flow', count);
        // Create flow_link edge from cloud to flow
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
  },
  addGlobalVariable: () => {
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
  },
  updateGlobalVariable: (id, patch) => {
    set((state) => {
      const model = {
        ...state.model,
        global_variables: (state.model.global_variables ?? []).map((variable) =>
          variable.id === id ? { ...variable, ...patch } : variable,
        ),
      };
      return { model, localIssues: localValidate(model) };
    });
  },
  deleteGlobalVariable: (id) => {
    set((state) => {
      const model = {
        ...state.model,
        global_variables: (state.model.global_variables ?? []).filter((variable) => variable.id !== id),
      };
      return { model, localIssues: localValidate(model) };
    });
  },
  updateNode: (id, patch) => {
    set((state) => {
      const nodes = state.model.nodes.map((node) => (node.id === id ? ({ ...node, ...patch } as NodeModel) : node));
      const model = { ...state.model, nodes };
      return { model, localIssues: localValidate(model) };
    });
  },
  updateNodePosition: (id, x, y) => {
    set((state) => ({
      model: {
        ...state.model,
        nodes: state.model.nodes.map((n) => (n.id === id ? { ...n, position: { x, y } } : n)),
      },
    }));
  },
  addEdge: (edge) => set((state) => ({ model: { ...state.model, edges: [...state.model.edges, edge] } })),
  deleteSelected: () => {
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
      const model = { ...state.model, edges: state.model.edges.filter((e) => e.id !== state.selected?.id) };
      return { model, selected: null };
    });
  },
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
      set({ validation, isValidating: false });
    } catch (error) {
      set({ isValidating: false, apiError: 'Validation request failed' });
      throw error;
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
      set({ isSimulating: false, apiError: 'Simulation request failed' });
    }
  },
  runAiCommand: async () => {
    const { model, aiCommand, activeSimulationMode } = get();
    if (activeSimulationMode === 'vensim') {
      set({ apiError: 'AI canvas editing is currently available for native JSON models only.' });
      return;
    }
    if (!aiCommand.trim()) return;
    set({ isApplyingAi: true, apiError: null });
    try {
      const response = await executeAiCommand(aiCommand.trim(), model);
      const updated = cloneModel(response.model);
      set({
        model: updated,
        selected: null,
        localIssues: localValidate(updated),
        validation: defaultValidation(),
        results: null,
        isApplyingAi: false,
        aiCommand: '',
      });
    } catch (error: any) {
      set({ isApplyingAi: false, apiError: error?.errors?.[0]?.message ?? 'AI command failed' });
    }
  },
  loadModel: (model) => {
    const cloned = cloneModel({ ...model, global_variables: model.global_variables ?? [] });
    set({
      model: cloned,
      selected: null,
      results: null,
      validation: defaultValidation(),
      localIssues: localValidate(cloned),
      activeSimulationMode: 'native_json',
      importedVensim: null,
      vensimSelectedOutputs: [],
      vensimParamOverrides: {},
    });
  },
  importVensim: async (file) => {
    set({ apiError: null, isValidating: true });
    try {
      const importedVensim = await importVensimFile(file);
      const canonical = importedVensim.model_view.canonical ?? cloneModel(blankModel);
      const time = importedVensim.model_view.time_settings;
      set({
        importedVensim,
        activeSimulationMode: 'vensim',
        model: cloneModel(canonical),
        selected: null,
        results: null,
        validation: { ok: importedVensim.errors.length === 0, errors: importedVensim.errors, warnings: importedVensim.warnings },
        localIssues: [],
        isValidating: false,
        activeDockTab: 'validation',
        vensimSelectedOutputs: importedVensim.model_view.variables.slice(0, 8).map((v) => v.name),
        vensimParamOverrides: {},
        simConfig: {
          start: time?.initial_time ?? 0,
          stop: time?.final_time ?? 30,
          dt: time?.time_step ?? 1,
          return_step: time?.saveper ?? time?.time_step ?? 1,
          method: 'euler',
        },
      });
    } catch (error: any) {
      set({ isValidating: false, apiError: error?.errors?.[0]?.message ?? 'Vensim import failed' });
    }
  },
}));
