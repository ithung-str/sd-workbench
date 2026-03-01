import { useMemo } from 'react';
import { Box, Group, Slider, Stack, Text } from '@mantine/core';
import { formatCompact, formatValue } from '../../lib/formatNumber';
import { useEditorStore } from '../../state/editorStore';
import type { DashboardCard, ModelDocument, ScenarioRunResult, StockNode } from '../../types/model';

const PADDING = 40;
const MIN_RADIUS = 6;
const MAX_RADIUS = 28;

type GeoStock = {
  id: string;
  name: string;
  label: string;
  geoX: number;
  geoY: number;
};

type FlowLine = {
  key: string;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
};

export function MapCardContent({
  card,
  run,
}: {
  card: DashboardCard;
  run: ScenarioRunResult | null;
}) {
  const model = useEditorStore((s) => s.model) as ModelDocument;
  const activeDashboardId = useEditorStore((s) => s.activeDashboardId);
  const updateDashboardCard = useEditorStore((s) => s.updateDashboardCard);

  // Collect stocks with geo coordinates
  const geoStocks = useMemo<GeoStock[]>(() => {
    return model.nodes
      .filter((n): n is StockNode => n.type === 'stock' && n.geo_x != null && n.geo_y != null)
      .map((n) => ({
        id: n.id,
        name: n.name,
        label: n.label,
        geoX: n.geo_x!,
        geoY: n.geo_y!,
      }));
  }, [model.nodes]);

  // Compute flow connections between stocks (stock → flow → stock)
  const flowLines = useMemo<FlowLine[]>(() => {
    if (geoStocks.length < 2) return [];
    const geoById = new Map(geoStocks.map((s) => [s.id, s]));
    const flowIds = new Set(model.nodes.filter((n) => n.type === 'flow').map((n) => n.id));

    // Build: flow_id → { sourceStockIds, targetStockIds }
    const flowConnections = new Map<string, { sources: string[]; targets: string[] }>();
    for (const edge of model.edges) {
      if (edge.type !== 'flow_link') continue;
      if (flowIds.has(edge.source) && geoById.has(edge.target)) {
        // flow → stock (inflow)
        const conn = flowConnections.get(edge.source) ?? { sources: [], targets: [] };
        conn.targets.push(edge.target);
        flowConnections.set(edge.source, conn);
      }
      if (geoById.has(edge.source) && flowIds.has(edge.target)) {
        // stock → flow (outflow)
        const conn = flowConnections.get(edge.target) ?? { sources: [], targets: [] };
        conn.sources.push(edge.source);
        flowConnections.set(edge.target, conn);
      }
    }

    const lines: FlowLine[] = [];
    for (const [flowId, conn] of flowConnections) {
      for (const srcId of conn.sources) {
        for (const tgtId of conn.targets) {
          const src = geoById.get(srcId);
          const tgt = geoById.get(tgtId);
          if (src && tgt) {
            lines.push({
              key: `${flowId}-${srcId}-${tgtId}`,
              fromX: src.geoX,
              fromY: src.geoY,
              toX: tgt.geoX,
              toY: tgt.geoY,
            });
          }
        }
      }
    }
    return lines;
  }, [geoStocks, model.nodes, model.edges]);

  // Time series info
  const timeValues = run?.series.time ?? [];
  const timeIndex = card.time_index ?? (timeValues.length > 0 ? timeValues.length - 1 : 0);
  const currentTime = timeValues[timeIndex] ?? 0;

  // Compute normalized values for scaling
  const stockValues = useMemo(() => {
    if (!run) return new Map<string, number>();
    const map = new Map<string, number>();
    for (const s of geoStocks) {
      const series = run.series[s.name];
      if (series) map.set(s.id, series[timeIndex] ?? 0);
    }
    return map;
  }, [run, geoStocks, timeIndex]);

  const { minVal, maxVal } = useMemo(() => {
    const vals = Array.from(stockValues.values()).filter(Number.isFinite);
    if (vals.length === 0) return { minVal: 0, maxVal: 1 };
    return { minVal: Math.min(...vals), maxVal: Math.max(...vals) };
  }, [stockValues]);

  if (geoStocks.length === 0) {
    return (
      <Text size="sm" c="dimmed">
        No stocks have geo coordinates. Set X/Y values in the Formulas page.
      </Text>
    );
  }

  // Compute SVG bounds from geo coordinates
  const bounds = useMemo(() => {
    const xs = geoStocks.map((s) => s.geoX);
    const ys = geoStocks.map((s) => s.geoY);
    return {
      minX: Math.min(...xs),
      maxX: Math.max(...xs),
      minY: Math.min(...ys),
      maxY: Math.max(...ys),
    };
  }, [geoStocks]);

  const dataWidth = Math.max(1, bounds.maxX - bounds.minX);
  const dataHeight = Math.max(1, bounds.maxY - bounds.minY);
  const viewBox = `${bounds.minX - PADDING} ${bounds.minY - PADDING} ${dataWidth + PADDING * 2} ${dataHeight + PADDING * 2}`;

  const radiusForStock = (stockId: string): number => {
    if (!run || maxVal === minVal) return (MIN_RADIUS + MAX_RADIUS) / 2;
    const val = stockValues.get(stockId) ?? 0;
    const normalized = (val - minVal) / (maxVal - minVal);
    return MIN_RADIUS + normalized * (MAX_RADIUS - MIN_RADIUS);
  };

  const labelSize = Math.max(3, (dataWidth + dataHeight) / 2 * 0.04);

  return (
    <Stack gap={4} h="100%">
      <Box style={{ flex: 1, minHeight: 0 }}>
        <svg
          width="100%"
          height="100%"
          viewBox={viewBox}
          preserveAspectRatio="xMidYMid meet"
          style={{ display: 'block' }}
        >
          {/* Flow lines */}
          {flowLines.map((line) => (
            <line
              key={line.key}
              x1={line.fromX}
              y1={line.fromY}
              x2={line.toX}
              y2={line.toY}
              stroke="#9ca8c6"
              strokeWidth={Math.max(1, labelSize * 0.3)}
              strokeLinecap="round"
            />
          ))}
          {/* Stock dots */}
          {geoStocks.map((s) => {
            const r = radiusForStock(s.id);
            const val = stockValues.get(s.id);
            return (
              <g key={s.id}>
                <circle
                  cx={s.geoX}
                  cy={s.geoY}
                  r={r}
                  fill="#5e35b1"
                  fillOpacity={0.7}
                  stroke="#fff"
                  strokeWidth={Math.max(0.5, labelSize * 0.15)}
                />
                <text
                  x={s.geoX}
                  y={s.geoY + r + labelSize * 1.2}
                  textAnchor="middle"
                  fontSize={labelSize}
                  fill="#333"
                >
                  {s.label}
                </text>
                {val != null && Number.isFinite(val) && (
                  <text
                    x={s.geoX}
                    y={s.geoY + r + labelSize * 2.4}
                    textAnchor="middle"
                    fontSize={labelSize * 0.8}
                    fill="#888"
                  >
                    {formatValue(val)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </Box>
      {run && (
        <Group gap="md" px={4} justify="center">
          <Group gap={4}>
            <svg width={12} height={12}><circle cx={6} cy={6} r={4} fill="#5e35b1" fillOpacity={0.7} /></svg>
            <Text size="xs" c="dimmed">Stock</Text>
          </Group>
          <Group gap={4}>
            <svg width={16} height={12}><line x1={0} y1={6} x2={16} y2={6} stroke="#9ca8c6" strokeWidth={2} /></svg>
            <Text size="xs" c="dimmed">Flow</Text>
          </Group>
          <Text size="xs" c="dimmed">
            Size = value ({formatCompact(minVal)} – {formatCompact(maxVal)})
          </Text>
        </Group>
      )}
      {timeValues.length > 1 && (
        <Stack gap={2} px={4}>
          <Text size="xs" c="dimmed" ta="center">
            t = {Number.isFinite(currentTime) ? formatValue(currentTime) : '—'}
          </Text>
          <Slider
            size="xs"
            min={0}
            max={timeValues.length - 1}
            value={timeIndex}
            onChange={(v) => {
              if (activeDashboardId) {
                updateDashboardCard(activeDashboardId, card.id, { time_index: v });
              }
            }}
            label={null}
          />
        </Stack>
      )}
    </Stack>
  );
}
