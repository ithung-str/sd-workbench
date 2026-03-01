export type Position = { x: number; y: number };
export type LookupPoint = { x: number; y: number };

export type WaypointPosition = { x: number; y: number };

export type VisualStyle = {
  fill?: string;
  stroke?: string;
  stroke_width?: number;
  line_style?: string;
  opacity?: number;
  text_color?: string;
  font_family?: string;
  font_size?: number;
  font_weight?: string | number;
  text_align?: string;
};

export type LayoutMetadata = {
  width?: number;
  height?: number;
  rotation?: number;
  waypoints?: WaypointPosition[];
  visible?: boolean;
  locked?: boolean;
  z_index?: number;
};

export type StockNode = {
  id: string;
  type: 'stock';
  name: string;
  label: string;
  equation: string;
  initial_value: number | string;
  units?: string;
  position: Position;
  style?: VisualStyle;
  layout?: LayoutMetadata;
  show_graph?: boolean;
  geo_x?: number;
  geo_y?: number;
};

export type AuxNode = {
  id: string;
  type: 'aux';
  name: string;
  label: string;
  equation: string;
  units?: string;
  position: Position;
  style?: VisualStyle;
  layout?: LayoutMetadata;
};

export type FlowNode = {
  id: string;
  type: 'flow';
  name: string;
  label: string;
  equation: string;
  source_stock_id?: string;
  target_stock_id?: string;
  flow_sign?: 'positive' | 'negative' | 'both';
  units?: string;
  position: Position;
  style?: VisualStyle;
  layout?: LayoutMetadata;
};

export type LookupInterpolation = 'linear' | 'step' | 'cubic' | 'exponential' | 's-curve';

export type LookupNode = {
  id: string;
  type: 'lookup';
  name: string;
  label: string;
  equation: string; // input expression to evaluate on x-axis
  points: LookupPoint[];
  interpolation?: LookupInterpolation;
  formula?: string; // optional formula alternative to points, e.g. "sin(x)"
  formula_range?: { min: number; max: number; steps: number }; // domain for formula evaluation
  units?: string;
  position: Position;
  style?: VisualStyle;
  layout?: LayoutMetadata;
};

export type TextNode = {
  id: string;
  type: 'text';
  text: string;
  position: Position;
  style?: VisualStyle;
  layout?: LayoutMetadata;
  annotation?: {
    kind?: string;
    title?: string;
    note?: string;
  };
};

export type CloudNode = {
  id: string;
  type: 'cloud';
  position: Position;
};

export type CldSymbol = '+' | '-' | '||' | 'R' | 'B';
export type CldLoopDirection = 'clockwise' | 'counterclockwise';

export type CldSymbolNode = {
  id: string;
  type: 'cld_symbol';
  symbol: CldSymbol;
  loop_direction?: CldLoopDirection;
  name?: string;
  position: Position;
};

export type PhantomNode = {
  id: string;
  type: 'phantom';
  position: Position;
};

export type NodeModel = StockNode | AuxNode | FlowNode | LookupNode | TextNode | CloudNode | CldSymbolNode | PhantomNode;

export type GlobalVariable = {
  id: string;
  name: string;
  equation: string;
  units?: string;
};

export type EdgeModel =
  | { id: string; type: 'influence'; source: string; target: string; source_handle?: string; target_handle?: string; style?: VisualStyle; layout?: LayoutMetadata }
  | { id: string; type: 'flow_link'; source: string; target: string; source_handle?: string; target_handle?: string; style?: VisualStyle; layout?: LayoutMetadata };

export type ModelDocument = {
  id: string;
  name: string;
  version: 1;
  metadata?: {
    description?: string;
    author?: string;
    created_at?: string;
    updated_at?: string;
    analysis?: AnalysisConfig;
  };
  nodes: NodeModel[];
  edges: EdgeModel[];
  outputs: string[];
  global_variables?: GlobalVariable[];
};

export type FunctionCatalogEntry = {
  key: string;
  displayName: string;
  template: string;
  category: 'Math' | 'Time Inputs' | 'Delays/Smoothing' | 'Stochastic' | 'Lookups' | 'Other Detected';
  description: string;
  source: 'core' | 'vensim';
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
    execution_mode?: 'pysd' | 'mixed' | 'blocked';
    fallback_activations?: string[];
  };
};

export type SimConfigOverride = {
  start?: number;
  stop?: number;
  dt?: number;
  return_step?: number;
};

export type ScenarioOverrides = {
  sim_config?: SimConfigOverride;
  outputs?: string[];
  params?: Record<string, number | string>;
};

export type ScenarioDefinition = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  tags?: string[];
  status?: 'baseline' | 'policy' | 'draft' | 'archived';
  overrides?: ScenarioOverrides;
};

export type DashboardCardType = 'kpi' | 'line' | 'table' | 'map';

export type DashboardCard = {
  id: string;
  type: DashboardCardType;
  title: string;
  variable: string;
  order: number;
  table_rows?: number;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  time_index?: number;
};

export type DashboardDefinition = {
  id: string;
  name: string;
  description?: string;
  cards: DashboardCard[];
};

export type AnalysisConfig = {
  scenarios: ScenarioDefinition[];
  defaults?: {
    baseline_scenario_id?: string;
    active_dashboard_id?: string;
  };
  dashboards?: DashboardDefinition[];
};

export type ScenarioRunResult = {
  scenario_id: string;
  scenario_name: string;
  series: Record<string, number[]>;
  warnings: ValidationIssue[];
  metadata: SimulateResponse['metadata'];
};

export type ScenarioRunError = {
  scenario_id: string;
  scenario_name: string;
  code: string;
  message: string;
};

export type BatchSimulateRequest = {
  model: ModelDocument;
  sim_config: SimConfig;
  scenarios: ScenarioDefinition[];
  include_baseline?: boolean;
};

export type BatchSimulateResponse = {
  ok: boolean;
  runs: ScenarioRunResult[];
  errors: ScenarioRunError[];
};

export type SensitivityParameterRange = {
  name: string;
  low: number;
  high: number;
  steps: number;
};

export type OATSensitivityPoint = {
  parameter: string;
  value: number;
  metric_value: number;
};

export type OATSensitivityItem = {
  parameter: string;
  baseline_metric: number;
  min_metric: number;
  max_metric: number;
  swing: number;
  normalized_swing: number;
  points: OATSensitivityPoint[];
};

export type OATSensitivityRequest = {
  model: ModelDocument;
  sim_config: SimConfig;
  scenarios: ScenarioDefinition[];
  scenario_id?: string;
  output: string;
  metric: 'final' | 'max' | 'min' | 'mean';
  parameters: SensitivityParameterRange[];
};

export type OATSensitivityResponse = {
  ok: boolean;
  scenario_id: string;
  output: string;
  metric: 'final' | 'max' | 'min' | 'mean';
  baseline_metric: number;
  items: OATSensitivityItem[];
};

export type MonteCarloParameter = {
  name: string;
  distribution: 'uniform' | 'normal' | 'triangular';
  min?: number;
  max?: number;
  mean?: number;
  stddev?: number;
  mode?: number;
};

export type MonteCarloSample = {
  run_index: number;
  metric_value: number;
  params: Record<string, number>;
};

export type MonteCarloQuantiles = {
  p05: number;
  p25: number;
  p50: number;
  p75: number;
  p95: number;
  mean: number;
  stddev: number;
  min: number;
  max: number;
};

export type MonteCarloRequest = {
  model: ModelDocument;
  sim_config: SimConfig;
  scenarios: ScenarioDefinition[];
  scenario_id?: string;
  output: string;
  metric: 'final' | 'max' | 'min' | 'mean';
  runs: number;
  seed: number;
  parameters: MonteCarloParameter[];
};

export type MonteCarloResponse = {
  ok: boolean;
  scenario_id: string;
  output: string;
  metric: 'final' | 'max' | 'min' | 'mean';
  runs: number;
  seed: number;
  quantiles: MonteCarloQuantiles;
  samples: MonteCarloSample[];
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

export type VensimImportGapItem = {
  kind: 'variable' | 'edge' | 'equation' | 'construct' | 'layout';
  symbol: string;
  reason: string;
  severity: 'info' | 'warning' | 'error';
};

export type VensimImportGapSummary = {
  dropped_variables: number;
  dropped_edges: number;
  unparsed_equations: number;
  unsupported_constructs: string[];
  samples: VensimImportGapItem[];
};

export type VensimCapabilityReport = {
  tier: 'T0' | 'T1' | 'T2' | 'T3' | 'T4';
  supported: string[];
  partial: string[];
  unsupported: string[];
  detected_functions: string[];
  detected_time_settings: string[];
  details?: VensimFunctionCapabilityDetail[];
  families?: VensimFamilyCapabilitySummary[];
};

export type VensimFunctionCapabilityDetail = {
  function: string;
  family: string;
  support_mode: 'pysd' | 'native_fallback' | 'unsupported';
  pysd_support: 'yes' | 'partial' | 'no';
  deterministic: boolean;
  dimensional: boolean;
  count: number;
  severity: 'info' | 'warning' | 'error';
  notes: string;
};

export type VensimFamilyCapabilitySummary = {
  family: string;
  functions: string[];
  highest_severity: 'info' | 'warning' | 'error';
  support_mode: 'pysd' | 'native_fallback' | 'unsupported';
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
    import_gaps?: VensimImportGapSummary;
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

export type VensimDiagnosticsResponse = {
  ok: boolean;
  import_id: string;
  capabilities: VensimCapabilityReport;
  warnings: ValidationIssue[];
  errors: ValidationIssue[];
  import_gaps?: VensimImportGapSummary;
};

export type VensimPresetLoadStatus = 'ok' | 'partial' | 'failed';

export type VensimParityReadinessResponse = {
  ok: boolean;
  import_id: string;
  readiness: 'green' | 'yellow' | 'red';
  reasons: string[];
};

export type VensimBatchSimulateRequest = {
  import_id: string;
  sim_config?: VensimSimConfigOverride;
  scenarios: ScenarioDefinition[];
  include_baseline?: boolean;
  outputs?: string[];
};

export type VensimOATSensitivityRequest = {
  import_id: string;
  sim_config?: VensimSimConfigOverride;
  scenarios: ScenarioDefinition[];
  scenario_id?: string;
  output: string;
  metric: 'final' | 'max' | 'min' | 'mean';
  parameters: SensitivityParameterRange[];
};

export type VensimMonteCarloRequest = {
  import_id: string;
  sim_config?: VensimSimConfigOverride;
  scenarios: ScenarioDefinition[];
  scenario_id?: string;
  output: string;
  metric: 'final' | 'max' | 'min' | 'mean';
  runs: number;
  seed: number;
  parameters: MonteCarloParameter[];
};
