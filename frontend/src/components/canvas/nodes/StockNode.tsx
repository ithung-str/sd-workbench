import { Handle, Position } from 'reactflow';

export function StockNodeView({ data }: { data: { label: string; subtitle: string } }) {
  return (
    <div className="rf-node rf-node-stock rf-node-shape-stock">
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Top} id="top" />
      <div className="rf-node-label">{data.label}</div>
      <div className="rf-node-subtitle">{data.subtitle}</div>
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </div>
  );
}
