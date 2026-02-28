import { describe, expect, it } from 'vitest';
import {
  DASHBOARD_GRID_SIZE,
  findNearestFreeRect,
  firstFreeRect,
  rectsOverlap,
  snapToGrid,
  type Rect,
} from './dashboardLayout';

describe('dashboardLayout', () => {
  it('snaps coordinates to a 24px grid', () => {
    expect(snapToGrid(11)).toBe(0);
    expect(snapToGrid(12)).toBe(DASHBOARD_GRID_SIZE);
    expect(snapToGrid(49)).toBe(48);
  });

  it('finds a nearest non-overlapping rect', () => {
    const occupied: Rect[] = [{ x: 24, y: 24, w: 264, h: 156 }];
    const candidate: Rect = { x: 24, y: 24, w: 264, h: 156 };
    const resolved = findNearestFreeRect(candidate, occupied, { width: 1200, height: 900 });
    expect(resolved).not.toBeNull();
    if (!resolved) return;
    expect(rectsOverlap(resolved, occupied[0])).toBe(false);
    expect(resolved.x % DASHBOARD_GRID_SIZE).toBe(0);
    expect(resolved.y % DASHBOARD_GRID_SIZE).toBe(0);
  });

  it('finds a free slot for new cards', () => {
    const occupied: Rect[] = [
      { x: 24, y: 24, w: 264, h: 156 },
      { x: 312, y: 24, w: 264, h: 156 },
    ];
    const next = firstFreeRect({ w: 264, h: 156 }, occupied, { width: 1200, height: 900 });
    expect(rectsOverlap(next, occupied[0])).toBe(false);
    expect(rectsOverlap(next, occupied[1])).toBe(false);
  });
});
