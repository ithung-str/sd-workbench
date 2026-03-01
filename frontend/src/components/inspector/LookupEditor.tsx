import { useMemo, useState } from 'react';
import type { LookupInterpolation, LookupNode, LookupPoint, NodeModel } from '../../types/model';

function sortPoints(points: LookupPoint[]) {
  return [...points].sort((a, b) => a.x - b.x);
}

/**
 * Sample an interpolation curve between sorted lookup points and return an SVG path.
 *
 * Modes:
 *  - linear:      straight line segments between points
 *  - step:        horizontal-then-vertical staircase
 *  - cubic:       Catmull-Rom spline through all points (smooth, passes through every point)
 *  - exponential: piecewise exponential fit between consecutive points
 *  - s-curve:     Hermite-based sigmoid blend between consecutive points
 */
function previewPath(points: LookupPoint[], interpolation: LookupInterpolation, width = 220, height = 120) {
  if (points.length < 2) return '';
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rx = maxX - minX || 1;
  const ry = maxY - minY || 1;

  const toSvg = (px: number, py: number) => ({
    x: ((px - minX) / rx) * width,
    y: height - ((py - minY) / ry) * height,
  });

  // --- Step ---
  if (interpolation === 'step') {
    const parts: string[] = [];
    for (let i = 0; i < points.length; i++) {
      const cur = toSvg(points[i].x, points[i].y);
      if (i === 0) {
        parts.push(`M${cur.x.toFixed(2)},${cur.y.toFixed(2)}`);
      } else {
        parts.push(`H${cur.x.toFixed(2)}`);
        parts.push(`V${cur.y.toFixed(2)}`);
      }
    }
    return parts.join(' ');
  }

  // --- Cubic (Catmull-Rom spline) ---
  if (interpolation === 'cubic') {
    const SAMPLES_PER_SEGMENT = 16;
    const svgParts: string[] = [];
    for (let seg = 0; seg < points.length - 1; seg++) {
      const p0 = points[Math.max(seg - 1, 0)];
      const p1 = points[seg];
      const p2 = points[seg + 1];
      const p3 = points[Math.min(seg + 2, points.length - 1)];
      for (let s = 0; s <= SAMPLES_PER_SEGMENT; s++) {
        if (seg > 0 && s === 0) continue; // avoid duplicate at segment boundary
        const t = s / SAMPLES_PER_SEGMENT;
        const t2 = t * t;
        const t3 = t2 * t;
        const cx = 0.5 * (2 * p1.x + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
        const cy = 0.5 * (2 * p1.y + (-p0.y + p2.y) * t + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
        const sv = toSvg(cx, cy);
        svgParts.push(`${svgParts.length === 0 ? 'M' : 'L'}${sv.x.toFixed(2)},${sv.y.toFixed(2)}`);
      }
    }
    return svgParts.join(' ');
  }

  // --- Exponential (piecewise) ---
  if (interpolation === 'exponential') {
    const SAMPLES_PER_SEGMENT = 16;
    const svgParts: string[] = [];
    for (let seg = 0; seg < points.length - 1; seg++) {
      const p1 = points[seg];
      const p2 = points[seg + 1];
      for (let s = 0; s <= SAMPLES_PER_SEGMENT; s++) {
        if (seg > 0 && s === 0) continue;
        const t = s / SAMPLES_PER_SEGMENT;
        const ix = p1.x + (p2.x - p1.x) * t;
        // Exponential blend: y = y1 * (y2/y1)^t when both positive,
        // otherwise fall back to an exponential-shaped easing
        let iy: number;
        if (p1.y > 0 && p2.y > 0) {
          iy = p1.y * Math.pow(p2.y / p1.y, t);
        } else {
          // Exponential ease: use exp-based curve shape
          const easeT = (Math.exp(3 * t) - 1) / (Math.exp(3) - 1);
          iy = p1.y + (p2.y - p1.y) * easeT;
        }
        const sv = toSvg(ix, iy);
        svgParts.push(`${svgParts.length === 0 ? 'M' : 'L'}${sv.x.toFixed(2)},${sv.y.toFixed(2)}`);
      }
    }
    return svgParts.join(' ');
  }

  // --- S-curve (Hermite sigmoid blend) ---
  if (interpolation === 's-curve') {
    const SAMPLES_PER_SEGMENT = 20;
    const svgParts: string[] = [];
    for (let seg = 0; seg < points.length - 1; seg++) {
      const p1 = points[seg];
      const p2 = points[seg + 1];
      for (let s = 0; s <= SAMPLES_PER_SEGMENT; s++) {
        if (seg > 0 && s === 0) continue;
        const t = s / SAMPLES_PER_SEGMENT;
        const ix = p1.x + (p2.x - p1.x) * t;
        // Smoothstep (Hermite) sigmoid: 3t^2 - 2t^3
        const st = t * t * (3 - 2 * t);
        const iy = p1.y + (p2.y - p1.y) * st;
        const sv = toSvg(ix, iy);
        svgParts.push(`${svgParts.length === 0 ? 'M' : 'L'}${sv.x.toFixed(2)},${sv.y.toFixed(2)}`);
      }
    }
    return svgParts.join(' ');
  }

  // --- Linear (default) ---
  return points
    .map((p, i) => {
      const s = toSvg(p.x, p.y);
      return `${i === 0 ? 'M' : 'L'}${s.x.toFixed(2)},${s.y.toFixed(2)}`;
    })
    .join(' ');
}

/** Evaluate a simple math formula for x, supporting basic operations. */
function evaluateFormula(formula: string, x: number): number | null {
  try {
    // Build a safe evaluator with Math functions available
    const fn = new Function(
      'x',
      'Math',
      `"use strict"; return (${formula});`,
    );
    const result = fn(x, Math);
    return typeof result === 'number' && Number.isFinite(result) ? result : null;
  } catch {
    return null;
  }
}

function formulaToPoints(formula: string, range: { min: number; max: number; steps: number }): LookupPoint[] {
  const { min, max, steps } = range;
  const n = Math.max(2, Math.min(steps, 500));
  const result: LookupPoint[] = [];
  for (let i = 0; i <= n; i++) {
    const x = min + (i / n) * (max - min);
    const y = evaluateFormula(formula, x);
    if (y !== null) {
      result.push({ x, y });
    }
  }
  return result;
}

type LookupMode = 'points' | 'formula';

export function LookupEditor({
  node,
  onChange,
}: {
  node: LookupNode;
  onChange: (patch: Partial<NodeModel>) => void;
}) {
  const hasFormula = !!node.formula;
  const [mode, setMode] = useState<LookupMode>(hasFormula ? 'formula' : 'points');
  const interpolation: LookupInterpolation = node.interpolation ?? 'linear';
  const points = sortPoints(node.points ?? []);

  const formulaRange = node.formula_range ?? { min: 0, max: 10, steps: 50 };
  const formulaPoints = useMemo(
    () => (node.formula ? formulaToPoints(node.formula, formulaRange) : []),
    [node.formula, formulaRange],
  );

  const displayPoints = mode === 'formula' ? formulaPoints : points;
  const path = previewPath(displayPoints, interpolation);

  const updatePoint = (idx: number, key: 'x' | 'y', value: string) => {
    const parsed = Number(value);
    const next = [...points];
    next[idx] = { ...next[idx], [key]: Number.isFinite(parsed) ? parsed : 0 };
    onChange({ points: sortPoints(next) } as Partial<NodeModel>);
  };

  const addPoint = () => {
    const last = points[points.length - 1] ?? { x: 0, y: 0 };
    onChange({ points: [...points, { x: last.x + 1, y: last.y }] } as Partial<NodeModel>);
  };

  const removePoint = (idx: number) => {
    if (points.length <= 2) return;
    onChange({ points: points.filter((_, i) => i !== idx) } as Partial<NodeModel>);
  };

  const switchMode = (newMode: LookupMode) => {
    setMode(newMode);
    if (newMode === 'points') {
      onChange({ formula: undefined, formula_range: undefined } as Partial<NodeModel>);
    }
  };

  // Shared graph rendering
  const graphSvg = (
    <div className="lookup-graph">
      <svg viewBox="0 0 220 120" preserveAspectRatio="none" aria-label="Lookup graph preview">
        <path d="M0 120 H220 M0 0 V120" className="lookup-axis" />
        {path ? <path d={path} className="lookup-line" /> : null}
        {mode === 'points' &&
          points.map((p) => {
            const xs = points.map((pt) => pt.x);
            const ys = points.map((pt) => pt.y);
            const minX = Math.min(...xs);
            const maxX = Math.max(...xs);
            const minY = Math.min(...ys);
            const maxY = Math.max(...ys);
            const rx = maxX - minX || 1;
            const ry = maxY - minY || 1;
            const cx = ((p.x - minX) / rx) * 220;
            const cy = 120 - ((p.y - minY) / ry) * 120;
            return <circle key={`${p.x}-${p.y}`} cx={cx} cy={cy} r="2.6" className="lookup-dot" />;
          })}
      </svg>
      <div className="lookup-graph-footer">
        {displayPoints.length >= 2 ? (
          <>
            <span>{displayPoints[0]?.x ?? 0}</span>
            <span>{displayPoints[displayPoints.length - 1]?.x ?? 0}</span>
          </>
        ) : (
          <span style={{ opacity: 0.4 }}>no data</span>
        )}
      </div>
    </div>
  );

  return (
    <div className="lookup-editor">
      <div className="lookup-editor-header">
        <strong>Lookup Table</strong>
        <div className="lookup-mode-toggle">
          <button
            type="button"
            className={mode === 'points' ? 'active' : ''}
            onClick={() => switchMode('points')}
          >
            Points
          </button>
          <button
            type="button"
            className={mode === 'formula' ? 'active' : ''}
            onClick={() => switchMode('formula')}
          >
            Formula
          </button>
        </div>
      </div>

      {/* Interpolation selector */}
      <div className="lookup-interpolation-row">
        <label htmlFor="lookup-interpolation">Interpolation</label>
        <select
          id="lookup-interpolation"
          value={interpolation}
          onChange={(e) =>
            onChange({ interpolation: e.target.value as LookupInterpolation } as Partial<NodeModel>)
          }
        >
          <option value="linear">Linear</option>
          <option value="step">Step</option>
          <option value="cubic">Cubic (smooth)</option>
          <option value="exponential">Exponential</option>
          <option value="s-curve">S-curve</option>
        </select>
      </div>

      {mode === 'points' ? (
        <div className="lookup-editor-grid">
          <div className="lookup-points-table">
            <div className="lookup-points-head">
              <span>Input</span>
              <span>Output</span>
              <span />
            </div>
            <div className="lookup-points-body">
              {points.map((p, idx) => (
                <div key={`${idx}-${p.x}-${p.y}`} className="lookup-point-row">
                  <input type="number" step="any" value={p.x} onChange={(e) => updatePoint(idx, 'x', e.target.value)} />
                  <input type="number" step="any" value={p.y} onChange={(e) => updatePoint(idx, 'y', e.target.value)} />
                  <button type="button" className="ghost-icon-button" onClick={() => removePoint(idx)} disabled={points.length <= 2}>
                    ×
                  </button>
                </div>
              ))}
            </div>
            <button type="button" className="lookup-add-point" onClick={addPoint}>+ Point</button>
          </div>
          {graphSvg}
        </div>
      ) : (
        <div className="lookup-formula-section">
          <div className="lookup-formula-input">
            <label htmlFor="lookup-formula">Formula (use x as variable)</label>
            <input
              id="lookup-formula"
              type="text"
              placeholder="e.g. Math.sin(x), x**2, 1/(1+Math.exp(-x))"
              value={node.formula ?? ''}
              onChange={(e) => onChange({ formula: e.target.value } as Partial<NodeModel>)}
            />
          </div>
          <div className="lookup-formula-range">
            <div>
              <label htmlFor="lookup-range-min">Min</label>
              <input
                id="lookup-range-min"
                type="number"
                step="any"
                value={formulaRange.min}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) {
                    onChange({ formula_range: { ...formulaRange, min: v } } as Partial<NodeModel>);
                  }
                }}
              />
            </div>
            <div>
              <label htmlFor="lookup-range-max">Max</label>
              <input
                id="lookup-range-max"
                type="number"
                step="any"
                value={formulaRange.max}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (Number.isFinite(v)) {
                    onChange({ formula_range: { ...formulaRange, max: v } } as Partial<NodeModel>);
                  }
                }}
              />
            </div>
            <div>
              <label htmlFor="lookup-range-steps">Steps</label>
              <input
                id="lookup-range-steps"
                type="number"
                min="2"
                max="500"
                value={formulaRange.steps}
                onChange={(e) => {
                  const v = Math.max(2, Math.min(500, parseInt(e.target.value) || 50));
                  onChange({ formula_range: { ...formulaRange, steps: v } } as Partial<NodeModel>);
                }}
              />
            </div>
          </div>
          {graphSvg}
          {node.formula && formulaPoints.length === 0 && (
            <p className="lookup-formula-error">Could not evaluate formula. Use JavaScript math syntax.</p>
          )}
        </div>
      )}

      <p className="field-hint">Equation is the lookup input expression (x-axis). Output is the interpolated y value.</p>
    </div>
  );
}
