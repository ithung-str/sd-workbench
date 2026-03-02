import { useCallback, useMemo, useState } from 'react';
import { Handle, Position } from 'reactflow';
import type { LabelNodeData } from '../../../lib/modelToReactFlow';
import { resolveNodeStyle, visualStyleToCss } from '../../../lib/visualStyleUtils';
import { useEditorStore } from '../../../state/editorStore';
import { EDGE_DRAG_START_EVENT } from './StockNode';

function lookupSparkPath(points: Array<{ x: number; y: number }>, w: number, h: number): string {
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
      const sx = ((p.x - minX) / rx) * w;
      const sy = h - ((p.y - minY) / ry) * h;
      return `${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`;
    })
    .join(' ');
}

export function LookupNodeView({ data }: { data: LabelNodeData }) {
  const defaultStyles = useEditorStore((s) => s.model.metadata?.default_styles);
  const [hovered, setHovered] = useState(false);
  const resolvedCss = useMemo(
    () => visualStyleToCss(resolveNodeStyle('lookup', defaultStyles, data.visualStyle)),
    [defaultStyles, data.visualStyle],
  );

  const onEdgeDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!data.nodeId) return;
      window.dispatchEvent(
        new CustomEvent(EDGE_DRAG_START_EVENT, {
          detail: { nodeId: data.nodeId, clientX: e.clientX, clientY: e.clientY },
        }),
      );
    },
    [data.nodeId],
  );

  const sparkPath = useMemo(
    () => (data.lookupPoints ? lookupSparkPath(data.lookupPoints, 44, 24) : ''),
    [data.lookupPoints],
  );

  return (
    <div
      className="rf-node rf-node-lookup rf-node-shape-lookup"
      style={resolvedCss}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Top} id="top" />
      <div className="lookup-glyph" aria-hidden="true">
        <svg viewBox="0 0 44 24" preserveAspectRatio="none">
          <path d="M2 20 L2 3 M2 20 L42 20" className="axes" />
          {sparkPath ? (
            <path d={sparkPath} className="curve" />
          ) : (
            <path d="M4 18 L14 18 L24 16 L34 10 L42 4" className="curve" />
          )}
        </svg>
      </div>
      <div className="rf-node-label">{data.label}</div>
      <div className="rf-node-subtitle">{data.subtitle}</div>
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="target" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="target" position={Position.Bottom} id="bottom" />
      {hovered && (
        <button
          className="stock-flow-plus nodrag"
          onMouseDown={onEdgeDragStart}
          tabIndex={-1}
        >
          +
        </button>
      )}
    </div>
  );
}
