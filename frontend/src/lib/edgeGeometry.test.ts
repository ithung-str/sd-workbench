import { describe, expect, it } from 'vitest';
import { rectBorderPoint, ellipseBorderPoint, nodeBorderPoint } from './edgeGeometry';

describe('rectBorderPoint', () => {
  const rect = { x: 0, y: 0, width: 100, height: 60 };

  it('returns right edge when target is to the right', () => {
    const p = rectBorderPoint(rect, { x: 200, y: 30 });
    expect(p.x).toBeCloseTo(100);
    expect(p.y).toBeCloseTo(30);
  });

  it('returns left edge when target is to the left', () => {
    const p = rectBorderPoint(rect, { x: -100, y: 30 });
    expect(p.x).toBeCloseTo(0);
    expect(p.y).toBeCloseTo(30);
  });

  it('returns top edge when target is above', () => {
    const p = rectBorderPoint(rect, { x: 50, y: -100 });
    expect(p.y).toBeCloseTo(0);
  });

  it('returns bottom edge when target is below', () => {
    const p = rectBorderPoint(rect, { x: 50, y: 200 });
    expect(p.y).toBeCloseTo(60);
  });

  it('handles diagonal: exits through right edge', () => {
    const p = rectBorderPoint(rect, { x: 150, y: 50 });
    expect(p.x).toBeCloseTo(100);
    // y should be between center and bottom
    expect(p.y).toBeGreaterThan(30);
    expect(p.y).toBeLessThanOrEqual(60);
  });

  it('returns center when target is at center', () => {
    const p = rectBorderPoint(rect, { x: 50, y: 30 });
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(30);
  });
});

describe('ellipseBorderPoint', () => {
  it('returns right for target to the right', () => {
    const p = ellipseBorderPoint(50, 50, 30, 30, { x: 200, y: 50 });
    expect(p.x).toBeCloseTo(80);
    expect(p.y).toBeCloseTo(50);
  });

  it('returns top for target above', () => {
    const p = ellipseBorderPoint(50, 50, 30, 30, { x: 50, y: -100 });
    expect(p.x).toBeCloseTo(50);
    expect(p.y).toBeCloseTo(20);
  });
});

describe('nodeBorderPoint', () => {
  it('uses ellipse for cldSymbolNode', () => {
    const p = nodeBorderPoint('cldSymbolNode', { x: 0, y: 0 }, 30, 30, { x: 100, y: 15 });
    // Should be on the ellipse, not the rectangle corner
    const cx = 15, cy = 15;
    const dist = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2);
    expect(dist).toBeCloseTo(15, 0);
  });

  it('uses rectangle for stockNode', () => {
    const p = nodeBorderPoint('stockNode', { x: 0, y: 0 }, 220, 40, { x: 300, y: 20 });
    expect(p.x).toBeCloseTo(220);
  });
});
