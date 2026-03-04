import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  ScrollArea,
  Select,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { IconCards, IconPlayerPlay, IconX } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import type { ScenarioRunResult } from '../../types/model';
import { DashboardCanvasPanel } from './DashboardCanvasPanel';
import { DashboardEditorPanel } from './DashboardEditorPanel';
import { DashboardListPanel } from './DashboardListPanel';

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
  const moveDashboardCard = useEditorStore((s) => s.moveDashboardCard);
  const deleteDashboardCard = useEditorStore((s) => s.deleteDashboardCard);
  const updateDashboardCard = useEditorStore((s) => s.updateDashboardCard);
  const runScenarioBatch = useEditorStore((s) => s.runScenarioBatch);
  const isRunningBatch = useEditorStore((s) => s.isRunningBatch);
  const compareResults = useEditorStore((s) => s.compareResults);
  const activeScenarioId = useEditorStore((s) => s.activeScenarioId);

  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [editorOpen, setEditorOpen] = useState(false);

  const activeDashboard = dashboards.find((d) => d.id === activeDashboardId) ?? null;

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

        {/* Canvas area (with flyout overlay) */}
        <Box style={{ flex: 1, minWidth: 0, position: 'relative', overflow: 'hidden' }}>
          {/* Editor flyout */}
          {editorOpen && activeDashboard && (
            <div
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                bottom: 0,
                width: 280,
                background: '#ffffff',
                borderRight: '1px solid #e7e7ee',
                boxShadow: '2px 0 8px rgba(0,0,0,0.06)',
                zIndex: 5,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '8px 12px',
                  borderBottom: '1px solid #e7e7ee',
                  minHeight: 40,
                }}
              >
                <Text size="sm" fw={600}>Edit Cards</Text>
                <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setEditorOpen(false)}>
                  <IconX size={14} />
                </ActionIcon>
              </div>
              <ScrollArea style={{ flex: 1 }} offsetScrollbars scrollbarSize={6}>
                <DashboardEditorPanel
                  dashboard={activeDashboard}
                  variableOptions={variableOptions}
                  onUpdateDashboard={updateDashboard}
                  onAddCard={addDashboardCard}
                  onUpdateCard={updateDashboardCard}
                  onMoveCard={moveDashboardCard}
                  onDeleteCard={deleteDashboardCard}
                />
              </ScrollArea>
            </div>
          )}

          {/* Flyout toggle button (top-left of canvas) */}
          {activeDashboard && (
            <Tooltip label={editorOpen ? 'Close editor' : 'Edit cards'} position="right">
              <ActionIcon
                variant={editorOpen ? 'filled' : 'light'}
                color="violet"
                size="md"
                onClick={() => setEditorOpen((o) => !o)}
                style={{
                  position: 'absolute',
                  top: 8,
                  left: editorOpen ? 288 : 8,
                  zIndex: 6,
                  transition: 'left 0.15s ease',
                }}
              >
                <IconCards size={16} />
              </ActionIcon>
            </Tooltip>
          )}

          {/* Canvas */}
          <Box style={{ height: '100%', overflow: 'auto' }}>
            {activeDashboard ? (
              <DashboardCanvasPanel
                cards={activeDashboard.cards}
                selectedRun={selectedRun}
                activeDashboardId={activeDashboard.id}
                onUpdateCard={updateDashboardCard}
              />
            ) : (
              <Box
                style={{
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text size="sm" c="dimmed">Create a dashboard to get started</Text>
              </Box>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
