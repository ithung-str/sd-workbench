# UI Overhaul Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Overhaul the workbench layout to a Retool-inspired design: dark icon strip + flyout panels on the left, 3-mode right sidebar, slim bottom nav bar, simplified header, canvas toolbar at bottom.

**Architecture:** Replace the Mantine AppShell-based layout. The left sidebar becomes a fixed 44px icon strip (always visible) with a 240px flyout overlay. The header shrinks to 48px (logo + picker + menu, no tabs). Tabs move to a 32px bottom navigation bar. The right sidebar gains a third mode (Simulation) absorbing the results dock functionality. The canvas toolbar moves from top-center to bottom-center.

**Tech Stack:** React 18, Mantine v7, Zustand, Tabler Icons, Recharts, TypeScript.

**Design doc:** `docs/plans/2026-03-03-ui-overhaul-design.md`

---

### Task 1: Add UI state for icon strip flyout

**Files:**
- Modify: `frontend/src/state/uiStore.ts`
- Modify: `frontend/src/state/editorStore.ts`

**Step 1: Add flyout state to uiStore**

Add a new type and state field for which flyout panel is open:

```typescript
// Add after existing types at top of file
export type FlyoutPanel = 'components' | 'outline' | 'variables' | 'settings' | 'search' | null;
```

Add to the UIState interface:
```typescript
activeFlyout: FlyoutPanel;
```

Add to initial state:
```typescript
activeFlyout: null,
```

Add action:
```typescript
setActiveFlyout: (panel: FlyoutPanel) => void;
toggleFlyout: (panel: FlyoutPanel) => void;
```

Implement:
```typescript
setActiveFlyout: (panel) => set({ activeFlyout: panel }),
toggleFlyout: (panel) => set((s) => ({ activeFlyout: s.activeFlyout === panel ? null : panel })),
```

**Step 2: Add 'simulation' to RightSidebarMode**

In `editorStore.ts`, update the type:
```typescript
export type RightSidebarMode = 'inspector' | 'chat' | 'simulation';
```

**Step 3: Verify compilation**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | head -20`

**Step 4: Commit**

```bash
git add frontend/src/state/uiStore.ts frontend/src/state/editorStore.ts
git commit -m "feat: add flyout panel and simulation sidebar state"
```

---

### Task 2: Create the left icon strip component

**Files:**
- Create: `frontend/src/components/workbench/IconStrip.tsx`
- Create: `frontend/src/styles/icon-strip.css`

**Step 1: Create the icon strip component**

A narrow (44px) vertical bar with a dark background. Each icon toggles a flyout panel.

```typescript
// frontend/src/components/workbench/IconStrip.tsx
import { ActionIcon, Stack, Tooltip } from '@mantine/core';
import {
  IconPlus,
  IconListDetails,
  IconVariable,
  IconSettings,
  IconSearch,
} from '@tabler/icons-react';
import { useUIStore, type FlyoutPanel } from '../../state/uiStore';
import './../../styles/icon-strip.css';

const ICONS: Array<{ panel: FlyoutPanel; icon: typeof IconPlus; label: string }> = [
  { panel: 'components', icon: IconPlus, label: 'Components' },
  { panel: 'outline', icon: IconListDetails, label: 'Model Outline' },
  { panel: 'variables', icon: IconVariable, label: 'Global Variables' },
  { panel: 'settings', icon: IconSettings, label: 'Settings' },
  { panel: 'search', icon: IconSearch, label: 'Search' },
];

export function IconStrip() {
  const activeFlyout = useUIStore((s) => s.activeFlyout);
  const toggleFlyout = useUIStore((s) => s.toggleFlyout);

  return (
    <div className="icon-strip">
      <Stack gap={2} align="center" py={8}>
        {ICONS.map(({ panel, icon: Icon, label }) => (
          <Tooltip key={panel} label={label} position="right" withArrow>
            <ActionIcon
              size="lg"
              variant="subtle"
              className={`icon-strip-btn ${activeFlyout === panel ? 'icon-strip-btn-active' : ''}`}
              onClick={() => toggleFlyout(panel)}
              aria-label={label}
            >
              <Icon size={20} />
            </ActionIcon>
          </Tooltip>
        ))}
      </Stack>
    </div>
  );
}
```

**Step 2: Create CSS**

```css
/* frontend/src/styles/icon-strip.css */
.icon-strip {
  width: 44px;
  height: 100%;
  background: #1a1a2e;
  border-right: 1px solid #2a2a40;
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 10;
}

.icon-strip-btn {
  color: #9ca3af;
  border-radius: 8px;
}

.icon-strip-btn:hover {
  color: #e5e7eb;
  background: rgba(255, 255, 255, 0.08);
}

.icon-strip-btn-active {
  color: #ffffff;
  background: rgba(255, 255, 255, 0.12);
}

.icon-strip-btn-active::before {
  content: '';
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 20px;
  background: #7c5cbf;
  border-radius: 0 2px 2px 0;
}
```

**Step 3: Verify compilation**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -i iconstrip`

**Step 4: Commit**

```bash
git add frontend/src/components/workbench/IconStrip.tsx frontend/src/styles/icon-strip.css
git commit -m "feat: create left icon strip component"
```

---

### Task 3: Create flyout panel container and content panels

**Files:**
- Create: `frontend/src/components/workbench/FlyoutPanel.tsx`
- Create: `frontend/src/styles/flyout-panel.css`

**Step 1: Create the flyout panel container**

The flyout is a 240px wide panel that overlays the canvas. It appears when a flyout is active and renders the appropriate content panel.

```typescript
// frontend/src/components/workbench/FlyoutPanel.tsx
import { ScrollArea, Text, ActionIcon, Group } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useUIStore, type FlyoutPanel as FlyoutPanelType } from '../../state/uiStore';
import { ComponentsPalette } from './flyouts/ComponentsPalette';
import { ModelOutline } from './flyouts/ModelOutline';
import { GlobalVariables } from './flyouts/GlobalVariables';
import { SettingsPanel } from './flyouts/SettingsPanel';
import { SearchPanel } from './flyouts/SearchPanel';
import '../../styles/flyout-panel.css';

const PANEL_TITLES: Record<NonNullable<FlyoutPanelType>, string> = {
  components: 'Components',
  outline: 'Model Outline',
  variables: 'Global Variables',
  settings: 'Settings',
  search: 'Search',
};

export function FlyoutPanel() {
  const activeFlyout = useUIStore((s) => s.activeFlyout);
  const setActiveFlyout = useUIStore((s) => s.setActiveFlyout);

  if (!activeFlyout) return null;

  return (
    <div className="flyout-panel">
      <div className="flyout-panel-header">
        <Text size="sm" fw={600}>{PANEL_TITLES[activeFlyout]}</Text>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setActiveFlyout(null)}>
          <IconX size={14} />
        </ActionIcon>
      </div>
      <ScrollArea className="flyout-panel-scroll">
        <div className="flyout-panel-body">
          {activeFlyout === 'components' && <ComponentsPalette />}
          {activeFlyout === 'outline' && <ModelOutline />}
          {activeFlyout === 'variables' && <GlobalVariables />}
          {activeFlyout === 'settings' && <SettingsPanel />}
          {activeFlyout === 'search' && <SearchPanel />}
        </div>
      </ScrollArea>
    </div>
  );
}
```

**Step 2: Create flyout CSS**

```css
/* frontend/src/styles/flyout-panel.css */
.flyout-panel {
  width: 240px;
  height: 100%;
  background: #ffffff;
  border-right: 1px solid #e7e7ee;
  box-shadow: 2px 0 8px rgba(0, 0, 0, 0.06);
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  z-index: 5;
}

.flyout-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  border-bottom: 1px solid #e7e7ee;
  min-height: 40px;
}

.flyout-panel-scroll {
  flex: 1;
  min-height: 0;
}

.flyout-panel-body {
  padding: 8px;
}
```

**Step 3: Create stub flyout content components**

Create directory `frontend/src/components/workbench/flyouts/` with five stub files. Each stub exports a simple component with placeholder text. We will fill these in later tasks.

Create each of these files with a minimal stub:
- `frontend/src/components/workbench/flyouts/ComponentsPalette.tsx`
- `frontend/src/components/workbench/flyouts/ModelOutline.tsx`
- `frontend/src/components/workbench/flyouts/GlobalVariables.tsx`
- `frontend/src/components/workbench/flyouts/SettingsPanel.tsx`
- `frontend/src/components/workbench/flyouts/SearchPanel.tsx`

Example stub:
```typescript
import { Text } from '@mantine/core';
export function ComponentsPalette() {
  return <Text size="xs" c="dimmed">Components palette placeholder</Text>;
}
```

**Step 4: Verify compilation**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | head -20`

**Step 5: Commit**

```bash
git add frontend/src/components/workbench/FlyoutPanel.tsx frontend/src/styles/flyout-panel.css frontend/src/components/workbench/flyouts/
git commit -m "feat: create flyout panel container with stub content panels"
```

---

### Task 4: Create bottom navigation bar

**Files:**
- Create: `frontend/src/components/workbench/BottomNavBar.tsx`
- Create: `frontend/src/styles/bottom-nav.css`

**Step 1: Create the bottom nav bar component**

A slim 32px bar at the bottom of the viewport with tab navigation and status indicators.

```typescript
// frontend/src/components/workbench/BottomNavBar.tsx
import { Group, Text, UnstyledButton } from '@mantine/core';
import { useEditorStore, type WorkbenchTab } from '../../state/editorStore';
import '../../styles/bottom-nav.css';

const TABS: Array<{ value: WorkbenchTab; label: string }> = [
  { value: 'canvas', label: 'Canvas' },
  { value: 'formulas', label: 'Formulas' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'scenarios', label: 'Scenarios' },
  { value: 'sensitivity', label: 'Sensitivity' },
];

export function BottomNavBar() {
  const activeTab = useEditorStore((s) => s.activeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const model = useEditorStore((s) => s.model);
  const validation = useEditorStore((s) => s.validation);

  const nodeCount = model.nodes.length;
  const errorCount = validation.errors?.length ?? 0;

  return (
    <div className="bottom-nav">
      <Group gap={0} className="bottom-nav-tabs">
        {TABS.map(({ value, label }) => (
          <UnstyledButton
            key={value}
            className={`bottom-nav-tab ${activeTab === value ? 'bottom-nav-tab-active' : ''}`}
            onClick={() => setActiveTab(value)}
          >
            <Text size="xs" fw={activeTab === value ? 600 : 400}>
              {label}
            </Text>
          </UnstyledButton>
        ))}
      </Group>
      <Group gap="sm" className="bottom-nav-status">
        <Text size="xs" c="dimmed">{nodeCount} nodes</Text>
        {errorCount > 0 && (
          <Text size="xs" c="red">{errorCount} errors</Text>
        )}
      </Group>
    </div>
  );
}
```

**Step 2: Create CSS**

```css
/* frontend/src/styles/bottom-nav.css */
.bottom-nav {
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  background: #f3f3f8;
  border-top: 1px solid #e7e7ee;
  flex-shrink: 0;
}

.bottom-nav-tabs {
  display: flex;
  gap: 0;
}

.bottom-nav-tab {
  padding: 4px 12px;
  border-radius: 4px;
  color: #7b7a87;
  font-size: 0.78rem;
  transition: background 120ms ease, color 120ms ease;
}

.bottom-nav-tab:hover {
  background: rgba(0, 0, 0, 0.04);
  color: #212027;
}

.bottom-nav-tab-active {
  color: #4b1b78;
  font-weight: 600;
}

.bottom-nav-status {
  font-size: 0.72rem;
}
```

**Step 3: Verify compilation**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep -i bottomnav`

**Step 4: Commit**

```bash
git add frontend/src/components/workbench/BottomNavBar.tsx frontend/src/styles/bottom-nav.css
git commit -m "feat: create bottom navigation bar component"
```

---

### Task 5: Create SimulationPanel for right sidebar

**Files:**
- Create: `frontend/src/components/workbench/SimulationPanel.tsx`

**Step 1: Create the simulation panel**

This panel replaces the bottom results dock. It shows sim config, run buttons, a chart, and variable toggles with type filter tabs.

```typescript
// frontend/src/components/workbench/SimulationPanel.tsx
import { useState, useMemo } from 'react';
import { ActionIcon, Box, Button, Checkbox, Group, NumberInput, ScrollArea, SegmentedControl, Stack, Text } from '@mantine/core';
import { IconPlayerPlay, IconChecks } from '@tabler/icons-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as ReTooltip, ResponsiveContainer } from 'recharts';
import { useEditorStore } from '../../state/editorStore';

const LINE_COLORS = ['#7c3aed', '#2563eb', '#059669', '#d97706', '#dc2626', '#0891b2', '#7c2d12', '#4338ca'];

type VariableFilter = 'all' | 'stock' | 'flow' | 'aux';

export function SimulationPanel() {
  const simConfig = useEditorStore((s) => s.simConfig);
  const updateSimConfig = useEditorStore((s) => s.updateSimConfig);
  const runValidation = useEditorStore((s) => s.runValidation);
  const runSimulation = useEditorStore((s) => s.runSimulation);
  const isValidating = useEditorStore((s) => s.isValidating);
  const isSimulating = useEditorStore((s) => s.isSimulating);
  const results = useEditorStore((s) => s.results);
  const model = useEditorStore((s) => s.model);

  const [hiddenVars, setHiddenVars] = useState<Set<string>>(new Set());
  const [varFilter, setVarFilter] = useState<VariableFilter>('all');

  // Build variable list with types from model nodes
  const variableList = useMemo(() => {
    if (!results?.data) return [];
    const cols = Object.keys(results.data).filter((k) => k !== 'time');
    return cols.map((name) => {
      const node = model.nodes.find((n) => 'name' in n && n.name === name);
      const nodeType = node?.type ?? 'aux';
      return { name, nodeType };
    });
  }, [results, model.nodes]);

  const filteredVars = variableList.filter(
    (v) => varFilter === 'all' || v.nodeType === varFilter,
  );

  // Build chart data
  const chartData = useMemo(() => {
    if (!results?.data?.time) return [];
    return results.data.time.map((t: number, i: number) => {
      const point: Record<string, number> = { time: t };
      for (const v of variableList) {
        if (!hiddenVars.has(v.name)) {
          point[v.name] = results.data[v.name]?.[i] ?? 0;
        }
      }
      return point;
    });
  }, [results, variableList, hiddenVars]);

  const visibleVars = variableList.filter((v) => !hiddenVars.has(v.name));

  const toggleVar = (name: string) => {
    setHiddenVars((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const showAll = () => setHiddenVars(new Set());
  const hideAll = () => setHiddenVars(new Set(variableList.map((v) => v.name)));

  return (
    <Box style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Sim config + run buttons */}
      <Stack gap={6} px="sm" py={8} style={{ borderBottom: '1px solid var(--mantine-color-gray-3)', flexShrink: 0 }}>
        <Group gap={6}>
          <NumberInput label="Start" size="xs" value={simConfig.start} onChange={(v) => updateSimConfig({ start: Number(v) })} style={{ flex: 1 }} />
          <NumberInput label="Stop" size="xs" value={simConfig.stop} onChange={(v) => updateSimConfig({ stop: Number(v) })} style={{ flex: 1 }} />
          <NumberInput label="dt" size="xs" value={simConfig.dt} onChange={(v) => updateSimConfig({ dt: Number(v) })} style={{ flex: 1 }} step={0.1} />
        </Group>
        <Group gap={6}>
          <Button size="compact-xs" variant="light" color="gray" leftSection={<IconChecks size={14} />} onClick={() => void runValidation()} loading={isValidating} style={{ flex: 1 }}>
            Validate
          </Button>
          <Button size="compact-xs" variant="filled" color="violet" leftSection={<IconPlayerPlay size={14} />} onClick={() => void runSimulation()} loading={isSimulating} style={{ flex: 1 }}>
            Simulate
          </Button>
        </Group>
      </Stack>

      {/* Chart */}
      <Box style={{ flex: 1, minHeight: 160, padding: '8px 4px' }}>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={40} />
              <ReTooltip contentStyle={{ fontSize: 11 }} />
              {visibleVars.map((v, i) => (
                <Line key={v.name} type="monotone" dataKey={v.name} stroke={LINE_COLORS[i % LINE_COLORS.length]} dot={false} strokeWidth={1.5} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <Text size="xs" c="dimmed" ta="center" py="xl">Run a simulation to see results.</Text>
        )}
      </Box>

      {/* Variable toggles */}
      <Box style={{ borderTop: '1px solid var(--mantine-color-gray-3)', flexShrink: 0 }}>
        <Group gap={4} px={8} py={4}>
          <SegmentedControl
            size="xs"
            value={varFilter}
            onChange={(v) => setVarFilter(v as VariableFilter)}
            data={[
              { value: 'all', label: 'All' },
              { value: 'stock', label: 'Stocks' },
              { value: 'flow', label: 'Flows' },
              { value: 'aux', label: 'Aux' },
            ]}
            styles={{ root: { flex: 1 } }}
          />
        </Group>
        <Group gap="xs" px={8} pb={2}>
          <Text size="xs" c="dimmed" style={{ cursor: 'pointer' }} onClick={showAll}>All</Text>
          <Text size="xs" c="dimmed">|</Text>
          <Text size="xs" c="dimmed" style={{ cursor: 'pointer' }} onClick={hideAll}>None</Text>
        </Group>
        <ScrollArea style={{ maxHeight: 150 }}>
          <Stack gap={0} px={8} pb={8}>
            {filteredVars.map((v, i) => (
              <Group key={v.name} gap={6} py={2} style={{ cursor: 'pointer' }} onClick={() => toggleVar(v.name)}>
                <Box style={{ width: 8, height: 8, borderRadius: '50%', background: hiddenVars.has(v.name) ? '#ddd' : LINE_COLORS[variableList.indexOf(v) % LINE_COLORS.length], flexShrink: 0 }} />
                <Text size="xs" style={{ flex: 1, opacity: hiddenVars.has(v.name) ? 0.4 : 1 }}>{v.name}</Text>
                <Checkbox size="xs" checked={!hiddenVars.has(v.name)} onChange={() => toggleVar(v.name)} styles={{ input: { cursor: 'pointer' } }} />
              </Group>
            ))}
          </Stack>
        </ScrollArea>
      </Box>
    </Box>
  );
}
```

**Step 2: Verify compilation**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | grep SimulationPanel`

**Step 3: Commit**

```bash
git add frontend/src/components/workbench/SimulationPanel.tsx
git commit -m "feat: create SimulationPanel for right sidebar with chart and variable toggles"
```

---

### Task 6: Populate flyout content panels from PalettePanel

**Files:**
- Modify: `frontend/src/components/workbench/flyouts/ComponentsPalette.tsx`
- Modify: `frontend/src/components/workbench/flyouts/ModelOutline.tsx`
- Modify: `frontend/src/components/workbench/flyouts/GlobalVariables.tsx`
- Modify: `frontend/src/components/workbench/flyouts/SettingsPanel.tsx`
- Modify: `frontend/src/components/workbench/flyouts/SearchPanel.tsx`

**Step 1: Extract content from PalettePanelMantine.tsx into flyout panels**

The current `PalettePanelMantine.tsx` has 5 accordion sections. Each section's content should be extracted into the corresponding flyout panel component.

**ComponentsPalette.tsx** — A 2-column grid of draggable/clickable component types (Stock, Flow, Aux, Lookup, Phantom, Text). Each is a small card with an icon and label. Clicking should add the node to the canvas (reuse existing `addStockNode`, `addFlowNode`, `addAuxNode`, etc. from editorStore).

Read the existing `CanvasComponentsBar.tsx` lines 67-78 for the node creation buttons. The flyout version should be a grid layout instead of a horizontal bar:

```typescript
// frontend/src/components/workbench/flyouts/ComponentsPalette.tsx
import { SimpleGrid, UnstyledButton, Stack, Text } from '@mantine/core';
import { IconSquare, IconArrowRight, IconCircle, IconTable, IconGhost, IconTypography } from '@tabler/icons-react';
import { useEditorStore } from '../../../state/editorStore';

const COMPONENTS = [
  { label: 'Stock', icon: IconSquare, color: '#2563eb', action: 'addStockNode' as const },
  { label: 'Flow', icon: IconArrowRight, color: '#7c3aed', action: 'addFlowNode' as const },
  { label: 'Variable', icon: IconCircle, color: '#059669', action: 'addAuxNode' as const },
  { label: 'Lookup', icon: IconTable, color: '#d97706', action: 'addLookupNode' as const },
];

export function ComponentsPalette() {
  const store = useEditorStore.getState;

  return (
    <SimpleGrid cols={2} spacing={6}>
      {COMPONENTS.map(({ label, icon: Icon, color, action }) => (
        <UnstyledButton
          key={label}
          onClick={() => store()[action]?.()}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
            padding: '10px 6px',
            borderRadius: 8,
            border: '1px solid #e7e7ee',
            background: '#fafafa',
            transition: 'background 100ms ease',
          }}
          onMouseEnter={(e) => { (e.target as HTMLElement).style.background = '#f0f0f5'; }}
          onMouseLeave={(e) => { (e.target as HTMLElement).style.background = '#fafafa'; }}
        >
          <Icon size={24} color={color} strokeWidth={1.5} />
          <Text size="xs" c="dimmed">{label}</Text>
        </UnstyledButton>
      ))}
    </SimpleGrid>
  );
}
```

**ModelOutline.tsx** — Extract the "Model Outline" accordion section from PalettePanel (lines 116-168). The node list with type badges and click-to-select behavior.

**GlobalVariables.tsx** — Extract the "Global Variables" accordion section from PalettePanel (lines 171-327). Add button, list of variables with name/value/usage count/edit/delete.

**SettingsPanel.tsx** — Extract "Global Styles" (lines 330-371) and "View Options" (lines 374-397) from PalettePanel. Combine into one compact panel.

**SearchPanel.tsx** — New panel. A TextInput at the top that filters model nodes and global variables by name. Displays matching results as a clickable list.

```typescript
// frontend/src/components/workbench/flyouts/SearchPanel.tsx
import { useState } from 'react';
import { Stack, Text, TextInput, UnstyledButton } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useEditorStore } from '../../../state/editorStore';

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const model = useEditorStore((s) => s.model);
  const setSelected = useEditorStore((s) => s.setSelected);

  const results = query.trim()
    ? model.nodes
        .filter((n) => 'name' in n && n.name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 20)
    : [];

  return (
    <Stack gap={8}>
      <TextInput
        placeholder="Search nodes..."
        size="xs"
        leftSection={<IconSearch size={14} />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {results.map((node) => (
        <UnstyledButton
          key={node.id}
          onClick={() => setSelected({ kind: 'node', id: node.id })}
          style={{ padding: '4px 8px', borderRadius: 4 }}
        >
          <Text size="xs">{'name' in node ? node.name : node.id}</Text>
          <Text size="xs" c="dimmed">{node.type}</Text>
        </UnstyledButton>
      ))}
    </Stack>
  );
}
```

**Step 2: Verify compilation**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | head -30`

The implementer should read the existing `PalettePanelMantine.tsx` carefully and extract the relevant JSX and store selectors for ModelOutline, GlobalVariables, and SettingsPanel. Keep the same functionality, just in standalone components instead of accordion sections.

**Step 3: Commit**

```bash
git add frontend/src/components/workbench/flyouts/
git commit -m "feat: populate flyout content panels extracted from PalettePanel"
```

---

### Task 7: Rewire WorkbenchLayoutMantine with new layout

**Files:**
- Modify: `frontend/src/components/workbench/WorkbenchLayoutMantine.tsx`

This is the core wiring task. Replace the current Mantine AppShell layout with the new structure.

**Step 1: Update imports**

Remove:
```typescript
import { PalettePanel } from '../palette/PalettePanelMantine';
import { ResultsDock } from '../results/ResultsDockMantine';
```

Add:
```typescript
import { IconStrip } from './IconStrip';
import { FlyoutPanel } from './FlyoutPanel';
import { BottomNavBar } from './BottomNavBar';
import { SimulationPanel } from './SimulationPanel';
import { IconPlayerPlay } from '@tabler/icons-react';
```

**Step 2: Restructure the layout**

Replace the entire AppShell-based layout. The new layout uses plain CSS flexbox instead of Mantine AppShell (since AppShell doesn't support the icon-strip + flyout pattern natively):

```tsx
export function WorkbenchLayout() {
  const [rightOpened, { open: openRight, close: closeRight }] = useDisclosure(true);
  const [menuOpened, setMenuOpened] = useState(false);

  const model = useEditorStore((s) => s.model);
  const loadModel = useEditorStore((s) => s.loadModel);
  const startNewModel = useEditorStore((s) => s.startNewModel);
  const isApplyingAi = useEditorStore((s) => s.isApplyingAi);
  const activeTab = useEditorStore((s) => s.activeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const rightSidebarMode = useEditorStore((s) => s.rightSidebarMode);
  const setRightSidebarMode = useEditorStore((s) => s.setRightSidebarMode);
  const logoUrl = ...;

  const isCanvas = activeTab === 'canvas';

  // ... presetOptions, pickerData, handlePickerChange stay the same ...

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header (48px) */}
      <header style={{ height: 48, display: 'flex', alignItems: 'center', padding: '0 12px', borderBottom: '1px solid #e7e7ee', background: '#f7f7fa', flexShrink: 0 }}>
        <Group gap="sm" style={{ flex: 1 }}>
          {/* Logo */}
          {logoUrl ? (
            <img src={logoUrl} alt="Structural Collective" style={{ height: 28 }} />
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: 6, background: '#EDE7F6', border: '1px solid #D1C4E9', display: 'grid', placeItems: 'center', fontWeight: 700, fontSize: '0.7rem', color: '#5E35B1' }}>SC</div>
          )}
          <Select
            aria-label="Model picker"
            value={selectedNative}
            onChange={handlePickerChange}
            data={pickerData}
            w={280}
            size="xs"
            searchable
            maxDropdownHeight={400}
            placeholder="Select a model or specification..."
          />
        </Group>
        <Group gap="xs">
          <Tooltip label="Start a new blank model">
            <Button size="compact-xs" variant="light" color="violet" leftSection={<IconPlus size={14} />} onClick={() => { startNewModel(); setRightSidebarMode('chat'); openRight(); }} disabled={isApplyingAi}>
              New
            </Button>
          </Tooltip>
          <Menu opened={menuOpened} onChange={setMenuOpened}>
            <Menu.Target>
              <ActionIcon variant="subtle" size="lg"><IconMenu2 size={20} /></ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <ImportExportControls mode="menu" onActionComplete={() => setMenuOpened(false)} />
            </Menu.Dropdown>
          </Menu>
        </Group>
      </header>

      {/* Middle: icon strip + flyout + main + right sidebar */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left icon strip (always visible) */}
        <IconStrip />

        {/* Flyout panel (conditional overlay) */}
        <FlyoutPanel />

        {/* Main content area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, position: 'relative', overflow: isCanvas ? 'hidden' : 'auto' }}>
          {activeTab === 'canvas' && <ModelCanvas />}
          {activeTab === 'formulas' && <FormulaPage />}
          {activeTab === 'dashboard' && <DashboardPage />}
          {activeTab === 'scenarios' && <ScenarioPage />}
          {activeTab === 'sensitivity' && <SensitivityPage />}
        </div>

        {/* Right sidebar (300px, collapsible) */}
        {rightOpened && (
          <div style={{ width: 300, borderLeft: '1px solid #e7e7ee', display: 'flex', flexDirection: 'column', flexShrink: 0 }}>
            <div className="sidebar-panel-header">
              <SegmentedControl
                size="xs"
                value={rightSidebarMode}
                onChange={(v) => setRightSidebarMode(v as RightSidebarMode)}
                data={[
                  { value: 'inspector', label: 'Inspector' },
                  { value: 'chat', label: 'AI Chat' },
                  { value: 'simulation', label: 'Simulate' },
                ]}
                styles={{ root: { flex: 1 } }}
              />
              <ActionIcon size="sm" variant="subtle" color="gray" onClick={closeRight} data-testid="right-collapse" aria-label="Collapse right sidebar" title="Collapse right sidebar">
                <IconChevronRight size={16} />
              </ActionIcon>
            </div>
            {rightSidebarMode === 'inspector' && (
              <ScrollArea style={{ flex: 1 }}>
                <div className="sidebar-panel-body sidebar-panel-body-right">
                  <InspectorPanel />
                </div>
              </ScrollArea>
            )}
            {rightSidebarMode === 'chat' && <AIChatSidebar />}
            {rightSidebarMode === 'simulation' && <SimulationPanel />}
          </div>
        )}
      </div>

      {/* Bottom nav bar (32px) */}
      <BottomNavBar />
    </div>
  );
}
```

**Step 3: Remove the left sidebar collapse/expand logic**

The old left sidebar used `useDisclosure` for `leftOpened`. This is no longer needed — the icon strip is always visible and the flyout is managed by `uiStore.activeFlyout`. Remove the `leftOpened`, `openLeft`, `closeLeft` state and all references.

**Step 4: Keep the right sidebar collapse/expand button**

When `!rightOpened`, show the floating expand button (same as current).

**Step 5: Verify compilation**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | head -40`

**Step 6: Commit**

```bash
git add frontend/src/components/workbench/WorkbenchLayoutMantine.tsx
git commit -m "feat: rewire layout with icon strip, flyout, bottom nav, and 3-mode sidebar"
```

---

### Task 8: Move canvas toolbar to bottom-center

**Files:**
- Modify: `frontend/src/components/canvas/ModelCanvas.tsx`
- Modify: `frontend/src/components/workbench/CanvasComponentsBar.tsx`

**Step 1: Move the toolbar position**

In `ModelCanvas.tsx`, change the `<Panel>` position from `top-center` to `bottom-center`:

```tsx
<Panel position="bottom-center" className="canvas-components-panel">
  <CanvasComponentsBar />
</Panel>
```

**Step 2: Remove node creation buttons from CanvasComponentsBar**

The node creation buttons (Stock, Variable, Look-up, Text) are now in the Components flyout palette. Remove them from the toolbar. Keep only: zoom controls, lock toggle, auto-organize, alignment tools, CLD, clean phantoms.

In `CanvasComponentsBar.tsx`, remove the node creation buttons (around lines 67-78) and the divider before them. The toolbar becomes: Zoom controls | Lock | Divider | Auto-organize | Divider | Alignment tools | CLD | Clean phantoms.

**Step 3: Update CSS if needed**

The `.canvas-components-bar` and `.canvas-components-panel` CSS may need slight adjustments for bottom positioning. Check `app.css` for any `top`-specific positioning.

**Step 4: Update CanvasComponentsBar tests**

The existing test in `CanvasComponentsBar.test.tsx` tests zoom, alignment, and CLD — those stay. If any tests reference the removed node creation buttons, remove those test assertions.

**Step 5: Verify tests pass**

Run: `cd frontend && npx vitest run src/components/workbench/CanvasComponentsBar.test.tsx`

**Step 6: Commit**

```bash
git add frontend/src/components/canvas/ModelCanvas.tsx frontend/src/components/workbench/CanvasComponentsBar.tsx frontend/src/components/workbench/CanvasComponentsBar.test.tsx
git commit -m "refactor: move canvas toolbar to bottom-center, remove node creation buttons"
```

---

### Task 9: Update tests for new layout

**Files:**
- Modify: `frontend/src/components/workbench/WorkbenchLayoutMantine.test.tsx`
- Modify: `frontend/src/components/results/ResultsDockMantine.test.tsx`

**Step 1: Update WorkbenchLayoutMantine tests**

The layout no longer uses Mantine AppShell. Update mocks:
- Remove `PalettePanel` mock (no longer imported)
- Remove `ResultsDock` mock (no longer imported)
- Add mocks for `IconStrip`, `FlyoutPanel`, `BottomNavBar`, `SimulationPanel`

Update the sidebar toggle tests — the SegmentedControl now has 3 options (Inspector, AI Chat, Simulate). Adjust the existing toggle test and add one for simulation mode.

**Step 2: Update ResultsDock tests**

The `ResultsDockMantine` component still exists but is no longer rendered in the main layout. Its tests should still pass independently. Verify:

Run: `cd frontend && npx vitest run src/components/results/ResultsDockMantine.test.tsx`

If tests fail because of removed dependencies, fix them. The component itself can remain for future use (e.g., a full-page results view).

**Step 3: Run full test suite**

Run: `cd frontend && npx vitest run 2>&1 | tail -30`

**Step 4: Commit**

```bash
git add frontend/src/
git commit -m "test: update tests for new layout structure"
```

---

### Task 10: CSS cleanup and visual polish

**Files:**
- Modify: `frontend/src/styles/app.css`

**Step 1: Remove dead CSS**

Remove or comment out styles that are no longer used:
- `.ai-chat-floating` and related (if not already removed)
- `.results-tray-header`, `.dock-resize-handle`, `.dock-resize-pill`, `.dock-body` (results dock styles — only if the component is no longer rendered anywhere)
- `.workspace-grid` and variants (old CSS grid layout)
- `.left-rail`, `.right-rail` (old rail styles if replaced)
- Old header-specific styles if the header is now inline-styled

**Step 2: Verify nothing is visually broken**

Keep styles that are still referenced by existing components (like sidebar-panel-header, sidebar-panel-body-right which are still used by the right sidebar).

**Step 3: Commit**

```bash
git add frontend/src/styles/app.css
git commit -m "chore: remove dead CSS from layout overhaul"
```

---

### Task 11: Final verification

**Step 1: Run full frontend test suite**

Run: `cd frontend && npx vitest run 2>&1 | tail -40`

Expected: All tests pass (minus pre-existing failures).

**Step 2: Run type check**

Run: `cd frontend && npx tsc -b --noEmit 2>&1 | head -30`

Expected: Only pre-existing errors in older files.

**Step 3: Run backend tests (sanity check)**

Run: `make test-backend 2>&1 | tail -20`

**Step 4: Manual smoke test**

Run: `make dev`

Verify:
- Dark icon strip on the left with 5 icons
- Clicking (+) opens Components flyout with grid of component types
- Clicking outline icon shows model node list
- Clicking same icon again closes flyout
- Clicking different icon swaps flyout content
- Flyout overlays canvas (doesn't push it)
- Header is slimmer (48px), shows logo + model picker + New + menu, no tabs
- Bottom nav bar shows Canvas | Formulas | Dashboard | Scenarios | Sensitivity
- Clicking bottom nav tabs navigates to full-page views
- Right sidebar has 3-mode toggle: Inspector, AI Chat, Simulate
- Simulation panel shows config, run buttons, chart with results
- Variable toggles work (type filter tabs, checkboxes, All/None)
- Canvas toolbar at bottom-center with zoom, align, organize tools
- No node creation buttons in canvas toolbar (they're in Components flyout)

**Step 5: Commit any final fixes**

```bash
git add -A
git commit -m "chore: final cleanup for UI overhaul"
```
