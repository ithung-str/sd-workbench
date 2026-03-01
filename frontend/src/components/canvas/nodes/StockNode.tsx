import { useCallback, useRef, useState } from 'react';
import { Handle, NodeResizer, Position } from 'reactflow';
import type { LabelNodeData } from '../../../lib/modelToReactFlow';
import { useEditorStore } from '../../../state/editorStore';

export const FLOW_DRAG_START_EVENT = 'stock-flow-drag-start';
export const EDGE_DRAG_START_EVENT = 'node-edge-drag-start';

export function StockNodeView({ data }: { data: LabelNodeData }) {
  const updateNode = useEditorStore((s) => s.updateNode);
  const [hovered, setHovered] = useState(false);
  const rotateStartRef = useRef<{ startAngle: number; startRotation: number } | null>(null);

  const rotation = data.layoutMeta?.rotation ?? 0;

  const onResize = useCallback(
    (_event: unknown, params: { width: number; height: number }) => {
      if (!data.nodeId) return;
      updateNode(data.nodeId, {
        layout: { ...data.layoutMeta, width: params.width, height: params.height },
      } as Parameters<typeof updateNode>[1]);
    },
    [data.nodeId, data.layoutMeta, updateNode],
  );

  const onRotateStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!data.nodeId) return;
      const rect = (e.target as HTMLElement).closest('.rf-node-stock')?.getBoundingClientRect();
      if (!rect) return;
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
      rotateStartRef.current = { startAngle, startRotation: rotation };

      const onMove = (moveEvent: MouseEvent) => {
        const angle = Math.atan2(moveEvent.clientY - cy, moveEvent.clientX - cx);
        const delta = ((angle - startAngle) * 180) / Math.PI;
        let newRotation = rotateStartRef.current!.startRotation + delta;
        if (moveEvent.shiftKey) newRotation = Math.round(newRotation / 15) * 15;
        updateNode(data.nodeId!, {
          layout: { ...data.layoutMeta, rotation: newRotation },
        } as Parameters<typeof updateNode>[1]);
      };
      const onUp = () => {
        rotateStartRef.current = null;
        window.removeEventListener('mousemove', onMove);
        window.removeEventListener('mouseup', onUp);
      };
      window.addEventListener('mousemove', onMove);
      window.addEventListener('mouseup', onUp);
    },
    [data.nodeId, data.layoutMeta, rotation, updateNode],
  );

  const onFlowDragStart = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!data.nodeId) return;
      window.dispatchEvent(
        new CustomEvent(FLOW_DRAG_START_EVENT, {
          detail: { stockId: data.nodeId, clientX: e.clientX, clientY: e.clientY },
        }),
      );
    },
    [data.nodeId],
  );

  return (
    <div
      className="rf-node rf-node-stock rf-node-shape-stock"
      style={{ transform: rotation ? `rotate(${rotation}deg)` : undefined }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <NodeResizer
        isVisible={!!data.selected}
        minWidth={120}
        minHeight={50}
        onResize={onResize}
      />
      {data.selected && (
        <div className="stock-rotate-handle" onMouseDown={onRotateStart} />
      )}
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Top} id="top" />
      <div className="rf-node-label">{data.label}</div>
      <div className="rf-node-subtitle">{data.subtitle}</div>
      {data.sparklineValues && data.sparklineValues.length > 1 && (
        <svg className="stock-sparkline" viewBox="0 0 60 20" preserveAspectRatio="none">
          {(() => {
            const vals = data.sparklineValues;
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            const range = max - min || 1;
            const points = vals.map((v, i) => `${(i / (vals.length - 1)) * 60},${20 - ((v - min) / range) * 18}`).join(' ');
            return <polyline points={points} fill="none" stroke="#7c3aed" strokeWidth="1.5" />;
          })()}
        </svg>
      )}
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
      {hovered && !data.selected && (
        <button
          className="stock-flow-plus"
          onMouseDown={onFlowDragStart}
          tabIndex={-1}
        >
          +
        </button>
      )}
    </div>
  );
}
