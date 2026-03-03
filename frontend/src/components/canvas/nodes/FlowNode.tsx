import { useCallback, useMemo, useState } from 'react';
import { Handle, Position } from 'reactflow';
import type { LabelNodeData } from '../../../lib/modelToReactFlow';
import { resolveNodeStyle, visualStyleToCss } from '../../../lib/visualStyleUtils';
import { useEditorStore } from '../../../state/editorStore';
import { EDGE_DRAG_START_EVENT } from './StockNode';

/**
 * Bowtie / hourglass valve symbol — the standard SD flow regulator.
 * Renders as two triangles meeting at the center, sitting on the flow pipe.
 */
function ValveSymbol({ vertical }: { vertical?: boolean }) {
  return (
    <svg
      className="flow-valve-bowtie"
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={vertical ? { transform: 'rotate(90deg)' } : undefined}
    >
      <polygon
        points="1,1 11,11 1,21"
        fill="#fff"
        stroke="#1c1c1f"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <polygon
        points="21,1 11,11 21,21"
        fill="#fff"
        stroke="#1c1c1f"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function FlowNodeView({
  data,
}: {
  data: LabelNodeData;
}) {
  const defaultStyles = useEditorStore((s) => s.model.metadata?.default_styles);
  const [hovered, setHovered] = useState(false);
  const resolvedCss = useMemo(
    () => visualStyleToCss(resolveNodeStyle('flow', defaultStyles, data.visualStyle)),
    [defaultStyles, data.visualStyle],
  );
  const isVertical = data.flowDirection === 'up' || data.flowDirection === 'down';

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
      className="rf-node rf-node-flow rf-node-shape-flow"
      style={resolvedCss}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Horizontal pipe handles */}
      <Handle
        type="target"
        position={Position.Left}
        id="flow-in"
        className="flow-center-handle"
      />
      <Handle
        type="source"
        position={Position.Right}
        id="flow-out"
        className="flow-center-handle"
      />

      {/* Vertical pipe handles */}
      <Handle
        type="target"
        position={Position.Top}
        id="flow-in-top"
        className="flow-center-handle"
      />
      <Handle
        type="source"
        position={Position.Bottom}
        id="flow-out-bottom"
        className="flow-center-handle"
      />
      <Handle
        type="target"
        position={Position.Bottom}
        id="flow-in-bottom"
        className="flow-center-handle"
      />
      <Handle
        type="source"
        position={Position.Top}
        id="flow-out-top"
        className="flow-center-handle"
      />

      {/* Handles for variable connections — target (influence edges arriving) */}
      <Handle type="target" position={Position.Top} id="var-top" className="flow-var-handle" />
      <Handle type="target" position={Position.Bottom} id="var-bottom" className="flow-var-handle" />
      <Handle type="target" position={Position.Left} id="var-left" className="flow-var-handle" />
      <Handle type="target" position={Position.Right} id="var-right" className="flow-var-handle" />

      {/* Source handles for influence edges leaving this flow node */}
      <Handle type="source" position={Position.Top} id="var-top-src" className="flow-var-handle" />
      <Handle type="source" position={Position.Bottom} id="var-bottom-src" className="flow-var-handle" />
      <Handle type="source" position={Position.Left} id="var-left-src" className="flow-var-handle" />
      <Handle type="source" position={Position.Right} id="var-right-src" className="flow-var-handle" />

      <ValveSymbol vertical={isVertical} />
      <div className="rf-node-label">{data.label}</div>
      <div className="rf-node-subtitle">{data.subtitle}</div>
      {hovered && (
        <button
          className="stock-flow-plus nodrag"
          onMouseDown={onEdgeDragStart}
          tabIndex={-1}
          title="Create influence"
        >
          +
        </button>
      )}
    </div>
  );
}
