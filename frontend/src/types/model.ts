export type Position = { x: number; y: number };
export type LookupPoint = { x: number; y: number };

export type StockNode = {
  id: string;
  type: 'stock';
  name: string;
  label: string;
  equation: string;
  initial_value: number | string;
  units?: string;
  position: Position;
};

export type AuxNode = {
  id: string;
  type: 'aux';
  name: string;
  label: string;
  equation: string;
  units?: string;
  position: Position;
};

export type FlowNode = {
  id: string;
  type: 'flow';
  name: string;
  label: string;
  equation: string;
  source_stock_id?: string;
  target_stock_id?: string;
  units?: string;
  position: Position;
};

export type LookupNode = {
  id: string;
  type: 'lookup';
  name: string;
  label: string;
  equation: string; // input expression to evaluate on x-axis
  points: LookupPoint[];
  interpolation?: 'linear';
  units?: string;
  position: Position;
};

export type TextNode = {
  id: string;
  type: 'text';
  text: string;
  position: Position;
};

export type CloudNode = {
  id: string;
  type: 'cloud';
  position: Position;
};

export type NodeModel = StockNode | AuxNode | FlowNode | LookupNode | TextNode | CloudNode;

export type GlobalVariable = {
  id: string;
  name: string;
  equation: string;
  units?: string;
};

export type EdgeModel =
  | { id: string; type: 'influence'; source: string; target: string; source_handle?: string; target_handle?: string }
  | { id: string; type: 'flow_link'; source: string; target: string; source_handle?: string; target_handle?: string };

export type ModelDocument = {
  id: string;
  name: string;
  version: 1;
  metadata?: {
    description?: string;
    author?: string;
    created_at?: string;
    updated_at?: string;
  };
  nodes: NodeModel[];
  edges: EdgeModel[];
  outputs: string[];
  global_variables?: GlobalVariable[];
};

export type SimConfig = {
  start: number;
  stop: number;
  dt: number;
  method: 'euler';
  return_step?: number;
};

export type ValidationIssue = {
  code: string;
  message: string;
  severity: 'error' | 'warning';
  node_id?: string;
  edge_id?: string;
  field?: string;
  symbol?: string;
};

export type ValidateResponse = {
  ok: boolean;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
  normalized?: ModelDocument;
};

export type SimulateRequest = { model: ModelDocument; sim_config: SimConfig };

export type SimulateResponse = {
  ok: boolean;
  series: Record<string, number[]>;
  warnings: ValidationIssue[];
  metadata: {
    engine: string;
    method?: 'euler';
    row_count: number;
    variables_returned: string[];
    source_format?: 'vensim-mdl';
    import_id?: string;
    time?: ImportedTimeSettings;
  };
};

export type ImportedVariableSummary = {
  name: string;
  py_name?: string;
  kind?: string;
  equation?: string;
  units?: string;
  doc?: string;
  dimensions: string[];
  dependencies?: string[];
};

export type ImportedDimensionSummary = {
  name: string;
  values: string[];
};

export type ImportedTimeSettings = {
  initial_time?: number;
  final_time?: number;
  time_step?: number;
  saveper?: number;
};

export type VensimCapabilityReport = {
  tier: 'T0' | 'T1' | 'T2' | 'T3' | 'T4';
  supported: string[];
  partial: string[];
  unsupported: string[];
  detected_functions: string[];
  detected_time_settings: string[];
};

export type VensimImportResponse = {
  ok: boolean;
  import_id: string;
  source: { filename: string; format: 'vensim-mdl' };
  capabilities: VensimCapabilityReport;
  warnings: ValidationIssue[];
  errors: ValidationIssue[];
  model_view: {
    canonical?: ModelDocument;
    variables: ImportedVariableSummary[];
    dimensions?: ImportedDimensionSummary[];
    time_settings?: ImportedTimeSettings;
    dependency_graph?: { edges: [string, string][] };
  };
};

export type VensimSimConfigOverride = {
  start?: number;
  stop?: number;
  dt?: number;
  saveper?: number;
};

export type VensimSimulateRequest = {
  import_id: string;
  sim_config?: VensimSimConfigOverride;
  outputs?: string[];
  params?: Record<string, number | string>;
};

export type VensimSimulateResponse = SimulateResponse;
