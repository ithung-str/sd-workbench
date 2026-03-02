import { useCallback, useMemo, useState } from 'react';
import { Handle, Position } from 'reactflow';
import type { LabelNodeData } from '../../../lib/modelToReactFlow';
import { resolveNodeStyle, visualStyleToCss } from '../../../lib/visualStyleUtils';
import { useEditorStore } from '../../../state/editorStore';
import { EDGE_DRAG_START_EVENT } from './StockNode';

export function AuxNodeView({ data }: { data: LabelNodeData }) {
  const defaultStyles = useEditorStore((s) => s.model.metadata?.default_styles);
  const [hovered, setHovered] = useState(false);
  const resolvedCss = useMemo(
    () => visualStyleToCss(resolveNodeStyle('aux', defaultStyles, data.visualStyle)),
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

  return (
    <div
      className="rf-node rf-node-aux rf-node-shape-aux"
      style={resolvedCss}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="source" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="source" position={Position.Top} id="top" />
      <div className="aux-text">
        <div className="rf-node-label">{data.label}</div>
        <div className="rf-node-subtitle">{data.subtitle}</div>
      </div>
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
