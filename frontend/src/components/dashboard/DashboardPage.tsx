import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  AppShell,
  Badge,
  Box,
  Button,
  Card,
  Group,
  NumberInput,
  Paper,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowUp,
  IconGripVertical,
  IconPlayerPlay,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  clampRectToBounds,
  DASHBOARD_GRID_SIZE,
  findNearestFreeRect,
  firstFreeRect,
  resolveCardRect,
  type Rect,
} from '../../lib/dashboardLayout';
import { navigateTo } from '../../lib/navigation';
import { useEditorStore } from '../../state/editorStore';
import type { DashboardCard, DashboardCardType, ScenarioRunResult } from '../../types/model';

const CANVAS_MIN_HEIGHT = 720;

function latestFinite(values: number[] | undefined): number | null {
  if (!values || values.length === 0) return null;
  for (let i = values.length - 1; i >= 0; i -= 1) {
    if (Number.isFinite(values[i])) return values[i];
  }
  return null;
}

function lineRows(run: ScenarioRunResult, variable: string): Array<{ time: number; value: number }> {
  const time = run.series.time ?? [];
  const values = run.series[variable] ?? [];
  return time.map((t, i) => ({ time: t, value: values[i] ?? Number.NaN }));
}

function tableRows(run: ScenarioRunResult, variable: string, limit: number): Array<{ time: number; value: number }> {
  const rows = lineRows(run, variable);
  return rows.slice(Math.max(0, rows.length - limit));
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

function computeSeedLayout(cards: DashboardCard[]): Record<string, Rect> {
  const occupied: Rect[] = [];
  const layoutById: Record<string, Rect> = {};
  for (const card of cards) {
    const candidate = resolveCardRect(card);
    const hasExplicitPosition = Number.isFinite(card.x) && Number.isFinite(card.y);
    const placed = hasExplicitPosition
      ? findNearestFreeRect(candidate, occupied, { width: 1500, height: 2000 }) ??
        firstFreeRect({ w: candidate.w, h: candidate.h }, occupied, { width: 1500, height: 2000 })
      : firstFreeRect({ w: candidate.w, h: candidate.h }, occupied, { width: 1500, height: 2000 });
    layoutById[card.id] = placed;
    occupied.push(placed);
  }
  return layoutById;
}

function CardContent({ card, run }: { card: DashboardCard; run: ScenarioRunResult | null }) {
  if (!run) {
    return <Text size="sm" c="dimmed">Run dashboard to load data.</Text>;
  }
  if (!run.series[card.variable]) {
    return <Alert color="yellow" variant="light">Variable "{card.variable}" is missing in selected scenario.</Alert>;
  }

  if (card.type === 'kpi') {
    const value = latestFinite(run.series[card.variable]);
    return (
      <Stack gap={6}>
        <Text size="xs" c="dimmed">Latest value</Text>
        <Text fw={700} size="xl">{value == null ? 'N/A' : value.toFixed(4)}</Text>
      </Stack>
    );
  }

  if (card.type === 'line') {
    const rows = lineRows(run, card.variable);
    return (
      <Box h={220}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="value" stroke="#5e35b1" dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Box>
    );
  }

  const rows = tableRows(run, card.variable, Math.max(1, card.table_rows ?? 10));
  return (
    <Table striped highlightOnHover withTableBorder withColumnBorders>
      <Table.Thead>
        <Table.Tr>
          <Table.Th>time</Table.Th>
          <Table.Th>{card.variable}</Table.Th>
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {rows.map((row) => (
          <Table.Tr key={`${row.time}`}>
            <Table.Td>{Number.isFinite(row.time) ? row.time.toFixed(4) : 'NaN'}</Table.Td>
            <Table.Td>{Number.isFinite(row.value) ? row.value.toFixed(4) : 'NaN'}</Table.Td>
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}

type DragState = {
  cardId: string;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  origin: Rect;
};

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

  const [newCardType, setNewCardType] = useState<DashboardCardType>('kpi');
  const [newVariable, setNewVariable] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newTableRows, setNewTableRows] = useState<number>(10);
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('');
  const [cardLayout, setCardLayout] = useState<Record<string, Rect>>({});
  const [dragState, setDragState] = useState<DragState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const cardLayoutRef = useRef<Record<string, Rect>>({});

  const variableOptions = useMemo(() => {
    const nodeOptions = model.nodes
      .filter((node) => node.type !== 'text' && node.type !== 'cloud' && node.type !== 'cld_symbol')
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

  const activeDashboard = dashboards.find((dashboard) => dashboard.id === activeDashboardId) ?? null;
  const sortedCards = useMemo(
    () => (activeDashboard?.cards ?? []).slice().sort((a, b) => a.order - b.order),
    [activeDashboard],
  );

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
    setSelectedScenarioId((current) => (current && dedupedRuns.some((run) => run.scenario_id === current) ? current : preferred));
  }, [dedupedRuns, activeScenarioId]);

  const selectedRun = dedupedRuns.find((run) => run.scenario_id === selectedScenarioId) ?? null;

  const layoutSeed = useMemo(() => computeSeedLayout(sortedCards), [sortedCards]);

  useEffect(() => {
    setCardLayout(layoutSeed);
  }, [layoutSeed, activeDashboard?.id]);

  useEffect(() => {
    cardLayoutRef.current = cardLayout;
  }, [cardLayout]);

  useEffect(() => {
    if (!activeDashboard) return;
    for (const card of sortedCards) {
      const resolved = layoutSeed[card.id];
      if (!resolved) continue;
      const missingLayout =
        !Number.isFinite(card.x) ||
        !Number.isFinite(card.y) ||
        !Number.isFinite(card.w) ||
        !Number.isFinite(card.h);
      if (!missingLayout) continue;
      updateDashboardCard(activeDashboard.id, card.id, {
        x: resolved.x,
        y: resolved.y,
        w: resolved.w,
        h: resolved.h,
      });
    }
  }, [activeDashboard, sortedCards, layoutSeed, updateDashboardCard]);

  const canvasHeight = useMemo(() => {
    const maxBottom = sortedCards.reduce((max, card) => {
      const rect = cardLayout[card.id] ?? layoutSeed[card.id];
      if (!rect) return max;
      return Math.max(max, rect.y + rect.h + 24);
    }, CANVAS_MIN_HEIGHT);
    return Math.max(CANVAS_MIN_HEIGHT, maxBottom);
  }, [sortedCards, cardLayout, layoutSeed]);

  const onAddCard = () => {
    if (!activeDashboard) return;
    if (!newVariable) return;
    const title = newTitle.trim() || `${newCardType.toUpperCase()} • ${newVariable}`;
    addDashboardCard(activeDashboard.id, {
      type: newCardType,
      title,
      variable: newVariable,
      table_rows: newCardType === 'table' ? Math.max(1, Math.round(newTableRows)) : undefined,
    });
    setNewTitle('');
  };

  const beginDrag = (event: React.PointerEvent<HTMLButtonElement>, cardId: string) => {
    const rect = cardLayoutRef.current[cardId];
    if (!rect || !canvasRef.current) return;
    const canvasBounds = canvasRef.current.getBoundingClientRect();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragState({
      cardId,
      pointerId: event.pointerId,
      offsetX: event.clientX - canvasBounds.left - rect.x,
      offsetY: event.clientY - canvasBounds.top - rect.y,
      origin: rect,
    });
  };

  useEffect(() => {
    if (!dragState) return;

    const onPointerMove = (event: PointerEvent) => {
      if (!canvasRef.current) return;
      const canvasBounds = canvasRef.current.getBoundingClientRect();
      const currentRect = cardLayoutRef.current[dragState.cardId];
      if (!currentRect) return;

      const nextRect = clampRectToBounds(
        {
          ...currentRect,
          x: event.clientX - canvasBounds.left - dragState.offsetX,
          y: event.clientY - canvasBounds.top - dragState.offsetY,
        },
        {
          width: canvasBounds.width,
          height: canvasHeight,
        },
      );

      setCardLayout((prev) => ({
        ...prev,
        [dragState.cardId]: {
          ...currentRect,
          x: Math.round(nextRect.x / DASHBOARD_GRID_SIZE) * DASHBOARD_GRID_SIZE,
          y: Math.round(nextRect.y / DASHBOARD_GRID_SIZE) * DASHBOARD_GRID_SIZE,
        },
      }));
    };

    const onPointerUp = () => {
      if (!canvasRef.current || !activeDashboard) {
        setDragState(null);
        return;
      }
      const canvasBounds = canvasRef.current.getBoundingClientRect();
      const currentRect = cardLayoutRef.current[dragState.cardId] ?? dragState.origin;
      const occupied = sortedCards
        .filter((card) => card.id !== dragState.cardId)
        .map((card) => cardLayoutRef.current[card.id] ?? layoutSeed[card.id])
        .filter((rect): rect is Rect => Boolean(rect));

      const resolved =
        findNearestFreeRect(currentRect, occupied, {
          width: canvasBounds.width,
          height: canvasHeight,
        }) ?? dragState.origin;

      setCardLayout((prev) => ({
        ...prev,
        [dragState.cardId]: resolved,
      }));
      updateDashboardCard(activeDashboard.id, dragState.cardId, {
        x: resolved.x,
        y: resolved.y,
        w: resolved.w,
        h: resolved.h,
      });
      setDragState(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [dragState, activeDashboard, sortedCards, layoutSeed, canvasHeight, updateDashboardCard]);

  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Button variant="subtle" leftSection={<IconArrowLeft size={16} />} onClick={() => navigateTo('/')}>
              Back to Model
            </Button>
            <Title order={4}>Dashboard Builder</Title>
            <Badge variant="light">{model.name}</Badge>
            {duplicateScenarioCount > 0 ? <Badge color="yellow" variant="light">deduped {duplicateScenarioCount} scenario entries</Badge> : null}
          </Group>
          <Group>
            <Select
              label="Scenario"
              size="xs"
              value={selectedScenarioId}
              data={scenarioOptions}
              onChange={(value) => setSelectedScenarioId(value ?? '')}
              placeholder="Run dashboard first"
              w={220}
            />
            <Button
              leftSection={<IconPlayerPlay size={16} />}
              onClick={() => void runScenarioBatch()}
              loading={isRunningBatch}
            >
              Run Dashboard
            </Button>
          </Group>
        </Group>
      </AppShell.Header>

      <AppShell.Main>
        <Box
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 16,
            alignItems: 'flex-start',
            width: '100%',
          }}
        >
          <Paper withBorder p="md" style={{ width: 340, flex: '0 0 340px' }}>
            <Stack gap="sm">
              <Title order={5}>Composer</Title>
              <Select
                label="Dashboard"
                value={activeDashboardId}
                data={dashboards.map((dashboard) => ({ value: dashboard.id, label: dashboard.name }))}
                placeholder="No dashboards"
                onChange={(value) => value && setActiveDashboard(value)}
              />
              <Group grow>
                <Button variant="light" leftSection={<IconPlus size={14} />} onClick={() => createDashboard()}>
                  New
                </Button>
                <Button
                  variant="light"
                  color="red"
                  leftSection={<IconTrash size={14} />}
                  disabled={!activeDashboard}
                  onClick={() => activeDashboard && deleteDashboard(activeDashboard.id)}
                >
                  Delete
                </Button>
              </Group>

              {activeDashboard ? (
                <>
                  <TextInput
                    label="Dashboard Name"
                    value={activeDashboard.name}
                    onChange={(event) => updateDashboard(activeDashboard.id, { name: event.currentTarget.value })}
                  />

                  <Paper withBorder p="sm">
                    <Stack gap="xs">
                      <Text fw={600} size="sm">Add Card</Text>
                      <Select
                        label="Type"
                        value={newCardType}
                        onChange={(value) => setNewCardType((value as DashboardCardType) ?? 'kpi')}
                        data={[
                          { value: 'kpi', label: 'KPI' },
                          { value: 'line', label: 'Line Chart' },
                          { value: 'table', label: 'Data Table' },
                        ]}
                      />
                      <Select
                        label="Variable"
                        value={newVariable}
                        onChange={(value) => setNewVariable(value ?? '')}
                        data={variableOptions}
                        searchable
                      />
                      <TextInput
                        label="Title"
                        value={newTitle}
                        onChange={(event) => setNewTitle(event.currentTarget.value)}
                        placeholder="Optional"
                      />
                      {newCardType === 'table' ? (
                        <NumberInput
                          label="Table Rows"
                          value={newTableRows}
                          min={1}
                          max={200}
                          onChange={(value) => setNewTableRows(Number(value) || 10)}
                        />
                      ) : null}
                      <Button onClick={onAddCard} disabled={!newVariable}>
                        Add Card
                      </Button>
                    </Stack>
                  </Paper>

                  <Stack gap="xs">
                    <Text fw={600} size="sm">Cards</Text>
                    {sortedCards.length === 0 ? (
                      <Text size="sm" c="dimmed">No cards yet.</Text>
                    ) : (
                      sortedCards.map((card) => (
                        <Paper key={card.id} withBorder p="xs">
                          <Group justify="space-between" align="center" wrap="nowrap">
                            <div>
                              <Text fw={600} size="sm">{card.title}</Text>
                              <Text size="xs" c="dimmed">{card.type.toUpperCase()} • {card.variable}</Text>
                            </div>
                            <Group gap={4}>
                              <ActionCardButton
                                label="Move up"
                                icon={<IconArrowUp size={14} />}
                                onClick={() => moveDashboardCard(activeDashboard.id, card.id, 'up')}
                              />
                              <ActionCardButton
                                label="Move down"
                                icon={<IconArrowDown size={14} />}
                                onClick={() => moveDashboardCard(activeDashboard.id, card.id, 'down')}
                              />
                              <ActionCardButton
                                label="Delete"
                                icon={<IconTrash size={14} />}
                                onClick={() => deleteDashboardCard(activeDashboard.id, card.id)}
                              />
                            </Group>
                          </Group>
                        </Paper>
                      ))
                    )}
                  </Stack>
                </>
              ) : (
                <Alert color="blue" variant="light">Create a dashboard to start composing cards.</Alert>
              )}
            </Stack>
          </Paper>

          <Stack gap="md" style={{ minWidth: 0, flex: '1 1 auto' }}>
            {!compareResults ? <Alert color="violet" variant="light">Run Dashboard to load scenario results for cards.</Alert> : null}
            {!activeDashboard ? (
              <Alert color="gray" variant="light">No active dashboard selected.</Alert>
            ) : sortedCards.length === 0 ? (
              <Alert color="gray" variant="light">Add cards in the composer to build your dashboard.</Alert>
            ) : (
              <Paper withBorder p="sm" style={{ minHeight: CANVAS_MIN_HEIGHT, width: '100%' }}>
                <Box
                  ref={canvasRef}
                  style={{
                    position: 'relative',
                    width: '100%',
                    height: canvasHeight,
                    backgroundImage:
                      'linear-gradient(to right, rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.05) 1px, transparent 1px)',
                    backgroundSize: `${DASHBOARD_GRID_SIZE}px ${DASHBOARD_GRID_SIZE}px`,
                    borderRadius: 8,
                  }}
                >
                  {sortedCards.map((card) => {
                    const rect = cardLayout[card.id] ?? layoutSeed[card.id] ?? resolveCardRect(card);
                    return (
                      <Card
                        key={card.id}
                        withBorder
                        shadow="sm"
                        radius="md"
                        style={{
                          position: 'absolute',
                          left: rect.x,
                          top: rect.y,
                          width: rect.w,
                          height: rect.h,
                          overflow: 'hidden',
                        }}
                      >
                        <Stack gap="xs" h="100%">
                          <Group justify="space-between" wrap="nowrap">
                            <Group gap={6} wrap="nowrap">
                              <ActionIcon
                                variant="subtle"
                                aria-label="Drag card"
                                title="Drag card"
                                onPointerDown={(event) => beginDrag(event, card.id)}
                                style={{ cursor: dragState?.cardId === card.id ? 'grabbing' : 'grab' }}
                              >
                                <IconGripVertical size={14} />
                              </ActionIcon>
                              <Text fw={700} lineClamp={1}>{card.title}</Text>
                            </Group>
                            <Badge variant="light">{card.type.toUpperCase()}</Badge>
                          </Group>
                          <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                            <CardContent card={card} run={selectedRun} />
                          </Box>
                        </Stack>
                      </Card>
                    );
                  })}
                </Box>
              </Paper>
            )}
          </Stack>
        </Box>
      </AppShell.Main>
    </AppShell>
  );
}

function ActionCardButton({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) {
  return (
    <Button variant="subtle" size="compact-xs" aria-label={label} title={label} onClick={onClick} px={6}>
      {icon}
    </Button>
  );
}
