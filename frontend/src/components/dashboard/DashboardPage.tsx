import { Component, useCallback, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Select,
  Text,
  Title,
} from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import type { DashboardCard, ScenarioRunResult } from '../../types/model';
import { CardConfigPanel } from './CardConfigPanel';
import { listDataTables } from '../../lib/dataTableStorage';
import type { DataTableMeta } from '../../types/dataTable';
import { DashboardCanvasPanel } from './DashboardCanvasPanel';
import { DashboardListPanel } from './DashboardListPanel';
import { DashboardToolbar } from './DashboardToolbar';

class DashboardErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error('Dashboard crash:', error, info); }
  render() {
    if (this.state.error) {
      return (
        <Alert color="red" title="Dashboard Error" m="md">
          <Text size="sm">{this.state.error.message}</Text>
          <Text size="xs" c="dimmed" mt="xs" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
            {this.state.error.stack}
          </Text>
          <Button size="xs" mt="sm" onClick={() => this.setState({ error: null })}>Retry</Button>
        </Alert>
      );
    }
    return this.props.children;
  }
}

function dedupeRuns(runs: ScenarioRunResult[]): ScenarioRunResult[] {
  const seen = new Set<string>();
  const unique: ScenarioRunResult[] = [];
  for (const run of runs) {
    if (seen.has(run.scenario_id)) continue;
    seen.add(run.scenario_id);
    unique.push(run);
  }
  return unique;
}

export function DashboardPage() {
  const model = useEditorStore((s) => s.model);
  const dashboards = useEditorStore((s) => s.dashboards);
  const activeDashboardId = useEditorStore((s) => s.activeDashboardId);
  const setActiveDashboard = useEditorStore((s) => s.setActiveDashboard);
  const createDashboard = useEditorStore((s) => s.createDashboard);
  const updateDashboard = useEditorStore((s) => s.updateDashboard);
  const deleteDashboard = useEditorStore((s) => s.deleteDashboard);
  const addDashboardCard = useEditorStore((s) => s.addDashboardCard);
  const deleteDashboardCard = useEditorStore((s) => s.deleteDashboardCard);
  const updateDashboardCard = useEditorStore((s) => s.updateDashboardCard);
  const runScenarioBatch = useEditorStore((s) => s.runScenarioBatch);
  const isRunningBatch = useEditorStore((s) => s.isRunningBatch);
  const compareResults = useEditorStore((s) => s.compareResults);
  const activeScenarioId = useEditorStore((s) => s.activeScenarioId);

  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [dataTables, setDataTables] = useState<DataTableMeta[]>([]);

  useEffect(() => {
    listDataTables().then(setDataTables).catch(() => setDataTables([]));
  }, []);

  const activeDashboard = dashboards.find((d) => d.id === activeDashboardId) ?? null;

  useEffect(() => {
    setSelectedCardId(null);
  }, [activeDashboardId]);

  const variableOptions = useMemo(() => {
    const nodeOptions = model.nodes
      .filter((node) => node.type !== 'text' && node.type !== 'cloud' && node.type !== 'cld_symbol' && node.type !== 'phantom')
      .map((node) => ({ value: node.name, label: `${node.label} (${node.name})` }));
    const globalOptions = (model.global_variables ?? []).map((variable) => ({
      value: variable.name,
      label: `Global: ${variable.name}`,
    }));
    const byValue = new Map<string, { value: string; label: string }>();
    for (const option of [...nodeOptions, ...globalOptions]) {
      if (!byValue.has(option.value)) byValue.set(option.value, option);
    }
    return Array.from(byValue.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [model.nodes, model.global_variables]);

  const dedupedRuns = useMemo(
    () => dedupeRuns(compareResults?.runs ?? []),
    [compareResults?.runs],
  );
  const duplicateScenarioCount = (compareResults?.runs.length ?? 0) - dedupedRuns.length;

  const scenarioOptions = useMemo(
    () =>
      dedupedRuns.map((run) => ({
        value: run.scenario_id,
        label: run.scenario_name,
      })),
    [dedupedRuns],
  );

  useEffect(() => {
    if (dedupedRuns.length === 0) {
      setSelectedScenarioId('');
      return;
    }
    const preferred =
      dedupedRuns.find((run) => run.scenario_id === activeScenarioId)?.scenario_id ??
      dedupedRuns[0]?.scenario_id ??
      '';
    setSelectedScenarioId((current) =>
      current && dedupedRuns.some((run) => run.scenario_id === current) ? current : preferred,
    );
  }, [dedupedRuns, activeScenarioId]);

  const selectedRun = dedupedRuns.find((run) => run.scenario_id === selectedScenarioId) ?? null;

  const selectedCard = activeDashboard?.cards.find((c) => c.id === selectedCardId) ?? null;

  const handleUpdateSelectedCard = useCallback(
    (patch: Partial<DashboardCard>) => {
      if (!activeDashboard || !selectedCardId) return;
      updateDashboardCard(activeDashboard.id, selectedCardId, patch);
    },
    [activeDashboard, selectedCardId, updateDashboardCard],
  );

  const handleDuplicate = useCallback(
    (id: string) => {
      const source = dashboards.find((d) => d.id === id);
      if (!source) return;
      const cards = source.cards.map(({ id: _id, order: _order, ...rest }) => rest);
      createDashboard(`${source.name} (copy)`, cards);
    },
    [dashboards, createDashboard],
  );

  return (
    <DashboardErrorBoundary>
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Group
        justify="space-between"
        px="md"
        py="xs"
        style={{
          borderBottom: '1px solid var(--mantine-color-gray-3)',
          flexShrink: 0,
        }}
      >
        <Group gap="sm">
          <Title order={4} size="1rem">Dashboard</Title>
          {duplicateScenarioCount > 0 && (
            <Badge color="yellow" variant="light" size="sm">
              deduped {duplicateScenarioCount}
            </Badge>
          )}
        </Group>
        <Group gap="sm">
          <Select
            size="xs"
            value={selectedScenarioId}
            data={scenarioOptions}
            onChange={(value) => setSelectedScenarioId(value ?? '')}
            placeholder="Run dashboard first"
            w={200}
          />
          <Button
            size="xs"
            leftSection={<IconPlayerPlay size={14} />}
            onClick={() => void runScenarioBatch()}
            loading={isRunningBatch}
          >
            Run Dashboard
          </Button>
        </Group>
      </Group>

      {/* Body */}
      <Box style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: dashboard list */}
        <Box
          style={{
            width: 220,
            flexShrink: 0,
            borderRight: '1px solid var(--mantine-color-gray-3)',
            overflow: 'auto',
          }}
        >
          <DashboardListPanel
            dashboards={dashboards}
            activeDashboardId={activeDashboardId}
            model={model}
            onSelect={setActiveDashboard}
            onCreate={createDashboard}
            onDuplicate={handleDuplicate}
            onDelete={deleteDashboard}
          />
        </Box>

        {/* Right: toolbar + canvas */}
        <Box style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {activeDashboard && (
            <DashboardToolbar
              dashboard={activeDashboard}
              variableOptions={variableOptions}
              onUpdateDashboard={updateDashboard}
              onAddCard={addDashboardCard}
            />
          )}
          <Box style={{ flex: 1, overflow: 'auto' }}>
            {activeDashboard ? (
              <DashboardCanvasPanel
                cards={activeDashboard.cards}
                selectedRun={selectedRun}
                activeDashboardId={activeDashboard.id}
                onUpdateCard={updateDashboardCard}
                onDeleteCard={deleteDashboardCard}
                variableOptions={variableOptions}
                selectedCardId={selectedCardId}
                onSelectCard={setSelectedCardId}
              />
            ) : (
              <Box style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Text size="sm" c="dimmed">Create a dashboard to get started</Text>
              </Box>
            )}
          </Box>
        </Box>

        {/* Right: config panel */}
        {selectedCard && activeDashboard && (
          <CardConfigPanel
            card={selectedCard}
            variableOptions={variableOptions}
            dataTables={dataTables}
            onUpdate={handleUpdateSelectedCard}
            onClose={() => setSelectedCardId(null)}
          />
        )}
      </Box>
    </Box>
    </DashboardErrorBoundary>
  );
}
