import { Handle, Position } from 'reactflow';

export function PhantomNodeView() {
  return (
    <div className="rf-node rf-node-phantom">
      <Handle type="target" position={Position.Left} id="left" />
      <Handle type="target" position={Position.Top} id="top" />
      <div className="phantom-dot" />
      <Handle type="source" position={Position.Right} id="right" />
      <Handle type="source" position={Position.Bottom} id="bottom" />
    </div>
  );
}
