import { useCallback, useEffect, useRef, useMemo } from 'react';
import { Badge, Box, Text, ActionIcon, Tooltip } from '@mantine/core';
import { IconArrowsMaximize } from '@tabler/icons-react';
import type { AnalysisNode, AnalysisEdge } from '../../types/model';

type Props = {
  stages: AnalysisNode[];
  edges: AnalysisEdge[];
  focusedStageId: string | null;
  onFocusStage: (stageId: string | null) => void;
};

const CARD_W = 180;
const CARD_H = 80;
const COL_GAP = 60;
const ROW_GAP = 16;
const STRIP_PAD = 16;

const STAGE_COLORS: Record<string, { bg: string; border: string; text: string; activeBg: string }> = {
  blue: { bg: '#f0f3ff', border: '#4263eb', text: '#364fc7', activeBg: '#dbe4ff' },
  green: { bg: '#ebfbee', border: '#2f9e44', text: '#2b8a3e', activeBg: '#d3f9d8' },
  orange: { bg: '#fff4e6', border: '#e67700', text: '#d9480f', activeBg: '#ffe8cc' },
  grape: { bg: '#f8f0fc', border: '#9c36b5', text: '#862e9c', activeBg: '#eebefa' },
  teal: { bg: '#e6fcf5', border: '#087f8c', text: '#0b7285', activeBg: '#c3fae8' },
  gray: { bg: '#f8f9fa', border: '#868e96', text: '#495057', activeBg: '#e9ecef' },
};

type StageEdge = { from: string; to: string };

function buildStageEdges(stages: AnalysisNode[], edges: AnalysisEdge[]): StageEdge[] {
  const stageIds = new Set(stages.map((s) => s.id));
  const result: StageEdge[] = [];
  const seen = new Set<string>();
  for (const edge of edges) {
    if (stageIds.has(edge.source) && stageIds.has(edge.target) && edge.source !== edge.target) {
      const key = `${edge.source}->${edge.target}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push({ from: edge.source, to: edge.target });
      }
    }
  }
  return result;
}

/** Assign column (rank) and row (lane) to each stage for a branching DAG layout. */
function layoutStages(
  stages: AnalysisNode[],
  stageEdges: StageEdge[],
): Map<string, { col: number; row: number }> {
  const ids = stages.map((s) => s.id);
  const idSet = new Set(ids);
  const children = new Map<string, string[]>(ids.map((id) => [id, []]));
  const parents = new Map<string, string[]>(ids.map((id) => [id, []]));
  const indegree = new Map<string, number>(ids.map((id) => [id, 0]));

  for (const edge of stageEdges) {
    if (!idSet.has(edge.from) || !idSet.has(edge.to)) continue;
    children.get(edge.from)!.push(edge.to);
    parents.get(edge.to)!.push(edge.from);
    indegree.set(edge.to, (indegree.get(edge.to) ?? 0) + 1);
  }

  // Topological rank assignment (longest path)
  const rank = new Map<string, number>(ids.map((id) => [id, 0]));
  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0);
  const processed = new Set<string>();
  const topoOrder: string[] = [];

  // BFS with longest-path ranking
  const remaining = new Map(indegree);
  const bfsQueue = [...queue];
  while (bfsQueue.length > 0) {
    const curr = bfsQueue.shift()!;
    if (processed.has(curr)) continue;
    processed.add(curr);
    topoOrder.push(curr);
    for (const child of children.get(curr) ?? []) {
      rank.set(child, Math.max(rank.get(child) ?? 0, (rank.get(curr) ?? 0) + 1));
      remaining.set(child, (remaining.get(child) ?? 1) - 1);
      if ((remaining.get(child) ?? 0) <= 0) bfsQueue.push(child);
    }
  }
  // Handle any unprocessed (cycles)
  for (const id of ids) {
    if (!processed.has(id)) topoOrder.push(id);
  }

  // Detect main path: stages with stageRole === 'main'
  const mainIds = new Set(stages.filter((s) => s.stageRole === 'main').map((s) => s.id));

  // Assign rows within each column. Main path gets row 0, branches get row 1, 2, etc.
  const colSlots = new Map<number, { main: string[]; branch: string[] }>();
  for (const id of topoOrder) {
    const col = rank.get(id) ?? 0;
    if (!colSlots.has(col)) colSlots.set(col, { main: [], branch: [] });
    const slot = colSlots.get(col)!;
    if (mainIds.has(id)) slot.main.push(id);
    else slot.branch.push(id);
  }

  const positions = new Map<string, { col: number; row: number }>();
  for (const [col, slot] of colSlots) {
    let row = 0;
    for (const id of slot.main) { positions.set(id, { col, row }); row++; }
    for (const id of slot.branch) { positions.set(id, { col, row }); row++; }
  }

  return positions;
}

function StageCard({
  stage,
  focused,
  onClick,
}: {
  stage: AnalysisNode;
  focused: boolean;
  onClick: () => void;
}) {
  const colorKey = stage.groupColor ?? 'blue';
  const color = STAGE_COLORS[colorKey] ?? STAGE_COLORS.blue;
  const stageNodeCount = stage.stageNodeCount ?? 0;

  return (
    <Box
      onClick={onClick}
      style={{
        width: CARD_W,
        height: CARD_H,
        borderRadius: 12,
        border: focused ? `2px solid ${color.border}` : `1.5px solid ${color.border}55`,
        background: focused ? color.activeBg : color.bg,
        padding: '8px 10px',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        flexShrink: 0,
        transition: 'all 150ms ease',
        boxShadow: focused ? `0 0 0 2px ${color.border}22` : '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <Text fw={600} size="xs" c={color.text} lineClamp={1}>{stage.name || 'Stage'}</Text>
      {stage.stagePurpose && (
        <Text size="xs" c="dimmed" lineClamp={1} style={{ fontSize: 10 }}>{stage.stagePurpose}</Text>
      )}
      <Box style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge size="xs" variant="light" color="gray">{stageNodeCount} steps</Badge>
        <Badge size="xs" variant="dot" color={stage.stageRole === 'branch' ? 'gray' : 'teal'}>
          {stage.stageRole === 'branch' ? 'Branch' : 'Main'}
        </Badge>
      </Box>
    </Box>
  );
}

export function StageFlowStrip({ stages, edges, focusedStageId, onFocusStage }: Props) {
  const stageEdges = useMemo(() => buildStageEdges(stages, edges), [stages, edges]);
  const positions = useMemo(() => layoutStages(stages, stageEdges), [stages, stageEdges]);
  const containerRef = useRef<HTMLDivElement>(null);

  // Compute card pixel positions from grid positions
  const cardPositions = useMemo(() => {
    const result = new Map<string, { x: number; y: number }>();
    for (const stage of stages) {
      const pos = positions.get(stage.id) ?? { col: 0, row: 0 };
      result.set(stage.id, {
        x: STRIP_PAD + pos.col * (CARD_W + COL_GAP),
        y: STRIP_PAD + pos.row * (CARD_H + ROW_GAP),
      });
    }
    return result;
  }, [stages, positions]);

  // Compute total dimensions
  const { totalWidth, totalHeight } = useMemo(() => {
    let maxX = 0;
    let maxY = 0;
    for (const pos of cardPositions.values()) {
      maxX = Math.max(maxX, pos.x + CARD_W);
      maxY = Math.max(maxY, pos.y + CARD_H);
    }
    return { totalWidth: maxX + STRIP_PAD, totalHeight: maxY + STRIP_PAD };
  }, [cardPositions]);

  // Scroll focused stage into view
  useEffect(() => {
    if (focusedStageId && containerRef.current) {
      const pos = cardPositions.get(focusedStageId);
      if (pos) {
        containerRef.current.scrollTo({ left: pos.x - 60, behavior: 'smooth' });
      }
    }
  }, [focusedStageId, cardPositions]);

  const handleStageClick = useCallback(
    (stageId: string) => {
      onFocusStage(focusedStageId === stageId ? null : stageId);
    },
    [focusedStageId, onFocusStage],
  );

  if (stages.length === 0) return null;

  return (
    <Box style={{
      borderBottom: '1px solid var(--mantine-color-gray-3)',
      background: 'linear-gradient(180deg, #fafbfc 0%, #f1f3f5 100%)',
      flexShrink: 0,
      position: 'relative',
    }}>
      {focusedStageId && (
        <Box style={{ position: 'absolute', top: 6, right: 8, zIndex: 2 }}>
          <Tooltip label="Show all stages on canvas">
            <ActionIcon size="xs" variant="light" color="gray" onClick={() => onFocusStage(null)}>
              <IconArrowsMaximize size={12} />
            </ActionIcon>
          </Tooltip>
        </Box>
      )}

      <div
        ref={containerRef}
        style={{
          overflowX: 'auto',
          overflowY: 'hidden',
          position: 'relative',
          height: totalHeight,
        }}
      >
        <div style={{ position: 'relative', width: totalWidth, height: '100%' }}>
          {/* SVG edge layer */}
          <svg style={{ position: 'absolute', top: 0, left: 0, width: totalWidth, height: '100%', pointerEvents: 'none' }}>
            {stageEdges.map((edge) => {
              const fromPos = cardPositions.get(edge.from);
              const toPos = cardPositions.get(edge.to);
              if (!fromPos || !toPos) return null;

              const x1 = fromPos.x + CARD_W;
              const y1 = fromPos.y + CARD_H / 2;
              const x2 = toPos.x;
              const y2 = toPos.y + CARD_H / 2;
              const cx1 = x1 + (x2 - x1) * 0.4;
              const cx2 = x1 + (x2 - x1) * 0.6;

              const isFocusedEdge = focusedStageId
                ? edge.from === focusedStageId || edge.to === focusedStageId
                : true;

              return (
                <g key={`${edge.from}-${edge.to}`}>
                  <path
                    d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
                    fill="none"
                    stroke={isFocusedEdge ? '#495057' : '#ced4da'}
                    strokeWidth={isFocusedEdge ? 1.5 : 1}
                    opacity={isFocusedEdge ? 0.7 : 0.35}
                  />
                  <polygon
                    points={`${x2},${y2} ${x2 - 5},${y2 - 3} ${x2 - 5},${y2 + 3}`}
                    fill={isFocusedEdge ? '#495057' : '#ced4da'}
                    opacity={isFocusedEdge ? 0.7 : 0.35}
                  />
                </g>
              );
            })}
          </svg>

          {/* Stage cards */}
          {stages.map((stage) => {
            const pos = cardPositions.get(stage.id);
            if (!pos) return null;
            return (
              <div key={stage.id} style={{ position: 'absolute', left: pos.x, top: pos.y }}>
                <StageCard
                  stage={stage}
                  focused={focusedStageId === stage.id}
                  onClick={() => handleStageClick(stage.id)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </Box>
  );
}
