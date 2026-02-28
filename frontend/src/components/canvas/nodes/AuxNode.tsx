import { Handle, Position } from 'reactflow';

export function AuxNodeView({ data }: { data: { label: string; subtitle: string } }) {
  return (
    <div className="rf-node rf-node-aux rf-node-shape-aux">
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Top} id="top" />
      <div className="aux-text">
        <div className="rf-node-label">{data.label}</div>
        <div className="rf-node-subtitle">{data.subtitle}</div>
      </div>
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </div>
  );
}
