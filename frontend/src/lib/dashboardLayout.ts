import type { DashboardCard, DashboardCardType } from '../types/model';

export const DASHBOARD_GRID_SIZE = 24;
export const MIN_CARD_WIDTH = 168;
export const MIN_CARD_HEIGHT = 120;
export const CARD_GAP = 12;
const DEFAULT_CANVAS_WIDTH = 1400;
const DEFAULT_CANVAS_HEIGHT = 1200;
const DEFAULT_PADDING = 24;

export type Rect = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CanvasBounds = {
  width: number;
  height: number;
  padding?: number;
};

export function defaultCardSize(type: DashboardCardType): { w: number; h: number } {
  if (type === 'kpi') return { w: 264, h: 156 };
  if (type === 'line') return { w: 576, h: 336 };
  if (type === 'sparkline') return { w: 264, h: 120 };
  if (type === 'comparison') return { w: 576, h: 336 };
  if (type === 'heatmap') return { w: 648, h: 336 };
  if (type === 'map') return { w: 576, h: 456 };
  if (type === 'data_bar' || type === 'data_stacked_bar' || type === 'data_area') return { w: 576, h: 336 };
  if (type === 'data_pie') return { w: 384, h: 384 };
  if (type === 'data_table') return { w: 576, h: 372 };
  if (type === 'data_pivot') return { w: 480, h: 336 };
  return { w: 576, h: 372 };
}

export function resolveCardRect(card: Pick<DashboardCard, 'type' | 'x' | 'y' | 'w' | 'h'>): Rect {
  const fallback = defaultCardSize(card.type);
  return {
    x: Number.isFinite(card.x) ? Number(card.x) : 0,
    y: Number.isFinite(card.y) ? Number(card.y) : 0,
    w: Number.isFinite(card.w) ? Number(card.w) : fallback.w,
    h: Number.isFinite(card.h) ? Number(card.h) : fallback.h,
  };
}

export function snapToGrid(value: number, gridSize = DASHBOARD_GRID_SIZE): number {
  return Math.round(value / gridSize) * gridSize;
}

export function rectsOverlap(a: Rect, b: Rect, gap = CARD_GAP): boolean {
  return a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;
}

export function clampRectToBounds(rect: Rect, bounds: CanvasBounds): Rect {
  const padding = bounds.padding ?? DEFAULT_PADDING;
  const maxX = Math.max(padding, bounds.width - rect.w - padding);
  const maxY = Math.max(padding, bounds.height - rect.h - padding);
  return {
    ...rect,
    x: Math.min(maxX, Math.max(padding, rect.x)),
    y: Math.min(maxY, Math.max(padding, rect.y)),
  };
}

export function isRectFree(candidate: Rect, occupied: Rect[]): boolean {
  return occupied.every((rect) => !rectsOverlap(candidate, rect));
}

export function findNearestFreeRect(candidate: Rect, occupied: Rect[], bounds: CanvasBounds, maxRadius = 30): Rect | null {
  const snappedCandidate = clampRectToBounds(
    {
      ...candidate,
      x: snapToGrid(candidate.x),
      y: snapToGrid(candidate.y),
    },
    bounds,
  );

  if (isRectFree(snappedCandidate, occupied)) return snappedCandidate;

  for (let radius = 1; radius <= maxRadius; radius += 1) {
    for (let dx = -radius; dx <= radius; dx += 1) {
      for (let dy = -radius; dy <= radius; dy += 1) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
        const option = clampRectToBounds(
          {
            ...snappedCandidate,
            x: snappedCandidate.x + dx * DASHBOARD_GRID_SIZE,
            y: snappedCandidate.y + dy * DASHBOARD_GRID_SIZE,
          },
          bounds,
        );
        if (isRectFree(option, occupied)) return option;
      }
    }
  }
  return null;
}

export function firstFreeRect(
  size: { w: number; h: number },
  occupied: Rect[],
  bounds: CanvasBounds = { width: DEFAULT_CANVAS_WIDTH, height: DEFAULT_CANVAS_HEIGHT },
): Rect {
  const padding = bounds.padding ?? DEFAULT_PADDING;
  const maxY = Math.max(padding, bounds.height - size.h - padding);
  const maxX = Math.max(padding, bounds.width - size.w - padding);

  for (let y = padding; y <= maxY; y += DASHBOARD_GRID_SIZE) {
    for (let x = padding; x <= maxX; x += DASHBOARD_GRID_SIZE) {
      const candidate: Rect = { x, y, w: size.w, h: size.h };
      if (isRectFree(candidate, occupied)) return candidate;
    }
  }
  return { x: padding, y: padding, w: size.w, h: size.h };
}
