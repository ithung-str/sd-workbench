import { useMemo } from 'react';
import { Handle, Position } from 'reactflow';
import type { LabelNodeData } from '../../../lib/modelToReactFlow';
import { resolveNodeStyle, visualStyleToCss } from '../../../lib/visualStyleUtils';
import { useEditorStore } from '../../../state/editorStore';

/**
 * Bowtie / hourglass valve symbol — the standard SD flow regulator.
 * Renders as two triangles meeting at the center, sitting on the flow pipe.
 */
function ValveSymbol() {
  return (
    <svg
      className="flow-valve-bowtie"
      width="22"
      height="22"
      viewBox="0 0 22 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
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
  const resolvedCss = useMemo(
    () => visualStyleToCss(resolveNodeStyle('flow', defaultStyles, data.visualStyle)),
    [defaultStyles, data.visualStyle],
  );
  return (
    <div className="rf-node rf-node-flow rf-node-shape-flow" style={resolvedCss}>
      {/* Centered handles — both pipe segments converge to the middle of the valve */}
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

      {/* Handles for variable connections (influence edges from above/below) */}
      <Handle type="target" position={Position.Top} id="var-top" className="flow-var-handle" />
      <Handle type="target" position={Position.Bottom} id="var-bottom" className="flow-var-handle" />

      <ValveSymbol />
      <div className="rf-node-label">{data.label}</div>
      <div className="rf-node-subtitle">{data.subtitle}</div>
    </div>
  );
}
