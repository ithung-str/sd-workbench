import type { ModelDocument } from '../types/model';

export const blankModel: ModelDocument = {
  id: 'unsaved_diagram',
  name: 'Unsaved diagram',
  version: 1,
  nodes: [],
  edges: [],
  outputs: [],
  global_variables: [],
};

export const teacupModel: ModelDocument = {
  id: 'teacup_cooling',
  name: 'Teacup Cooling',
  version: 1,
  nodes: [
    { id: 'stock_temperature', type: 'stock', name: 'temperature', label: 'Tea Temperature', equation: 'temperature_change', initial_value: 180, units: '°F', position: { x: 420, y: 220 } },
    { id: 'aux_room_temperature', type: 'aux', name: 'room_temperature', label: 'Room Temperature', equation: '70', units: '°F', position: { x: 180, y: 120 } },
    { id: 'aux_characteristic_time', type: 'aux', name: 'characteristic_time', label: 'Characteristic Time', equation: '10', units: 'minutes', position: { x: 180, y: 330 } },
    { id: 'flow_temperature_change', type: 'flow', name: 'temperature_change', label: 'Temperature Change', equation: '(room_temperature - temperature) / characteristic_time', source_stock_id: 'cloud_flow_tc_src', target_stock_id: 'stock_temperature', units: '°F/minute', position: { x: 650, y: 220 } },
    { id: 'cloud_flow_tc_src', type: 'cloud', position: { x: 750, y: 220 } },
  ],
  edges: [
    { id: 'e1', type: 'influence', source: 'aux_room_temperature', target: 'flow_temperature_change' },
    { id: 'e2', type: 'influence', source: 'stock_temperature', target: 'flow_temperature_change' },
    { id: 'e3', type: 'influence', source: 'aux_characteristic_time', target: 'flow_temperature_change' },
    { id: 'e4', type: 'flow_link', source: 'cloud_flow_tc_src', target: 'flow_temperature_change' },
    { id: 'e5', type: 'flow_link', source: 'flow_temperature_change', target: 'stock_temperature' },
  ],
  outputs: ['temperature', 'temperature_change', 'room_temperature'],
  global_variables: [],
};

export const bathtubInventoryModel: ModelDocument = {
  id: 'bathtub_inventory',
  name: 'Bathtub Inventory',
  version: 1,
  nodes: [
    { id: 'stock_inventory', type: 'stock', name: 'inventory', label: 'Inventory', equation: 'inflow - outflow', initial_value: 10, units: 'units', position: { x: 470, y: 220 } },
    { id: 'flow_inflow', type: 'flow', name: 'inflow', label: 'Inflow', equation: '3', source_stock_id: 'cloud_flow_inflow_src', target_stock_id: 'stock_inventory', units: 'units/time', position: { x: 210, y: 160 } },
    { id: 'flow_outflow', type: 'flow', name: 'outflow', label: 'Outflow', equation: '1', source_stock_id: 'stock_inventory', target_stock_id: 'cloud_flow_outflow_tgt', units: 'units/time', position: { x: 760, y: 300 } },
    { id: 'cloud_flow_inflow_src', type: 'cloud', position: { x: 110, y: 160 } },
    { id: 'cloud_flow_outflow_tgt', type: 'cloud', position: { x: 860, y: 300 } }
  ],
  edges: [
    { id: 'e1', type: 'flow_link', source: 'cloud_flow_inflow_src', target: 'flow_inflow' },
    { id: 'e2', type: 'flow_link', source: 'flow_inflow', target: 'stock_inventory' },
    { id: 'e3', type: 'flow_link', source: 'stock_inventory', target: 'flow_outflow' },
    { id: 'e4', type: 'flow_link', source: 'flow_outflow', target: 'cloud_flow_outflow_tgt' }
  ],
  outputs: ['inventory', 'inflow', 'outflow'],
  global_variables: [],
};

export const populationModel: ModelDocument = {
  id: 'population',
  name: 'Population',
  version: 1,
  nodes: [
    { id: 'stock_population', type: 'stock', name: 'population', label: 'Population', equation: 'births - deaths', initial_value: 100, units: 'people', position: { x: 470, y: 220 } },
    { id: 'aux_growth_rate', type: 'aux', name: 'growth_rate', label: 'Growth Rate', equation: '0.1', units: '1/time', position: { x: 210, y: 130 } },
    { id: 'flow_births', type: 'flow', name: 'births', label: 'Births', equation: 'population * growth_rate', source_stock_id: 'cloud_flow_births_src', target_stock_id: 'stock_population', units: 'people/time', position: { x: 210, y: 220 } },
    { id: 'aux_death_rate', type: 'aux', name: 'death_rate', label: 'Death Rate', equation: '0.05', units: '1/time', position: { x: 730, y: 130 } },
    { id: 'flow_deaths', type: 'flow', name: 'deaths', label: 'Deaths', equation: 'population * death_rate', source_stock_id: 'stock_population', target_stock_id: 'cloud_flow_deaths_tgt', units: 'people/time', position: { x: 730, y: 220 } },
    { id: 'cloud_flow_births_src', type: 'cloud', position: { x: 110, y: 220 } },
    { id: 'cloud_flow_deaths_tgt', type: 'cloud', position: { x: 830, y: 220 } }
  ],
  edges: [
    { id: 'e1', type: 'influence', source: 'stock_population', target: 'flow_births' },
    { id: 'e2', type: 'influence', source: 'aux_growth_rate', target: 'flow_births' },
    { id: 'e3', type: 'flow_link', source: 'cloud_flow_births_src', target: 'flow_births' },
    { id: 'e4', type: 'flow_link', source: 'flow_births', target: 'stock_population' },
    { id: 'e5', type: 'flow_link', source: 'stock_population', target: 'flow_deaths' },
    { id: 'e6', type: 'flow_link', source: 'flow_deaths', target: 'cloud_flow_deaths_tgt' },
    { id: 'e7', type: 'influence', source: 'stock_population', target: 'flow_deaths' },
    { id: 'e8', type: 'influence', source: 'aux_death_rate', target: 'flow_deaths' }
  ],
  outputs: ['population', 'births', 'deaths', 'growth_rate', 'death_rate'],
  global_variables: [],
};

export const supplyChainModel: ModelDocument = {
  id: 'supply_chain',
  name: 'Supply Chain',
  version: 1,
  metadata: {
    analysis: {
      scenarios: [
        {
          id: 'baseline',
          name: 'Baseline',
          status: 'baseline',
          color: '#1b6ca8',
          overrides: { params: {}, outputs: [], sim_config: {} },
        },
      ],
      dashboards: [
        {
          id: 'dashboard_supply_chain_ops',
          name: 'Supply Chain Ops',
          description: 'Operational snapshot for inventory and throughput',
          cards: [
            { id: 'card_raw_materials_kpi', type: 'kpi', title: 'Raw Materials', variable: 'raw_materials', order: 1, x: 24, y: 24, w: 264, h: 156 },
            { id: 'card_wip_kpi', type: 'kpi', title: 'Work in Progress', variable: 'work_in_progress', order: 2, x: 312, y: 24, w: 264, h: 156 },
            { id: 'card_finished_goods_kpi', type: 'kpi', title: 'Finished Goods', variable: 'finished_goods', order: 3, x: 600, y: 24, w: 264, h: 156 },
            { id: 'card_production_line', type: 'line', title: 'Production Trend', variable: 'production', order: 4, x: 24, y: 204, w: 576, h: 336 },
            { id: 'card_shipments_line', type: 'line', title: 'Shipments Trend', variable: 'shipments', order: 5, x: 624, y: 204, w: 576, h: 336 },
            { id: 'card_completion_table', type: 'table', title: 'Completion (Recent)', variable: 'completion', order: 6, table_rows: 10, x: 24, y: 564, w: 576, h: 372 },
          ],
        },
      ],
      defaults: {
        baseline_scenario_id: 'baseline',
        active_dashboard_id: 'dashboard_supply_chain_ops',
      },
    },
  },
  nodes: [
    // Stocks
    { id: 'stock_raw_materials', type: 'stock', name: 'raw_materials', label: 'Raw Materials', equation: 'purchasing - production', initial_value: 50, units: 'units', position: { x: 250, y: 180 } },
    { id: 'stock_work_in_progress', type: 'stock', name: 'work_in_progress', label: 'Work in Progress', equation: 'production - completion', initial_value: 20, units: 'units', position: { x: 550, y: 180 } },
    { id: 'stock_finished_goods', type: 'stock', name: 'finished_goods', label: 'Finished Goods', equation: 'completion - shipments', initial_value: 30, units: 'units', position: { x: 850, y: 180 } },

    // Flows
    { id: 'flow_purchasing', type: 'flow', name: 'purchasing', label: 'Purchasing', equation: '10', source_stock_id: 'cloud_flow_purchasing_src', target_stock_id: 'stock_raw_materials', units: 'units/time', position: { x: 100, y: 120 } },
    { id: 'flow_production', type: 'flow', name: 'production', label: 'Production', equation: 'raw_materials * production_rate', source_stock_id: 'stock_raw_materials', target_stock_id: 'stock_work_in_progress', units: 'units/time', position: { x: 400, y: 120 } },
    { id: 'flow_completion', type: 'flow', name: 'completion', label: 'Completion', equation: 'work_in_progress * completion_rate', source_stock_id: 'stock_work_in_progress', target_stock_id: 'stock_finished_goods', units: 'units/time', position: { x: 700, y: 120 } },
    { id: 'flow_shipments', type: 'flow', name: 'shipments', label: 'Shipments', equation: 'demand', source_stock_id: 'stock_finished_goods', target_stock_id: 'cloud_flow_shipments_tgt', units: 'units/time', position: { x: 1000, y: 240 } },

    // Clouds
    { id: 'cloud_flow_purchasing_src', type: 'cloud', position: { x: 0, y: 120 } },
    { id: 'cloud_flow_shipments_tgt', type: 'cloud', position: { x: 1100, y: 240 } },

    // Auxiliaries
    { id: 'aux_production_rate', type: 'aux', name: 'production_rate', label: 'Production Rate', equation: '0.3', units: '1/time', position: { x: 250, y: 340 } },
    { id: 'aux_completion_rate', type: 'aux', name: 'completion_rate', label: 'Completion Rate', equation: '0.5', units: '1/time', position: { x: 550, y: 340 } },
    { id: 'aux_demand', type: 'aux', name: 'demand', label: 'Demand', equation: '8', units: 'units/time', position: { x: 850, y: 340 } }
  ],
  edges: [
    // Flow links
    { id: 'e1', type: 'flow_link', source: 'cloud_flow_purchasing_src', target: 'flow_purchasing' },
    { id: 'e2', type: 'flow_link', source: 'flow_purchasing', target: 'stock_raw_materials' },
    { id: 'e3', type: 'flow_link', source: 'stock_raw_materials', target: 'flow_production' },
    { id: 'e4', type: 'flow_link', source: 'flow_production', target: 'stock_work_in_progress' },
    { id: 'e5', type: 'flow_link', source: 'stock_work_in_progress', target: 'flow_completion' },
    { id: 'e6', type: 'flow_link', source: 'flow_completion', target: 'stock_finished_goods' },
    { id: 'e7', type: 'flow_link', source: 'stock_finished_goods', target: 'flow_shipments' },
    { id: 'e8', type: 'flow_link', source: 'flow_shipments', target: 'cloud_flow_shipments_tgt' },

    // Influences
    { id: 'e9', type: 'influence', source: 'stock_raw_materials', target: 'flow_production' },
    { id: 'e10', type: 'influence', source: 'aux_production_rate', target: 'flow_production' },
    { id: 'e11', type: 'influence', source: 'stock_work_in_progress', target: 'flow_completion' },
    { id: 'e12', type: 'influence', source: 'aux_completion_rate', target: 'flow_completion' },
    { id: 'e13', type: 'influence', source: 'aux_demand', target: 'flow_shipments' }
  ],
  outputs: ['raw_materials', 'work_in_progress', 'finished_goods', 'purchasing', 'production', 'completion', 'shipments'],
  global_variables: [],
};

export const modelPresets = {
  blank: blankModel,
  teacup: teacupModel,
  bathtub: bathtubInventoryModel,
  population: populationModel,
  supplyChain: supplyChainModel,
} as const;

export type ModelPresetKey = keyof typeof modelPresets;

export function cloneModel(model: ModelDocument): ModelDocument {
  return JSON.parse(JSON.stringify(model)) as ModelDocument;
}
