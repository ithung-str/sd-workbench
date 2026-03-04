import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Card,
  Group,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconGripVertical, IconTrash } from '@tabler/icons-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  clampRectToBounds,
  DASHBOARD_GRID_SIZE,
  findNearestFreeRect,
  firstFreeRect,
  MIN_CARD_HEIGHT,
  MIN_CARD_WIDTH,
  resolveCardRect,
  snapToGrid,
  type Rect,
} from '../../lib/dashboardLayout';
import type { DashboardCard, DashboardCardType, ScenarioRunResult } from '../../types/model';
import { useDataTableCache, type DataTableCacheEntry } from '../../hooks/useDataTableCache';
import { MapCardContent } from './MapCardContent';
import { DataBarCardContent } from './DataBarCardContent';
import { DataAreaCardContent } from './DataAreaCardContent';
import { DataPieCardContent } from './DataPieCardContent';
import { DataTableCardContent } from './DataTableCardContent';
import { DataPivotCardContent } from './DataPivotCardContent';

const DATA_CARD_TYPES: DashboardCardType[] = [
  'data_bar', 'data_stacked_bar', 'data_area', 'data_pie', 'data_table', 'data_pivot',
];

function isDataCard(type: DashboardCardType): boolean {
  return DATA_CARD_TYPES.includes(type);
}

const CARD_TYPE_LABEL: Record<DashboardCardType, string> = {
  kpi: 'KPI',
  line: 'LINE',
  table: 'TABLE',
  map: 'MAP',
  heatmap: 'HEATMAP',
  sparkline: 'SPARK',
  comparison: 'COMPARE',
  data_bar: 'BAR',
  data_stacked_bar: 'STACKED',
  data_area: 'AREA',
  data_pie: 'PIE',
  data_table: 'DATA',
  data_pivot: 'PIVOT',
};

const CANVAS_MIN_HEIGHT = 720;
const COMPARISON_COLORS = ['#1b6ca8', '#d46a00', '#2f7d32', '#8a2be2', '#d32f2f', '#00838f'];

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

// --- Heatmap helpers ---

function interpolateColor(t: number): string {
  // white → purple (0 → 1)
  const r = Math.round(255 - t * 162);
  const g = Math.round(255 - t * 202);
  const b = Math.round(255 - t * 78);
  return `rgb(${r},${g},${b})`;
}

function downsample(arr: number[], maxCols: number): number[] {
  if (arr.length <= maxCols) return arr;
  const step = arr.length / maxCols;
  const result: number[] = [];
  for (let i = 0; i < maxCols; i++) {
    result.push(arr[Math.round(i * step)]);
  }
  return result;
}

function HeatmapContent({ card, run }: { card: DashboardCard; run: ScenarioRunResult }) {
  const vars = card.variables && card.variables.length > 0 ? card.variables : [];
  if (vars.length === 0) {
    return <Text size="xs" c="dimmed">No variables selected for heatmap.</Text>;
  }

  const maxCols = 50;
  const timeArr = run.series.time ?? [];
  const sampledTime = downsample(timeArr, maxCols);
  const colCount = sampledTime.length;

  if (colCount === 0) {
    return <Text size="xs" c="dimmed">No time steps available.</Text>;
  }

  const rows = vars.map((v) => {
    const raw = run.series[v] ?? [];
    const sampled = downsample(raw, maxCols);
    const finite = sampled.filter(Number.isFinite);
    const min = finite.length > 0 ? Math.min(...finite) : 0;
    const max = finite.length > 0 ? Math.max(...finite) : 1;
    const range = max - min || 1;
    return { name: v, cells: sampled, min, range };
  });

  const cellW = `${100 / colCount}%`;

  return (
    <Box style={{ overflow: 'auto', fontSize: 10 }}>
      <div style={{ display: 'grid', gridTemplateColumns: `80px repeat(${colCount}, 1fr)`, gap: 0 }}>
        {/* Header row with sparse time labels */}
        <div />
        {sampledTime.map((t, i) => (
          <div
            key={i}
            style={{
              textAlign: 'center',
              color: '#868e96',
              fontSize: 9,
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            {i % Math.max(1, Math.floor(colCount / 6)) === 0 ? t.toFixed(1) : ''}
          </div>
        ))}
        {/* Data rows */}
        {rows.map((row) => (
          <>
            <div
              key={`label-${row.name}`}
              style={{
                fontSize: 10,
                fontWeight: 500,
                paddingRight: 4,
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                lineHeight: '18px',
              }}
            >
              {row.name}
            </div>
            {row.cells.map((val, ci) => {
              const t = Number.isFinite(val) ? (val - row.min) / row.range : 0;
              return (
                <div
                  key={`${row.name}-${ci}`}
                  style={{
                    height: 18,
                    background: Number.isFinite(val) ? interpolateColor(t) : '#f1f3f5',
                  }}
                  title={`${row.name} @ t=${sampledTime[ci]?.toFixed(2)}: ${Number.isFinite(val) ? val.toFixed(4) : 'NaN'}`}
                />
              );
            })}
          </>
        ))}
      </div>
    </Box>
  );
}

// --- Sparkline ---

function SparklineContent({ card, run }: { card: DashboardCard; run: ScenarioRunResult }) {
  const values = run.series[card.variable] ?? [];
  const time = run.series.time ?? [];
  if (values.length === 0) return <Text size="xs" c="dimmed">No data.</Text>;

  const finite = values.filter(Number.isFinite);
  const min = finite.length > 0 ? Math.min(...finite) : 0;
  const max = finite.length > 0 ? Math.max(...finite) : 1;
  const range = max - min || 1;

  const svgW = 200;
  const svgH = 40;
  const points = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * svgW;
      const y = Number.isFinite(v) ? svgH - ((v - min) / range) * svgH : svgH;
      return `${x},${y}`;
    })
    .join(' ');

  const latest = latestFinite(values);

  return (
    <Stack gap={2} align="center">
      <svg viewBox={`0 0 ${svgW} ${svgH}`} width="100%" height={svgH} preserveAspectRatio="none">
        <polyline
          points={points}
          fill="none"
          stroke="#5e35b1"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <Group gap={8} justify="center">
        <Text size="xs" c="dimmed">{card.variable}</Text>
        <Text size="xs" fw={600}>{latest != null ? latest.toFixed(2) : 'N/A'}</Text>
      </Group>
    </Stack>
  );
}

// --- Comparison ---

function ComparisonContent({ card, run }: { card: DashboardCard; run: ScenarioRunResult }) {
  const vars = card.variables && card.variables.length > 0 ? card.variables : [];
  if (vars.length === 0) {
    return <Text size="xs" c="dimmed">No variables selected for comparison.</Text>;
  }

  const time = run.series.time ?? [];
  const data = time.map((t, i) => {
    const row: Record<string, number> = { time: t };
    for (const v of vars) {
      row[v] = (run.series[v] ?? [])[i] ?? Number.NaN;
    }
    return row;
  });

  const yDomain: [number | string, number | string] = [
    card.y_min != null ? card.y_min : 'auto',
    card.y_max != null ? card.y_max : 'auto',
  ];

  return (
    <Box h={220}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          {card.show_grid !== false && <CartesianGrid strokeDasharray="3 3" />}
          <XAxis dataKey="time" />
          <YAxis domain={yDomain} />
          <Tooltip />
          {card.show_legend !== false && <Legend />}
          {vars.map((v, i) => (
            <Line
              key={v}
              type="monotone"
              dataKey={v}
              stroke={COMPARISON_COLORS[i % COMPARISON_COLORS.length]}
              dot={card.show_data_points ?? false}
              strokeWidth={2}
            />
          ))}
          {card.reference_line != null && (
            <ReferenceLine y={card.reference_line} stroke="#888" strokeDasharray="4 4" label="Ref" />
          )}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

// --- Main CardContent ---

function CardContent({
  card,
  run,
  dataTableCache,
}: {
  card: DashboardCard;
  run: ScenarioRunResult | null;
  dataTableCache: Map<string, DataTableCacheEntry>;
}) {
  // Data-backed cards
  if (isDataCard(card.type)) {
    if (!card.data_table_id) {
      return <Text size="xs" c="dimmed">No data table selected.</Text>;
    }
    const entry = dataTableCache.get(card.data_table_id);
    if (!entry || entry.loading) {
      return <Text size="xs" c="dimmed">Loading data...</Text>;
    }
    if (entry.error || !entry.data) {
      return <Alert color="red" variant="light">Data table not found.</Alert>;
    }
    const table = entry.data;
    switch (card.type) {
      case 'data_bar': return <DataBarCardContent card={card} table={table} />;
      case 'data_stacked_bar': return <DataBarCardContent card={card} table={table} stacked />;
      case 'data_area': return <DataAreaCardContent card={card} table={table} />;
      case 'data_pie': return <DataPieCardContent card={card} table={table} />;
      case 'data_table': return <DataTableCardContent card={card} table={table} />;
      case 'data_pivot': return <DataPivotCardContent card={card} table={table} />;
    }
  }

  // Map card doesn't require a single variable
  if (card.type === 'map') {
    return <MapCardContent card={card} run={run} />;
  }

  if (!run) {
    return <Text size="sm" c="dimmed">Run dashboard to load data.</Text>;
  }

  // Multi-variable cards don't use card.variable
  if (card.type === 'heatmap') {
    return <HeatmapContent card={card} run={run} />;
  }
  if (card.type === 'comparison') {
    return <ComparisonContent card={card} run={run} />;
  }

  // Single-variable cards — check variable exists
  if (!run.series[card.variable]) {
    return <Alert color="yellow" variant="light">Variable &ldquo;{card.variable}&rdquo; is missing in selected scenario.</Alert>;
  }

  if (card.type === 'kpi') {
    const value = latestFinite(run.series[card.variable]);
    const decimals = card.decimals ?? 4;
    const suffix = card.unit_suffix ?? '';
    return (
      <Stack gap={6}>
        <Text size="xs" c="dimmed">Latest value</Text>
        <Text fw={700} size="xl">
          {value == null ? 'N/A' : `${value.toFixed(decimals)}${suffix}`}
        </Text>
      </Stack>
    );
  }

  if (card.type === 'line') {
    const rows = lineRows(run, card.variable);
    const yDomain: [number | string, number | string] = [
      card.y_min != null ? card.y_min : 'auto',
      card.y_max != null ? card.y_max : 'auto',
    ];
    const strokeDash = card.line_style === 'dashed' ? '8 4' : card.line_style === 'dotted' ? '2 2' : undefined;
    return (
      <Box h={220}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows}>
            {card.show_grid !== false && <CartesianGrid strokeDasharray="3 3" />}
            <XAxis dataKey="time" />
            <YAxis domain={yDomain} />
            <Tooltip />
            {card.show_legend !== false && <Legend />}
            <Line
              type="monotone"
              dataKey="value"
              stroke={card.line_color ?? '#5e35b1'}
              dot={card.show_data_points ?? false}
              strokeWidth={2}
              strokeDasharray={strokeDash}
            />
            {card.reference_line != null && (
              <ReferenceLine y={card.reference_line} stroke="#888" strokeDasharray="4 4" label="Ref" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </Box>
    );
  }

  if (card.type === 'sparkline') {
    return <SparklineContent card={card} run={run} />;
  }

  // table (default)
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

type ResizeState = {
  cardId: string;
  pointerId: number;
  startX: number;
  startY: number;
  originW: number;
  originH: number;
};

type Props = {
  cards: DashboardCard[];
  selectedRun: ScenarioRunResult | null;
  activeDashboardId: string;
  onUpdateCard: (dashboardId: string, cardId: string, patch: Partial<DashboardCard>) => void;
  onDeleteCard: (dashboardId: string, cardId: string) => void;
  variableOptions: Array<{ value: string; label: string }>;
  selectedCardId: string | null;
  onSelectCard: (cardId: string | null) => void;
};

export function DashboardCanvasPanel({ cards, selectedRun, activeDashboardId, onUpdateCard, onDeleteCard, variableOptions, selectedCardId, onSelectCard }: Props) {
  const sortedCards = useMemo(
    () => cards.slice().sort((a, b) => a.order - b.order),
    [cards],
  );

  const dataTableIds = useMemo(() => {
    const ids = new Set<string>();
    for (const card of sortedCards) {
      if (card.data_table_id && isDataCard(card.type)) {
        ids.add(card.data_table_id);
      }
    }
    return Array.from(ids);
  }, [sortedCards]);

  const dataTableCache = useDataTableCache(dataTableIds);

  const [cardLayout, setCardLayout] = useState<Record<string, Rect>>({});
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const cardLayoutRef = useRef<Record<string, Rect>>({});

  const layoutSeed = useMemo(() => computeSeedLayout(sortedCards), [sortedCards]);

  useEffect(() => {
    setCardLayout(layoutSeed);
  }, [layoutSeed, activeDashboardId]);

  useEffect(() => {
    cardLayoutRef.current = cardLayout;
  }, [cardLayout]);

  // Persist layout for cards missing explicit positions
  useEffect(() => {
    for (const card of sortedCards) {
      const resolved = layoutSeed[card.id];
      if (!resolved) continue;
      const missingLayout =
        !Number.isFinite(card.x) ||
        !Number.isFinite(card.y) ||
        !Number.isFinite(card.w) ||
        !Number.isFinite(card.h);
      if (!missingLayout) continue;
      onUpdateCard(activeDashboardId, card.id, {
        x: resolved.x,
        y: resolved.y,
        w: resolved.w,
        h: resolved.h,
      });
    }
  }, [sortedCards, layoutSeed, activeDashboardId, onUpdateCard]);

  const canvasHeight = useMemo(() => {
    const maxBottom = sortedCards.reduce((max, card) => {
      const rect = cardLayout[card.id] ?? layoutSeed[card.id];
      if (!rect) return max;
      return Math.max(max, rect.y + rect.h + 24);
    }, CANVAS_MIN_HEIGHT);
    return Math.max(CANVAS_MIN_HEIGHT, maxBottom);
  }, [sortedCards, cardLayout, layoutSeed]);

  // Drag logic
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
      if (!canvasRef.current) {
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
      onUpdateCard(activeDashboardId, dragState.cardId, {
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
  }, [dragState, sortedCards, layoutSeed, canvasHeight, activeDashboardId, onUpdateCard]);

  // Resize logic
  const beginResize = (event: React.PointerEvent<HTMLDivElement>, cardId: string) => {
    const rect = cardLayoutRef.current[cardId];
    if (!rect) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    event.stopPropagation();
    setResizeState({
      cardId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originW: rect.w,
      originH: rect.h,
    });
  };

  useEffect(() => {
    if (!resizeState) return;

    const onPointerMove = (event: PointerEvent) => {
      const currentRect = cardLayoutRef.current[resizeState.cardId];
      if (!currentRect) return;
      const deltaX = event.clientX - resizeState.startX;
      const deltaY = event.clientY - resizeState.startY;
      const snappedW = Math.max(MIN_CARD_WIDTH, snapToGrid(resizeState.originW + deltaX));
      const snappedH = Math.max(MIN_CARD_HEIGHT, snapToGrid(resizeState.originH + deltaY));
      setCardLayout((prev) => ({
        ...prev,
        [resizeState.cardId]: { ...currentRect, w: snappedW, h: snappedH },
      }));
    };

    const onPointerUp = () => {
      const finalRect = cardLayoutRef.current[resizeState.cardId];
      if (finalRect) {
        onUpdateCard(activeDashboardId, resizeState.cardId, {
          w: finalRect.w,
          h: finalRect.h,
        });
      }
      setResizeState(null);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };
  }, [resizeState, activeDashboardId, onUpdateCard]);

  if (sortedCards.length === 0) {
    return (
      <Box
        style={{
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#adb5bd',
        }}
      >
        <Text size="sm" c="dimmed">Add cards to build your dashboard</Text>
      </Box>
    );
  }

  return (
    <Box
      ref={canvasRef}
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelectCard(null);
      }}
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
            onClick={() => onSelectCard(card.id === selectedCardId ? null : card.id)}
            style={{
              position: 'absolute',
              left: rect.x,
              top: rect.y,
              width: rect.w,
              height: rect.h,
              overflow: 'hidden',
              cursor: 'pointer',
              outline: card.id === selectedCardId ? '2px solid var(--mantine-color-blue-5)' : undefined,
              outlineOffset: card.id === selectedCardId ? -1 : undefined,
            }}
          >
            <Stack gap="xs" h="100%">
              <Group justify="space-between" wrap="nowrap">
                <Group gap={6} wrap="nowrap" style={{ flex: 1, minWidth: 0 }}>
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
                <Group gap={4} wrap="nowrap">
                  <Badge variant="light" size="sm">{CARD_TYPE_LABEL[card.type] ?? card.type.toUpperCase()}</Badge>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    color="red"
                    onClick={(e) => { e.stopPropagation(); onDeleteCard(activeDashboardId, card.id); }}
                  >
                    <IconTrash size={14} />
                  </ActionIcon>
                </Group>
              </Group>
              <Box style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
                <CardContent card={card} run={selectedRun} dataTableCache={dataTableCache} />
              </Box>
            </Stack>
            <div
              onPointerDown={(event) => beginResize(event, card.id)}
              style={{
                position: 'absolute',
                right: 0,
                bottom: 0,
                width: 16,
                height: 16,
                cursor: 'nwse-resize',
                background: 'linear-gradient(135deg, transparent 50%, rgba(0,0,0,0.15) 50%)',
                borderRadius: '0 0 8px 0',
                zIndex: 10,
              }}
            />
          </Card>
        );
      })}
    </Box>
  );
}
