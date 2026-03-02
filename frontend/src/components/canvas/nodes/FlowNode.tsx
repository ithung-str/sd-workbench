import { useMemo } from 'react';
import { Handle, Position } from 'reactflow';
import type { LabelNodeData } from '../../../lib/modelToReactFlow';
import { resolveNodeStyle, visualStyleToCss } from '../../../lib/visualStyleUtils';
import { useEditorStore } from '../../../state/editorStore';

const flowValveIcon = new URL('../../../../icons/Flow_valve.svg', import.meta.url).href;

export function FlowNodeView({
  data,
}: {
  data: LabelNodeData;
}) {
  const defaultStyles = useEditorStore((s) => s.model.metadata?.default_styles);
  const direction = data.flowDirection ?? 'right';
  const resolvedCss = useMemo(
    () => visualStyleToCss(resolveNodeStyle('flow', defaultStyles, data.visualStyle)),
    [defaultStyles, data.visualStyle],
  );
  return (
    <div className="rf-node rf-node-flow rf-node-shape-flow" style={resolvedCss}>
      {/* Handles for flow connections (left and right) */}
      <Handle type="target" position={Position.Left} id="flow-left" style={{ top: '24px', left: '0px' }} />
      <Handle type="source" position={Position.Right} id="flow-right" style={{ top: '24px', right: '0px' }} />

      {/* Handles for variable connections (top and bottom at center of valve) */}
      <Handle type="target" position={Position.Top} id="var-top" style={{ left: '50%', top: '18px' }} />
      <Handle type="target" position={Position.Bottom} id="var-bottom" style={{ left: '50%', top: '30px' }} />

      <div className={`flow-symbol ${direction}`} aria-hidden="true">
        <img className="flow-valve-icon" src={flowValveIcon} alt="" />
      </div>
      <div className="rf-node-label">{data.label}</div>
      <div className="rf-node-subtitle">{data.subtitle}</div>
    </div>
  );
}
