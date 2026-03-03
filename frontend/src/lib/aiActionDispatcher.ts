import type { AIAction, DashboardCardType, VisualStyle } from '../types/model';
import type { useEditorStore } from '../state/editorStore';

type Store = ReturnType<typeof useEditorStore.getState>;
type GetState = () => Store;

export type DispatchResult = { executed: number; errors: string[] };

/**
 * Dispatch AI actions to the editor store.
 * Takes a getState function to always read fresh state after mutations.
 */
export async function dispatchAiActions(actions: AIAction[], getState: GetState): Promise<DispatchResult> {
  let executed = 0;
  const errors: string[] = [];

  for (const action of actions) {
    try {
      await dispatchOne(action, getState);
      executed++;
    } catch (err) {
      errors.push(`${action.type}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return { executed, errors };
}

async function dispatchOne(action: AIAction, getState: GetState): Promise<void> {
  const p = action.params;
  const store = getState();

  switch (action.type) {
    case 'update_sim_config': {
      const patch: Record<string, number> = {};
      if (p.start != null) patch.start = Number(p.start);
      if (p.stop != null) patch.stop = Number(p.stop);
      if (p.dt != null) patch.dt = Number(p.dt);
      if (p.return_step != null) patch.return_step = Number(p.return_step);
      store.setSimConfig(patch);
      return;
    }

    case 'create_scenario': {
      store.createScenario();
      // The newly created scenario is the last one; update it with provided params
      const scenarios = getState().scenarios;
      const created = scenarios[scenarios.length - 1];
      if (created) {
        const patch: Record<string, unknown> = {};
        if (p.name) patch.name = String(p.name);
        if (p.description) patch.description = String(p.description);
        if (p.color) patch.color = String(p.color);
        if (p.status) patch.status = String(p.status);
        if (p.overrides) patch.overrides = p.overrides;
        store.updateScenario(created.id, patch);
      }
      return;
    }

    case 'update_scenario': {
      const id = findScenarioId(getState, String(p.scenario_name));
      const patch = (p.patch ?? {}) as Record<string, unknown>;
      store.updateScenario(id, patch);
      return;
    }

    case 'delete_scenario': {
      const id = findScenarioId(getState, String(p.scenario_name));
      store.deleteScenario(id);
      return;
    }

    case 'create_sensitivity_config': {
      store.createSensitivityConfig();
      const configs = getState().sensitivityConfigs;
      const created = configs[configs.length - 1];
      if (created) {
        const patch: Record<string, unknown> = {};
        if (p.name) patch.name = String(p.name);
        if (p.type) patch.type = String(p.type);
        if (p.output) patch.output = String(p.output);
        if (p.metric) patch.metric = String(p.metric);
        if (p.parameters) patch.parameters = p.parameters;
        if (p.runs != null) patch.runs = Number(p.runs);
        if (p.seed != null) patch.seed = Number(p.seed);
        store.updateSensitivityConfig(created.id, patch);
      }
      return;
    }

    case 'update_sensitivity_config': {
      const id = findSensitivityConfigId(getState, String(p.config_name));
      const patch = (p.patch ?? {}) as Record<string, unknown>;
      store.updateSensitivityConfig(id, patch);
      return;
    }

    case 'delete_sensitivity_config': {
      const id = findSensitivityConfigId(getState, String(p.config_name));
      store.deleteSensitivityConfig(id);
      return;
    }

    case 'create_dashboard': {
      const cards = Array.isArray(p.cards) ? p.cards as { type: DashboardCardType; title: string; variable: string }[] : undefined;
      store.createDashboard(String(p.name), cards);
      return;
    }

    case 'update_dashboard': {
      const id = findDashboardId(getState, String(p.dashboard_name));
      const patch = (p.patch ?? {}) as Record<string, unknown>;
      store.updateDashboard(id, patch);
      return;
    }

    case 'delete_dashboard': {
      const id = findDashboardId(getState, String(p.dashboard_name));
      store.deleteDashboard(id);
      return;
    }

    case 'add_dashboard_card': {
      const id = findDashboardId(getState, String(p.dashboard_name));
      const card = p.card as { type: DashboardCardType; title: string; variable: string };
      store.addDashboardCard(id, card);
      return;
    }

    case 'delete_dashboard_card': {
      const dashId = findDashboardId(getState, String(p.dashboard_name));
      const dashboard = getState().dashboards.find((d) => d.id === dashId);
      const card = dashboard?.cards.find((c) => c.title === String(p.card_title));
      if (!card) throw new Error(`No card titled '${p.card_title}' in dashboard '${p.dashboard_name}'`);
      store.deleteDashboardCard(dashId, card.id);
      return;
    }

    case 'update_default_style': {
      const nodeType = String(p.node_type) as 'stock' | 'flow' | 'aux' | 'lookup';
      const style = (p.style ?? {}) as Partial<VisualStyle>;
      store.updateDefaultStyle(nodeType, style);
      return;
    }

    case 'run_simulate': {
      await store.runSimulate();
      return;
    }

    case 'run_validate': {
      await store.runValidate();
      return;
    }

    case 'run_scenario_batch': {
      await store.runScenarioBatch();
      return;
    }

    case 'run_sensitivity': {
      await store.runActiveSensitivity();
      return;
    }

    case 'navigate': {
      const page = String(p.page);
      const tabMap: Record<string, string> = {
        canvas: 'canvas',
        formulas: 'formulas',
        dashboard: 'dashboard',
        scenarios: 'scenarios',
        sensitivity: 'sensitivity',
      };
      const tab = tabMap[page];
      if (tab) {
        store.setActiveTab(tab as 'canvas' | 'formulas' | 'dashboard' | 'scenarios' | 'sensitivity');
      }
      return;
    }

    default:
      throw new Error(`Unknown action type: ${action.type}`);
  }
}

function findScenarioId(getState: GetState, name: string): string {
  const scenario = getState().scenarios.find((s) => s.name === name);
  if (!scenario) throw new Error(`No scenario named '${name}'`);
  return scenario.id;
}

function findDashboardId(getState: GetState, name: string): string {
  const dashboard = getState().dashboards.find((d) => d.name === name);
  if (!dashboard) throw new Error(`No dashboard named '${name}'`);
  return dashboard.id;
}

function findSensitivityConfigId(getState: GetState, name: string): string {
  const config = getState().sensitivityConfigs.find((c) => c.name === name);
  if (!config) throw new Error(`No sensitivity config named '${name}'`);
  return config.id;
}
