# Sensitivity Analysis Page — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a dedicated `/sensitivity` page with 3-panel layout for configuring, saving, and visualizing OAT and Monte Carlo sensitivity analyses.

**Architecture:** New `SensitivityConfig` type persisted in model metadata alongside scenarios/dashboards. Four new components (page + 3 panels) following the exact same pattern as the Scenario page. Four chart types using Recharts (tornado, fan, spider, scatter). Store CRUD actions mirror scenario pattern. No backend changes needed.

**Tech Stack:** React 18, TypeScript, Mantine v7, Recharts, Zustand

---

### Task 1: Add SensitivityConfig type and extend AnalysisConfig

**Files:**
- Modify: `frontend/src/types/model.ts:271-278` (AnalysisConfig type)

**Step 1: Add the SensitivityConfig type**

Add after `DashboardDefinition` (line 269) and before `AnalysisConfig` (line 271):

```typescript
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
```

**Step 2: Extend AnalysisConfig**

Update `AnalysisConfig` to include sensitivity configs:

```typescript
export type AnalysisConfig = {
  scenarios: ScenarioDefinition[];
  defaults?: {
    baseline_scenario_id?: string;
    active_dashboard_id?: string;
    active_sensitivity_config_id?: string;
  };
  dashboards?: DashboardDefinition[];
  sensitivity_configs?: SensitivityConfig[];
};
```

**Step 3: Verify type-check passes**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: PASS (no new errors beyond pre-existing ones)

**Step 4: Commit**

```bash
git add frontend/src/types/model.ts
git commit -m "feat: add SensitivityConfig type and extend AnalysisConfig"
```

---

### Task 2: Add sensitivity config state and CRUD actions to editorStore

**Files:**
- Modify: `frontend/src/state/editorStore.ts`

**Step 1: Add state fields to EditorState type**

After `activeDashboardId` (around line 84), add:

```typescript
sensitivityConfigs: SensitivityConfig[];
activeSensitivityConfigId: string;
```

Import `SensitivityConfig` from `'../types/model'` in the existing import statement.

**Step 2: Add action signatures to EditorState type**

After `setActiveDashboard` (around line 165), add:

```typescript
createSensitivityConfig: () => void;
duplicateSensitivityConfig: (id: string) => void;
updateSensitivityConfig: (id: string, patch: Partial<SensitivityConfig>) => void;
deleteSensitivityConfig: (id: string) => void;
setActiveSensitivityConfig: (id: string) => void;
runActiveSensitivity: () => Promise<void>;
```

**Step 3: Add defaultSensitivityConfigs function**

Add near `defaultScenarios` (around line 259):

```typescript
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
```

**Step 4: Extend persistAnalysis to include sensitivity configs**

Update `persistAnalysis` signature to accept sensitivity configs:

```typescript
function persistAnalysis(
  model: ModelDocument,
  scenarios: ScenarioDefinition[],
  activeScenarioId: string,
  dashboards: DashboardDefinition[],
  activeDashboardId: string | null,
  sensitivityConfigs?: SensitivityConfig[],
  activeSensitivityConfigId?: string,
): ModelDocument {
  return {
    ...model,
    metadata: {
      ...(model.metadata ?? {}),
      analysis: {
        scenarios,
        dashboards,
        sensitivity_configs: sensitivityConfigs,
        defaults: {
          baseline_scenario_id: activeScenarioId,
          active_dashboard_id: activeDashboardId ?? undefined,
          active_sensitivity_config_id: activeSensitivityConfigId ?? undefined,
        },
      },
    },
  };
}
```

**Step 5: Update all persistAnalysis call sites**

Every existing call to `persistAnalysis(model, scenarios, activeScenarioId, dashboards, activeDashboardId)` must be updated to also pass `state.sensitivityConfigs, state.activeSensitivityConfigId` as the 6th and 7th arguments. There are approximately 12-15 call sites in `createScenario`, `duplicateScenario`, `updateScenario`, `deleteScenario`, `setActiveScenario`, `createDashboard`, `updateDashboard`, `deleteDashboard`, `setActiveDashboard`, `addDashboardCard`, `updateDashboardCard`, `moveDashboardCard`, `deleteDashboardCard`. Each one needs to append `state.sensitivityConfigs, state.activeSensitivityConfigId`.

**Step 6: Update loadModel to hydrate sensitivity configs**

In `loadModel` (around line 1088), after the dashboard hydration, add sensitivity config hydration:

```typescript
const sensitivityDefaults = defaultSensitivityConfigs(cloned);
```

And pass these to `persistAnalysis` and `set()`:

```typescript
sensitivityConfigs: sensitivityDefaults.sensitivityConfigs,
activeSensitivityConfigId: sensitivityDefaults.activeSensitivityConfigId,
```

**Step 7: Add initial state values**

In the `create<EditorState>()` initial state, add:

```typescript
sensitivityConfigs: [],
activeSensitivityConfigId: '',
```

**Step 8: Implement CRUD actions**

Add after the dashboard actions, following the exact scenario CRUD pattern:

```typescript
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
        state.model,
        state.scenarios,
        state.activeScenarioId,
        state.dashboards,
        state.activeDashboardId,
        sensitivityConfigs,
        activeSensitivityConfigId,
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
        state.model,
        state.scenarios,
        state.activeScenarioId,
        state.dashboards,
        state.activeDashboardId,
        sensitivityConfigs,
        activeSensitivityConfigId,
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
        state.model,
        state.scenarios,
        state.activeScenarioId,
        state.dashboards,
        state.activeDashboardId,
        sensitivityConfigs,
        state.activeSensitivityConfigId,
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
        state.model,
        state.scenarios,
        state.activeScenarioId,
        state.dashboards,
        state.activeDashboardId,
        sensitivityConfigs,
        activeSensitivityConfigId,
      ),
    };
  });
},
setActiveSensitivityConfig: (id) => {
  set((state) => ({
    activeSensitivityConfigId: id,
    model: persistAnalysis(
      state.model,
      state.scenarios,
      state.activeScenarioId,
      state.dashboards,
      state.activeDashboardId,
      state.sensitivityConfigs,
      id,
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
```

**Step 9: Verify type-check passes**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: PASS

**Step 10: Run existing tests**

Run: `cd frontend && npx vitest run`
Expected: All existing tests pass (sensitivity config changes shouldn't break anything since they're additive)

**Step 11: Commit**

```bash
git add frontend/src/state/editorStore.ts
git commit -m "feat: add sensitivity config CRUD to editorStore"
```

---

### Task 3: Add routing and navigation for /sensitivity

**Files:**
- Modify: `frontend/src/state/editorStore.ts:45` (WorkbenchTab type)
- Modify: `frontend/src/App.tsx:7-11` (PATH_TO_TAB)
- Modify: `frontend/src/lib/navigation.ts:4-9` (TAB_MAP)
- Modify: `frontend/src/components/workbench/WorkbenchLayoutMantine.tsx`

**Step 1: Extend WorkbenchTab type**

In `editorStore.ts` line 45, change:

```typescript
export type WorkbenchTab = 'canvas' | 'formulas' | 'dashboard' | 'scenarios';
```

to:

```typescript
export type WorkbenchTab = 'canvas' | 'formulas' | 'dashboard' | 'scenarios' | 'sensitivity';
```

**Step 2: Add /sensitivity to PATH_TO_TAB in App.tsx**

```typescript
const PATH_TO_TAB: Record<string, WorkbenchTab> = {
  '/formulas': 'formulas',
  '/dashboard': 'dashboard',
  '/scenarios': 'scenarios',
  '/sensitivity': 'sensitivity',
};
```

**Step 3: Add /sensitivity to TAB_MAP in navigation.ts**

```typescript
const TAB_MAP: Record<string, WorkbenchTab> = {
  '/': 'canvas',
  '/formulas': 'formulas',
  '/dashboard': 'dashboard',
  '/scenarios': 'scenarios',
  '/sensitivity': 'sensitivity',
};
```

**Step 4: Add tab + page render in WorkbenchLayoutMantine.tsx**

Import the SensitivityPage (will be created in next task — use a placeholder for now):

```typescript
import { SensitivityPage } from '../sensitivity/SensitivityPage';
```

Add a Sensitivity tab after the Scenarios tab (around line 121):

```tsx
<Tabs.Tab value="sensitivity">Sensitivity</Tabs.Tab>
```

Add the page render after the scenarios render (around line 238):

```tsx
{activeTab === 'sensitivity' && <SensitivityPage />}
```

**Step 5: Create placeholder SensitivityPage component**

Create `frontend/src/components/sensitivity/SensitivityPage.tsx` with a minimal placeholder:

```typescript
import { Box, Title } from '@mantine/core';

export function SensitivityPage() {
  return (
    <Box p="md">
      <Title order={4}>Sensitivity Analysis</Title>
    </Box>
  );
}
```

**Step 6: Verify type-check passes**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: PASS

**Step 7: Commit**

```bash
git add frontend/src/state/editorStore.ts frontend/src/App.tsx frontend/src/lib/navigation.ts frontend/src/components/workbench/WorkbenchLayoutMantine.tsx frontend/src/components/sensitivity/SensitivityPage.tsx
git commit -m "feat: add /sensitivity route and navigation tab"
```

---

### Task 4: Build SensitivityListPanel

**Files:**
- Create: `frontend/src/components/sensitivity/SensitivityListPanel.tsx`

**Step 1: Create the component**

This mirrors `ScenarioListPanel` exactly. Create `frontend/src/components/sensitivity/SensitivityListPanel.tsx`:

```typescript
import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  ColorSwatch,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconCopy, IconPlus, IconTrash } from '@tabler/icons-react';
import type { SensitivityConfig } from '../../types/model';

type SensitivityListPanelProps = {
  configs: SensitivityConfig[];
  activeConfigId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

export function SensitivityListPanel({
  configs,
  activeConfigId,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
}: SensitivityListPanelProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <Stack gap="sm" p="sm">
      <Group justify="space-between">
        <Text fw={600} size="sm">Analyses</Text>
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconPlus size={14} />}
          onClick={onCreate}
        >
          New
        </Button>
      </Group>

      <ScrollArea style={{ flex: 1 }}>
        <Stack gap={6}>
          {configs.map((config) => {
            const isActive = config.id === activeConfigId;
            const isConfirming = confirmDeleteId === config.id;

            return (
              <Paper
                key={config.id}
                p="xs"
                style={{
                  borderLeft: isActive
                    ? '3px solid var(--mantine-color-blue-5)'
                    : '3px solid transparent',
                  background: isActive
                    ? 'var(--mantine-color-blue-0)'
                    : undefined,
                  cursor: 'pointer',
                }}
                onClick={() => onSelect(config.id)}
              >
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                    <ColorSwatch
                      color={config.color ?? '#888'}
                      size={14}
                      style={{ flexShrink: 0 }}
                    />
                    <Box style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate>
                        {config.name}
                      </Text>
                      <Group gap={4}>
                        <Badge
                          size="xs"
                          color={config.type === 'oat' ? 'teal' : 'violet'}
                        >
                          {config.type === 'oat' ? 'OAT' : 'Monte Carlo'}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {config.parameters.length} param{config.parameters.length !== 1 ? 's' : ''}
                        </Text>
                      </Group>
                    </Box>
                  </Group>

                  {isConfirming ? (
                    <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                      <Text size="xs" c="red" fw={500}>Delete?</Text>
                      <Button
                        size="compact-xs"
                        color="red"
                        variant="filled"
                        onClick={() => {
                          onDelete(config.id);
                          setConfirmDeleteId(null);
                        }}
                      >
                        Yes
                      </Button>
                      <Button
                        size="compact-xs"
                        variant="default"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        No
                      </Button>
                    </Group>
                  ) : (
                    <Group gap={2} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                      <Tooltip label="Duplicate">
                        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => onDuplicate(config.id)}>
                          <IconCopy size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete">
                        <ActionIcon size="sm" variant="subtle" color="red" onClick={() => setConfirmDeleteId(config.id)}>
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
                    </Group>
                  )}
                </Group>
              </Paper>
            );
          })}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
```

**Step 2: Verify type-check passes**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/components/sensitivity/SensitivityListPanel.tsx
git commit -m "feat: add SensitivityListPanel component"
```

---

### Task 5: Build SensitivityEditorPanel

**Files:**
- Create: `frontend/src/components/sensitivity/SensitivityEditorPanel.tsx`

**Step 1: Create the component**

Create `frontend/src/components/sensitivity/SensitivityEditorPanel.tsx`:

```typescript
import { useMemo } from 'react';
import {
  ActionIcon,
  ColorInput,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { ModelDocument, SensitivityConfig, SensitivityParameterRange, StockNode } from '../../types/model';

type SensitivityEditorPanelProps = {
  config: SensitivityConfig;
  model: ModelDocument;
  onUpdate: (patch: Partial<SensitivityConfig>) => void;
};

function nodeGroupLabel(type: string): string {
  switch (type) {
    case 'stock': return 'Stocks';
    case 'flow': return 'Flows';
    case 'aux': return 'Auxiliaries';
    case 'lookup': return 'Lookups';
    default: return 'Other';
  }
}

export function SensitivityEditorPanel({ config, model, onUpdate }: SensitivityEditorPanelProps) {
  const variableOptions = useMemo(() => {
    return model.nodes
      .filter(
        (n) =>
          n.type !== 'text' &&
          n.type !== 'cloud' &&
          n.type !== 'cld_symbol' &&
          n.type !== 'phantom',
      )
      .map((n) => ({
        value: n.name,
        label: `${n.label} (${n.name})`,
        group: nodeGroupLabel(n.type),
      }));
  }, [model.nodes]);

  const outputOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const n of model.nodes) {
      if (n.type === 'text' || n.type === 'cloud' || n.type === 'cld_symbol' || n.type === 'phantom') continue;
      unique.add(n.name);
    }
    for (const o of model.outputs) {
      unique.add(o);
    }
    return [...unique].map((v) => ({ value: v, label: v }));
  }, [model.nodes, model.outputs]);

  const parameterNames = new Set(config.parameters.map((p) => p.name));
  const addParamOptions = variableOptions
    .filter((o) => !parameterNames.has(o.value))
    .map((o) => ({ value: o.value, label: o.label, group: o.group }));

  // Build grouped data for Select
  const addParamSelectData = (() => {
    const groups: Record<string, Array<{ value: string; label: string }>> = {};
    for (const opt of addParamOptions) {
      if (!groups[opt.group]) groups[opt.group] = [];
      groups[opt.group].push({ value: opt.value, label: opt.label });
    }
    return Object.entries(groups).map(([group, items]) => ({ group, items }));
  })();

  const handleAddParam = (name: string) => {
    // Find the node to get a reasonable default range
    const node = model.nodes.find((n) => n.name === name);
    let baseValue = 0;
    if (node && node.type === 'stock') {
      baseValue = (node as StockNode).initial_value ?? 0;
    } else if (node && 'equation' in node) {
      const parsed = Number((node as { equation: string }).equation);
      if (Number.isFinite(parsed)) baseValue = parsed;
    }
    const low = baseValue * 0.5;
    const high = baseValue === 0 ? 1 : baseValue * 1.5;
    const newParam: SensitivityParameterRange = { name, low, high, steps: 5 };
    onUpdate({ parameters: [...config.parameters, newParam] });
  };

  const handleUpdateParam = (index: number, patch: Partial<SensitivityParameterRange>) => {
    const updated = config.parameters.map((p, i) =>
      i === index ? { ...p, ...patch } : p,
    );
    onUpdate({ parameters: updated });
  };

  const handleRemoveParam = (index: number) => {
    onUpdate({ parameters: config.parameters.filter((_, i) => i !== index) });
  };

  return (
    <Stack gap="md">
      <Title order={5}>{config.name}</Title>

      <Group grow align="flex-end">
        <TextInput
          label="Name"
          size="sm"
          value={config.name}
          onChange={(e) => onUpdate({ name: e.currentTarget.value })}
        />
        <ColorInput
          label="Color"
          size="sm"
          value={config.color ?? '#1b6ca8'}
          onChange={(value) => onUpdate({ color: value })}
          format="hex"
          swatches={['#1b6ca8', '#d46a00', '#2f7d32', '#8a2be2', '#d32f2f', '#00838f']}
        />
      </Group>

      <TextInput
        label="Description"
        size="sm"
        value={config.description ?? ''}
        onChange={(e) => onUpdate({ description: e.currentTarget.value || undefined })}
        placeholder="Optional description..."
      />

      <Group grow align="flex-end">
        <Select
          label="Output Variable"
          size="sm"
          value={config.output}
          onChange={(value) => value && onUpdate({ output: value })}
          data={outputOptions}
          searchable
        />
        <Select
          label="Metric"
          size="sm"
          value={config.metric}
          onChange={(value) =>
            value && onUpdate({ metric: value as SensitivityConfig['metric'] })
          }
          data={[
            { value: 'final', label: 'Final value' },
            { value: 'max', label: 'Maximum' },
            { value: 'min', label: 'Minimum' },
            { value: 'mean', label: 'Mean' },
          ]}
        />
      </Group>

      <div>
        <Text fw={500} size="sm" mb={4}>Analysis Type</Text>
        <SegmentedControl
          size="sm"
          value={config.type}
          onChange={(value) => onUpdate({ type: value as 'oat' | 'monte-carlo' })}
          data={[
            { label: 'OAT (Tornado)', value: 'oat' },
            { label: 'Monte Carlo', value: 'monte-carlo' },
          ]}
        />
      </div>

      {config.type === 'monte-carlo' && (
        <Group grow>
          <NumberInput
            label="Runs"
            size="sm"
            value={config.runs ?? 100}
            min={2}
            onChange={(v) => onUpdate({ runs: Math.max(2, Number(v) || 100) })}
          />
          <NumberInput
            label="Seed"
            size="sm"
            value={config.seed ?? 42}
            onChange={(v) => onUpdate({ seed: Number(v) || 42 })}
          />
        </Group>
      )}

      <Stack gap="xs">
        <Text fw={600} size="sm">Parameters</Text>

        {config.parameters.length > 0 && (
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Variable</Table.Th>
                <Table.Th w={90}>Low</Table.Th>
                <Table.Th w={90}>High</Table.Th>
                <Table.Th w={70}>Steps</Table.Th>
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {config.parameters.map((param, index) => (
                <Table.Tr key={param.name}>
                  <Table.Td>
                    <Text size="sm" fw={500}>{param.name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      value={param.low}
                      onChange={(v) => handleUpdateParam(index, { low: Number(v) || 0 })}
                      style={{ maxWidth: 90 }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      value={param.high}
                      onChange={(v) => handleUpdateParam(index, { high: Number(v) || 0 })}
                      style={{ maxWidth: 90 }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      value={param.steps}
                      min={2}
                      onChange={(v) => handleUpdateParam(index, { steps: Math.max(2, Number(v) || 5) })}
                      style={{ maxWidth: 70 }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      onClick={() => handleRemoveParam(index)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        {config.parameters.length === 0 && (
          <Text size="sm" c="dimmed">No parameters added yet.</Text>
        )}

        <Select
          placeholder="Add parameter..."
          searchable
          data={addParamSelectData}
          onChange={(value) => value && handleAddParam(value)}
          value={null}
          clearable
          size="xs"
          nothingFoundMessage="No variables available"
        />
      </Stack>
    </Stack>
  );
}
```

**Step 2: Verify type-check passes**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/components/sensitivity/SensitivityEditorPanel.tsx
git commit -m "feat: add SensitivityEditorPanel component"
```

---

### Task 6: Build SensitivityResultsPanel with all 4 chart types

**Files:**
- Create: `frontend/src/components/sensitivity/SensitivityResultsPanel.tsx`

**Step 1: Create the component**

Create `frontend/src/components/sensitivity/SensitivityResultsPanel.tsx`:

```typescript
import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Group,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  MonteCarloResponse,
  OATSensitivityResponse,
  SensitivityConfig,
} from '../../types/model';

type SensitivityResultsPanelProps = {
  config: SensitivityConfig | undefined;
  oatResults: OATSensitivityResponse | null;
  monteCarloResults: MonteCarloResponse | null;
  isRunning: boolean;
};

const COLORS = ['#1b6ca8', '#d46a00', '#2f7d32', '#8a2be2', '#d32f2f', '#00838f', '#f57c00', '#388e3c'];

function TornadoChart({ oatResults }: { oatResults: OATSensitivityResponse }) {
  const data = useMemo(() => {
    return oatResults.items
      .slice()
      .sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing))
      .map((item) => ({
        parameter: item.parameter,
        low: item.min_metric - oatResults.baseline_metric,
        high: item.max_metric - oatResults.baseline_metric,
        swing: item.swing,
        normalized: item.normalized_swing,
      }));
  }, [oatResults]);

  if (data.length === 0) {
    return <Text size="sm" c="dimmed">No OAT results to display.</Text>;
  }

  return (
    <Stack gap="xs">
      <Box h={Math.max(200, data.length * 40 + 60)}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20, top: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="parameter" tick={{ fontSize: 11 }} width={80} />
            <Tooltip formatter={(value: number) => value.toFixed(4)} />
            <Bar dataKey="low" fill="#d32f2f" name="Low impact" stackId="stack" />
            <Bar dataKey="high" fill="#2f7d32" name="High impact" stackId="stack" />
          </BarChart>
        </ResponsiveContainer>
      </Box>
      <Table striped withTableBorder size="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Parameter</Table.Th>
            <Table.Th>Swing</Table.Th>
            <Table.Th>Normalized</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.map((item) => (
            <Table.Tr key={item.parameter}>
              <Table.Td>{item.parameter}</Table.Td>
              <Table.Td>{item.swing.toFixed(4)}</Table.Td>
              <Table.Td>{(item.normalized * 100).toFixed(1)}%</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function SpiderPlot({ oatResults }: { oatResults: OATSensitivityResponse }) {
  // Build normalized data: X = normalized parameter value (0-1), Y = metric value
  const chartData = useMemo(() => {
    if (oatResults.items.length === 0) return [];
    // Find all unique normalized x values across all parameters
    const steps = oatResults.items[0]?.points.length ?? 0;
    return Array.from({ length: steps }).map((_, i) => {
      const row: Record<string, number> = { x: steps > 1 ? i / (steps - 1) : 0 };
      for (const item of oatResults.items) {
        row[item.parameter] = item.points[i]?.metric_value ?? 0;
      }
      return row;
    });
  }, [oatResults]);

  if (chartData.length === 0) {
    return <Text size="sm" c="dimmed">No data for spider plot.</Text>;
  }

  return (
    <Box h={300}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            tick={{ fontSize: 10 }}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            label={{ value: 'Parameter range (normalized)', position: 'bottom', fontSize: 11 }}
          />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(value: number) => value.toFixed(4)} />
          <Legend />
          {oatResults.items.map((item, i) => (
            <Line
              key={item.parameter}
              type="monotone"
              dataKey={item.parameter}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={true}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

function FanChart({ monteCarloResults }: { monteCarloResults: MonteCarloResponse }) {
  const { quantiles } = monteCarloResults;

  const data = [
    {
      label: 'Result',
      p05: quantiles.p05,
      p25_band: quantiles.p25 - quantiles.p05,
      p50_band: quantiles.p50 - quantiles.p25,
      p75_band: quantiles.p75 - quantiles.p50,
      p95_band: quantiles.p95 - quantiles.p75,
      median: quantiles.p50,
      mean: quantiles.mean,
    },
  ];

  return (
    <Stack gap="xs">
      <Box h={200}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 60, right: 20, top: 10, bottom: 10 }}>
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={60} />
            <Tooltip formatter={(value: number) => value.toFixed(4)} />
            <Bar dataKey="p05" stackId="fan" fill="transparent" />
            <Bar dataKey="p25_band" stackId="fan" fill="#bbdefb" name="p05-p25" />
            <Bar dataKey="p50_band" stackId="fan" fill="#64b5f6" name="p25-p50" />
            <Bar dataKey="p75_band" stackId="fan" fill="#64b5f6" name="p50-p75" />
            <Bar dataKey="p95_band" stackId="fan" fill="#bbdefb" name="p75-p95" />
          </BarChart>
        </ResponsiveContainer>
      </Box>
      <Table striped withTableBorder size="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Statistic</Table.Th>
            <Table.Th>Value</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {[
            ['p05', quantiles.p05],
            ['p25', quantiles.p25],
            ['Median (p50)', quantiles.p50],
            ['p75', quantiles.p75],
            ['p95', quantiles.p95],
            ['Mean', quantiles.mean],
            ['Std Dev', quantiles.stddev],
            ['Min', quantiles.min],
            ['Max', quantiles.max],
          ].map(([label, value]) => (
            <Table.Tr key={label as string}>
              <Table.Td>{label}</Table.Td>
              <Table.Td>{(value as number).toFixed(4)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function ScatterPlot({ monteCarloResults }: { monteCarloResults: MonteCarloResponse }) {
  const paramNames = useMemo(() => {
    if (monteCarloResults.samples.length === 0) return [];
    return Object.keys(monteCarloResults.samples[0].params);
  }, [monteCarloResults.samples]);

  const [selectedParam, setSelectedParam] = useState<string>(paramNames[0] ?? '');

  const data = useMemo(() => {
    if (!selectedParam) return [];
    return monteCarloResults.samples.map((s) => ({
      paramValue: s.params[selectedParam] ?? 0,
      metricValue: s.metric_value,
    }));
  }, [monteCarloResults.samples, selectedParam]);

  if (paramNames.length === 0) {
    return <Text size="sm" c="dimmed">No Monte Carlo samples to display.</Text>;
  }

  return (
    <Stack gap="xs">
      {paramNames.length > 1 && (
        <Select
          label="Color by parameter"
          size="xs"
          value={selectedParam}
          onChange={(v) => v && setSelectedParam(v)}
          data={paramNames.map((n) => ({ value: n, label: n }))}
          w={200}
        />
      )}
      <Box h={300}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ left: 20, right: 20, top: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="paramValue"
              name={selectedParam}
              tick={{ fontSize: 10 }}
              label={{ value: selectedParam, position: 'bottom', fontSize: 11 }}
              type="number"
            />
            <YAxis
              dataKey="metricValue"
              name={monteCarloResults.metric}
              tick={{ fontSize: 10 }}
              type="number"
            />
            <Tooltip
              formatter={(value: number) => value.toFixed(4)}
              cursor={{ strokeDasharray: '3 3' }}
            />
            <Scatter data={data} fill="#1b6ca8" fillOpacity={0.5} r={3} />
          </ScatterChart>
        </ResponsiveContainer>
      </Box>
    </Stack>
  );
}

export function SensitivityResultsPanel({
  config,
  oatResults,
  monteCarloResults,
  isRunning,
}: SensitivityResultsPanelProps) {
  const isOat = config?.type === 'oat';
  const tabs = isOat
    ? [
        { label: 'Tornado', value: 'tornado' },
        { label: 'Spider', value: 'spider' },
      ]
    : [
        { label: 'Fan Chart', value: 'fan' },
        { label: 'Scatter', value: 'scatter' },
      ];

  const [view, setView] = useState<string>(tabs[0].value);

  // Reset view when switching between OAT and MC
  const effectiveView = tabs.some((t) => t.value === view) ? view : tabs[0].value;

  const hasResults = isOat ? oatResults !== null : monteCarloResults !== null;

  return (
    <Stack gap="sm" p="sm" style={{ height: '100%' }}>
      <Text fw={600} size="sm">Results</Text>

      <SegmentedControl
        size="xs"
        value={effectiveView}
        onChange={setView}
        data={tabs}
      />

      {!hasResults && !isRunning && (
        <Alert color="violet" variant="light">
          Click "Run Analysis" to see results.
        </Alert>
      )}

      {isRunning && (
        <Alert color="blue" variant="light">
          Running analysis...
        </Alert>
      )}

      {/* OAT views */}
      {isOat && oatResults && effectiveView === 'tornado' && (
        <TornadoChart oatResults={oatResults} />
      )}
      {isOat && oatResults && effectiveView === 'spider' && (
        <SpiderPlot oatResults={oatResults} />
      )}

      {/* MC views */}
      {!isOat && monteCarloResults && effectiveView === 'fan' && (
        <FanChart monteCarloResults={monteCarloResults} />
      )}
      {!isOat && monteCarloResults && effectiveView === 'scatter' && (
        <ScatterPlot monteCarloResults={monteCarloResults} />
      )}
    </Stack>
  );
}
```

**Step 2: Verify type-check passes**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: PASS

**Step 3: Commit**

```bash
git add frontend/src/components/sensitivity/SensitivityResultsPanel.tsx
git commit -m "feat: add SensitivityResultsPanel with tornado, fan, spider, scatter charts"
```

---

### Task 7: Wire up SensitivityPage with all 3 panels

**Files:**
- Modify: `frontend/src/components/sensitivity/SensitivityPage.tsx`

**Step 1: Replace placeholder with full implementation**

Replace the contents of `SensitivityPage.tsx`:

```typescript
import { useMemo } from 'react';
import { Alert, Box, Button, Group, Title } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import { SensitivityListPanel } from './SensitivityListPanel';
import { SensitivityEditorPanel } from './SensitivityEditorPanel';
import { SensitivityResultsPanel } from './SensitivityResultsPanel';

export function SensitivityPage() {
  const model = useEditorStore((s) => s.model);
  const sensitivityConfigs = useEditorStore((s) => s.sensitivityConfigs);
  const activeSensitivityConfigId = useEditorStore((s) => s.activeSensitivityConfigId);
  const setActiveSensitivityConfig = useEditorStore((s) => s.setActiveSensitivityConfig);
  const createSensitivityConfig = useEditorStore((s) => s.createSensitivityConfig);
  const duplicateSensitivityConfig = useEditorStore((s) => s.duplicateSensitivityConfig);
  const updateSensitivityConfig = useEditorStore((s) => s.updateSensitivityConfig);
  const deleteSensitivityConfig = useEditorStore((s) => s.deleteSensitivityConfig);
  const runActiveSensitivity = useEditorStore((s) => s.runActiveSensitivity);
  const isRunningSensitivity = useEditorStore((s) => s.isRunningSensitivity);
  const oatResults = useEditorStore((s) => s.oatResults);
  const monteCarloResults = useEditorStore((s) => s.monteCarloResults);

  const activeConfig = useMemo(
    () => sensitivityConfigs.find((c) => c.id === activeSensitivityConfigId) ?? sensitivityConfigs[0],
    [sensitivityConfigs, activeSensitivityConfigId],
  );

  const handleUpdate = useMemo(
    () => (patch: Parameters<typeof updateSensitivityConfig>[1]) => {
      if (activeConfig) updateSensitivityConfig(activeConfig.id, patch);
    },
    [activeConfig, updateSensitivityConfig],
  );

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Sticky header */}
      <Group
        justify="space-between"
        px="md"
        py="xs"
        style={{
          borderBottom: '1px solid var(--mantine-color-gray-3)',
          flexShrink: 0,
        }}
      >
        <Title order={4}>Sensitivity Analysis</Title>
        <Button
          leftSection={<IconPlayerPlay size={16} />}
          onClick={() => void runActiveSensitivity()}
          loading={isRunningSensitivity}
          disabled={!activeConfig || activeConfig.parameters.length === 0}
        >
          Run Analysis
        </Button>
      </Group>

      {/* 3-panel body */}
      <Box style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left sidebar */}
        <Box
          style={{
            width: 260,
            flexShrink: 0,
            borderRight: '1px solid var(--mantine-color-gray-3)',
            overflow: 'auto',
          }}
        >
          <SensitivityListPanel
            configs={sensitivityConfigs}
            activeConfigId={activeSensitivityConfigId}
            onSelect={setActiveSensitivityConfig}
            onCreate={createSensitivityConfig}
            onDuplicate={duplicateSensitivityConfig}
            onDelete={deleteSensitivityConfig}
          />
        </Box>

        {/* Center editor */}
        <Box
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'auto',
            padding: 16,
          }}
        >
          {activeConfig ? (
            <SensitivityEditorPanel
              config={activeConfig}
              model={model}
              onUpdate={handleUpdate}
            />
          ) : (
            <Alert color="blue" variant="light">
              Create an analysis configuration to get started.
            </Alert>
          )}
        </Box>

        {/* Right results */}
        <Box
          style={{
            width: 420,
            flexShrink: 0,
            borderLeft: '1px solid var(--mantine-color-gray-3)',
            overflow: 'auto',
          }}
        >
          <SensitivityResultsPanel
            config={activeConfig}
            oatResults={oatResults}
            monteCarloResults={monteCarloResults}
            isRunning={isRunningSensitivity}
          />
        </Box>
      </Box>
    </Box>
  );
}
```

**Step 2: Verify type-check passes**

Run: `cd frontend && npx tsc -b --noEmit`
Expected: PASS

**Step 3: Run all frontend tests**

Run: `cd frontend && npx vitest run`
Expected: All existing tests pass

**Step 4: Commit**

```bash
git add frontend/src/components/sensitivity/SensitivityPage.tsx
git commit -m "feat: wire up SensitivityPage with 3-panel layout"
```

---

### Task 8: Manual smoke test and final verification

**Step 1: Start the dev server**

Run: `make dev`

**Step 2: Manual verification checklist**

- [ ] Navigate to the Sensitivity tab in the header
- [ ] Click "New" to create a sensitivity config
- [ ] Verify it appears in the left list panel with type badge
- [ ] Edit the name, color, output variable, metric
- [ ] Toggle between OAT and Monte Carlo type
- [ ] Add parameters via the dropdown, verify low/high/steps editable
- [ ] Remove a parameter with the delete button
- [ ] Run an OAT analysis — verify tornado chart + spider plot render
- [ ] Switch to Monte Carlo — verify fan chart + scatter plot render
- [ ] Duplicate a config — verify copy appears
- [ ] Delete a config — verify delete confirmation works
- [ ] Reload the page — verify configs persist (saved in model metadata)

**Step 3: Run full test suite**

Run: `make test-frontend`
Expected: All tests pass

**Step 4: Commit any fixes needed**

If any issues found during smoke testing, fix and commit.
