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

export type DimensionDefinition = {
  id: string;
  name: string;
  elements: string[];
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
  min_value?: number;
  max_value?: number;
  non_negative?: boolean;
  units?: string;
  position: Position;
  style?: VisualStyle;
  layout?: LayoutMetadata;
  show_graph?: boolean;
  longitude?: number;
  latitude?: number;
  dimensions?: string[];
  equation_overrides?: Record<string, string>;
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
  dimensions?: string[];
  equation_overrides?: Record<string, string>;
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
  min_value?: number;
  max_value?: number;
  non_negative?: boolean;
  units?: string;
  position: Position;
  style?: VisualStyle;
  layout?: LayoutMetadata;
  dimensions?: string[];
  equation_overrides?: Record<string, string>;
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
  dimensions?: string[];
  equation_overrides?: Record<string, string>;
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

export type DiagramStyleDefaults = {
  stock?: VisualStyle;
  flow?: VisualStyle;
  aux?: VisualStyle;
  lookup?: VisualStyle;
};

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
    default_styles?: DiagramStyleDefaults;
  };
  nodes: NodeModel[];
  edges: EdgeModel[];
  outputs: string[];
  global_variables?: GlobalVariable[];
  dimensions?: DimensionDefinition[];
};

export type FunctionCatalogEntry = {
  key: string;
  displayName: string;
  template: string;
  category: 'Math' | 'Time Inputs' | 'Delays/Smoothing' | 'Stochastic' | 'Lookups' | 'Other Detected';
  description: string;
  source: 'core';
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

export type DashboardCardType =
  | 'kpi' | 'line' | 'table' | 'map' | 'heatmap' | 'sparkline' | 'comparison'
  | 'data_bar' | 'data_stacked_bar' | 'data_area' | 'data_pie' | 'data_table' | 'data_pivot';

export type DashboardCard = {
  id: string;
  type: DashboardCardType;
  title: string;
  variable: string;
  order: number;
  table_rows?: number;
  variables?: string[];
  scale_nodes?: boolean;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  time_index?: number;
  // Data-table-backed card fields
  data_table_id?: string;
  x_column?: string;
  y_columns?: string[];
  group_column?: string;
  value_column?: string;
  aggregate_fn?: 'sum' | 'avg' | 'count' | 'min' | 'max';
  data_table_rows?: number;
  // Filters (data cards)
  filters?: Array<{ column: string; operator: string; value: string | string[] }>;
  series_column?: string;
  // Display options (sim cards)
  y_min?: number;
  y_max?: number;
  decimals?: number;
  unit_suffix?: string;
  show_data_points?: boolean;
  reference_line?: number;
  // Style options (both families)
  line_color?: string;
  line_style?: 'solid' | 'dashed' | 'dotted';
  show_legend?: boolean;
  show_grid?: boolean;
  color_palette?: string;
};

export type DashboardDefinition = {
  id: string;
  name: string;
  description?: string;
  cards: DashboardCard[];
};

export type SensitivityConfig = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  type: 'oat' | 'monte-carlo';
  output: string;
  metric: 'final' | 'max' | 'min' | 'mean';
  parameters: SensitivityParameterRange[];
  runs?: number;
  seed?: number;
};

export type AnalysisNodeType = 'data_source' | 'code' | 'sql' | 'output' | 'note' | 'group' | 'sheets_export' | 'publish';

export type ChartConfig = {
  xColumn?: string;
  yColumns?: string[];
  colorColumn?: string;
  aggregation?: 'none' | 'sum' | 'mean' | 'count' | 'min' | 'max';
};

export type AnalysisNode = {
  id: string;
  type: AnalysisNodeType;
  name?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  code?: string;
  sql?: string;
  description?: string;
  content?: string;
  data_table_id?: string;
  chart_config?: ChartConfig;
  /** ID of group node this node belongs to */
  parentGroup?: string;
  /** For group nodes: whether the group is collapsed */
  collapsed?: boolean;
  /** For group nodes: visual color */
  groupColor?: string;
  /** For sheets_export nodes: target spreadsheet URL */
  spreadsheet_url?: string;
  /** For sheets_export nodes: target sheet name */
  sheet_name?: string;
  /** For publish nodes: published data table ID */
  publish_table_id?: string;
  /** For publish nodes: overwrite vs append */
  publish_mode?: 'overwrite' | 'append';
  /** Mock data for design-time previews (snapshot from last execution) */
  mockValue?: {
    kind: 'dataframe' | 'scalar' | 'dict' | 'list' | 'text';
    preview: Record<string, unknown>;
    shape?: number[];
    generic_value?: unknown;
  };
  /** Notebook import provenance used for grouping/layout heuristics */
  original_cells?: number[];
  /** Notebook import semantic grouping from backend planner */
  import_group_id?: string;
  import_group_name?: string;
  /** Imported notebook stages get richer stage-card treatment in the canvas */
  importedStage?: boolean;
  placeholder?: boolean;
  importStageState?: NotebookImportStageState;
  stageOrder?: number;
  stagePurpose?: string;
  stageInputs?: string[];
  stageOutputs?: string[];
  stageNodeCount?: number;
  stageRole?: 'main' | 'branch';
};

export type AnalysisEdge = {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
};

export type PipelineCheckpoint = {
  id: string;
  name: string;
  timestamp: number;
  nodes: AnalysisNode[];
  edges: AnalysisEdge[];
};

export type AnalysisPipeline = {
  id: string;
  name: string;
  nodes: AnalysisNode[];
  edges: AnalysisEdge[];
  checkpoints?: PipelineCheckpoint[];
};

export type AnalysisComponent = {
  id: string;
  name: string;
  code: string;
};

export type AnalysisConfig = {
  scenarios: ScenarioDefinition[];
  defaults?: {
    baseline_scenario_id?: string;
    active_dashboard_id?: string;
    active_sensitivity_config_id?: string;
    active_optimisation_config_id?: string;
    active_pipeline_id?: string;
  };
  dashboards?: DashboardDefinition[];
  sensitivity_configs?: SensitivityConfig[];
  optimisation_configs?: OptimisationConfig[];
  pipelines?: AnalysisPipeline[];
  analysis_components?: AnalysisComponent[];
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

// ── Optimisation types ──

export type OptimisationMode = 'goal-seek' | 'multi-objective' | 'policy';

export type OptimisationParameterRange = {
  name: string;
  low: number;
  high: number;
  steps: number;
};

export type OptimisationObjective = {
  id: string;
  output: string;
  metric: 'final' | 'max' | 'min' | 'mean';
  direction: 'minimize' | 'maximize';
  weight: number;
  target_value?: number;
};

export type OptimisationConfig = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  mode: OptimisationMode;
  // Goal-seek fields
  output?: string;
  target_value?: number;
  metric?: 'final' | 'max' | 'min' | 'mean';
  // Multi-objective fields
  objectives?: OptimisationObjective[];
  // Common
  parameters: OptimisationParameterRange[];
  // Policy fields
  policy_output?: string;
  policy_metric?: 'final' | 'max' | 'min' | 'mean';
  policy_direction?: 'minimize' | 'maximize';
};

export type EvaluationPoint = {
  params: Record<string, number>;
  metricValue: number;
  objectiveValues?: Record<string, number>;
};

export type ParetoPoint = {
  params: Record<string, number>;
  objectiveValues: Record<string, number>;
  dominationRank: number;
};

export type PolicyRank = {
  scenarioId: string;
  scenarioName: string;
  metricValue: number;
  rank: number;
  series: Record<string, number[]>;
};

export type OptimisationResult = {
  configId: string;
  mode: OptimisationMode;
  // Goal-seek
  bestParams?: Record<string, number>;
  bestMetric?: number;
  targetValue?: number;
  gap?: number;
  baselineSeries?: Record<string, number[]>;
  optimisedSeries?: Record<string, number[]>;
  // Common
  evaluations?: EvaluationPoint[];
  totalEvaluations?: number;
  elapsedMs?: number;
  // Multi-objective
  paretoFrontier?: ParetoPoint[];
  // Policy
  policyRanking?: PolicyRank[];
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

export type RetryLogEntry = {
  round: number;
  errors: string[];
  action: string;
  model_used?: string;
};

export type AIChatComponentGroup = {
  type: string;
  names: string[];
};

export type AIChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  suggestions?: string[];
  retryLog?: RetryLogEntry[];
  debugRawResponse?: string;
  /** Grouped components created/modified by this AI response */
  components?: AIChatComponentGroup[];
};

export type NotebookImportStageState = 'queued' | 'building' | 'done' | 'needs_review';

export type NotebookImportStage = {
  id: string;
  name: string;
  purpose?: string;
  state: NotebookImportStageState;
};

export type NotebookImportProgress = {
  phase: string;
  message: string;
  complexityTier?: 'small' | 'medium' | 'large';
  stageCount?: number;
  currentStageId?: string | null;
  stages: NotebookImportStage[];
  warnings: string[];
  mainPathStageIds: string[];
  isReviewPass: boolean;
};

export type AIPatch = {
  node_name: string;
  field: string;
  value: string | number | boolean | null;
};

export type AIActionType =
  | 'update_sim_config'
  | 'create_scenario' | 'update_scenario' | 'delete_scenario'
  | 'create_sensitivity_config' | 'update_sensitivity_config' | 'delete_sensitivity_config'
  | 'create_dashboard' | 'update_dashboard' | 'delete_dashboard'
  | 'add_dashboard_card' | 'delete_dashboard_card'
  | 'update_default_style'
  | 'run_simulate' | 'run_validate' | 'run_scenario_batch' | 'run_sensitivity'
  | 'navigate';

export type AIAction = {
  type: AIActionType;
  params: Record<string, unknown>;
};

export type StreamChunk = {
  type: 'node' | 'edge' | 'action' | 'message' | 'clarification';
  data: Record<string, unknown>;
  status: 'pending' | 'valid' | 'warning' | 'error';
  errors: string[];
};

export type ChunkUpdate = {
  index: number;
  status: 'valid' | 'warning' | 'error';
  errors: string[];
};

export type AIExecuteResponse = {
  ok: boolean;
  model: ModelDocument | null;
  patches: AIPatch[];
  actions: AIAction[];
  warnings: ValidationIssue[];
  assistant_message: string;
  needs_clarification: boolean;
  suggestions: string[];
  retry_log: RetryLogEntry[];
  debug_raw_response?: string | null;
  chunks?: StreamChunk[];
};
