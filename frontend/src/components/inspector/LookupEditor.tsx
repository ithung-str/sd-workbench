import type { LookupNode, LookupPoint, NodeModel } from '../../types/model';

function sortPoints(points: LookupPoint[]) {
  return [...points].sort((a, b) => a.x - b.x);
}

function previewPath(points: LookupPoint[], width = 220, height = 120) {
  if (points.length < 2) return '';
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const rx = maxX - minX || 1;
  const ry = maxY - minY || 1;
  return points
    .map((p, i) => {
      const x = ((p.x - minX) / rx) * width;
      const y = height - ((p.y - minY) / ry) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export function LookupEditor({
  node,
  onChange,
}: {
  node: LookupNode;
  onChange: (patch: Partial<NodeModel>) => void;
}) {
  const points = sortPoints(node.points ?? []);
  const path = previewPath(points);

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

  return (
    <div className="lookup-editor">
      <div className="lookup-editor-header">
        <strong>Lookup Table</strong>
        <button type="button" onClick={addPoint}>+ Point</button>
      </div>
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
        </div>
        <div className="lookup-graph">
          <svg viewBox="0 0 220 120" preserveAspectRatio="none" aria-label="Lookup graph preview">
            <path d="M0 120 H220 M0 0 V120" className="lookup-axis" />
            {path ? <path d={path} className="lookup-line" /> : null}
            {points.map((p) => {
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
            <span>{points[0]?.x ?? 0}</span>
            <span>{points[points.length - 1]?.x ?? 0}</span>
          </div>
        </div>
      </div>
      <p className="field-hint">Equation is the lookup input expression (x-axis). Output is the interpolated y value.</p>
    </div>
  );
}
