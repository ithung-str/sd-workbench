import { Handle, Position } from 'reactflow';

export function LookupNodeView({ data }: { data: { label: string; subtitle: string } }) {
  return (
    <div className="rf-node rf-node-lookup rf-node-shape-lookup">
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Top} id="top" />
      <div className="lookup-glyph" aria-hidden="true">
        <svg viewBox="0 0 44 24" preserveAspectRatio="none">
          <path d="M2 20 L2 3 M2 20 L42 20" className="axes" />
          <path d="M4 18 L14 18 L24 16 L34 10 L42 4" className="curve" />
        </svg>
      </div>
      <div className="rf-node-label">{data.label}</div>
      <div className="rf-node-subtitle">{data.subtitle}</div>
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </div>
  );
}
