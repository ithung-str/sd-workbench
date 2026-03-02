import { Handle, Position } from 'reactflow';

export function CloudNodeView() {
  return (
    <div className="rf-node rf-node-cloud">
      <Handle type="target" position={Position.Left} id="left" style={{ background: 'transparent', border: 'none' }} />
      <Handle type="source" position={Position.Left} id="left" style={{ background: 'transparent', border: 'none' }} />
      <Handle type="target" position={Position.Top} id="top" style={{ background: 'transparent', border: 'none' }} />
      <Handle type="source" position={Position.Top} id="top" style={{ background: 'transparent', border: 'none' }} />
      <svg width="40" height="30" viewBox="0 0 40 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path
          d="M10 20C6 20 3 17 3 13C3 9 6 6 10 6C10 3 13 1 16 1C19 1 22 3 23 6C26 6 29 9 29 13C29 15 28 17 26 18C28 18 30 20 30 22C30 24 28 26 26 26H10C6 26 3 23 3 20"
          stroke="#8f9ab8"
          strokeWidth="1.5"
          fill="white"
          opacity="0.8"
        />
      </svg>
      <Handle type="source" position={Position.Right} id="right" style={{ background: 'transparent', border: 'none' }} />
      <Handle type="target" position={Position.Right} id="right" style={{ background: 'transparent', border: 'none' }} />
      <Handle type="source" position={Position.Bottom} id="bottom" style={{ background: 'transparent', border: 'none' }} />
      <Handle type="target" position={Position.Bottom} id="bottom" style={{ background: 'transparent', border: 'none' }} />
    </div>
  );
}
