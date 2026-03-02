# Sensitivity Analysis Page — Design

## Context

The workbench already has OAT (tornado) and Monte Carlo sensitivity backends (`/api/models/sensitivity/oat`, `/api/models/sensitivity/monte-carlo`), frontend types, and store actions. The current UI is a minimal panel inside the results dock. This design promotes sensitivity analysis to a full dedicated page with saved configurations and rich visualizations.

## Data Model

```typescript
type SensitivityConfig = {
  id: string;
  name: string;
  description?: string;
  color?: string;
  type: 'oat' | 'monte-carlo';
  output: string;                          // variable to analyze
  metric: 'final' | 'max' | 'min' | 'mean';
  parameters: SensitivityParameterRange[]; // {name, low, high, steps}
  runs?: number;                           // MC only, default 100
  seed?: number;                           // MC only, default 42
};
```

Persisted in `model.metadata.analysis.sensitivity_configs: SensitivityConfig[]`. Results are ephemeral (re-run to view).

## Page Layout

3-panel layout mirroring the Scenario page:

```
┌──────────────────────────────────────────────────────────────┐
│ ← Back to Model          Sensitivity Analysis      [Run ▶]  │
├────────────┬───────────────────┬─────────────────────────────┤
│ Config     │ Config Editor     │ Results (tabbed)            │
│ List       │                   │                             │
│ (260px)    │ - Output select   │ Tornado | Fan | Spider |    │
│            │ - Metric select   │ Scatter                     │
│ [+ New]    │ - Type (OAT/MC)  │                             │
│            │ - MC: runs/seed   │ Chart area + summary stats  │
│ Cards with │ - Parameter table │                             │
│ type badge │   (name,lo,hi,st) │                             │
│            │   [+ Add param]   │                             │
└────────────┴───────────────────┴─────────────────────────────┘
```

## Components

| Component | Description |
|---|---|
| `SensitivityPage` | Full-page wrapper, AppShell with sticky header |
| `SensitivityListPanel` | Left sidebar — list of saved configs with name, type badge, color, duplicate/delete |
| `SensitivityEditorPanel` | Center — output/metric selects, type toggle, parameter range table, MC settings |
| `SensitivityResultsPanel` | Right sidebar — tabbed chart views + summary stats |

## Visualizations

| Chart | Analysis Type | Description |
|---|---|---|
| Tornado | OAT | Horizontal bar chart — parameter swing sorted by impact |
| Fan chart | Monte Carlo | Area chart with confidence bands (p05–p95, p25–p75, median) |
| Spider plot | OAT | Line chart — one line per parameter, X = normalized value, Y = output metric |
| Scatter plot | Monte Carlo | Individual MC runs — metric value vs parameter value |

Tabs are conditionally shown based on config type (OAT tabs for OAT configs, MC tabs for MC configs).

## Navigation & Routing

- Add `/sensitivity` to `PATH_TO_TAB` in `App.tsx`
- Add `'sensitivity'` to `WorkbenchTab` type
- Add nav link in `WorkbenchLayoutMantine.tsx` between Scenarios and Dashboard
- Page follows same AppShell pattern with "Back to Model" button

## State Management

EditorStore additions:
- `sensitivityConfigs: SensitivityConfig[]`
- `activeSensitivityConfigId: string`
- CRUD actions: `createSensitivityConfig`, `duplicateSensitivityConfig`, `updateSensitivityConfig`, `deleteSensitivityConfig`
- `setActiveSensitivityConfig(id)`
- `runActiveSensitivity()` — dispatches to existing `runOATSensitivity` or `runMonteCarlo`

Existing `oatResults`, `monteCarloResults`, `isRunningSensitivity` state reused as-is. Configs persisted via `persistAnalysis()` alongside scenarios.

## Out of Scope

- No new backend endpoints or schemas
- No distribution picker (uniform only for MC)
- No export/download of results
- Existing results dock sensitivity panel remains unchanged
