import { BaseEdge, getBezierPath, type EdgeProps } from 'reactflow';

export function FlowPipeEdge(props: EdgeProps) {
  const angle = Math.atan2(props.targetY - props.sourceY, props.targetX - props.sourceX);
  const arrowLength = 16;
  const arrowHalfWidth = 8.4;
  const tipX = props.targetX;
  const tipY = props.targetY;
  const trimPadding = 1.5;
  const baseX = tipX - Math.cos(angle) * arrowLength;
  const baseY = tipY - Math.sin(angle) * arrowLength;
  const trimmedTargetX = tipX - Math.cos(angle) * (arrowLength + trimPadding);
  const trimmedTargetY = tipY - Math.sin(angle) * (arrowLength + trimPadding);
  const [path] = getBezierPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    sourcePosition: props.sourcePosition,
    targetX: trimmedTargetX,
    targetY: trimmedTargetY,
    targetPosition: props.targetPosition,
    curvature: 0.2,
  });
  const leftX = baseX + Math.cos(angle + Math.PI / 2) * arrowHalfWidth;
  const leftY = baseY + Math.sin(angle + Math.PI / 2) * arrowHalfWidth;
  const rightX = baseX + Math.cos(angle - Math.PI / 2) * arrowHalfWidth;
  const rightY = baseY + Math.sin(angle - Math.PI / 2) * arrowHalfWidth;

  return (
    <>
      <BaseEdge path={path} style={{ stroke: '#1c1c1f', strokeWidth: 7, fill: 'none' }} />
      <BaseEdge path={path} style={{ stroke: '#ffffff', strokeWidth: 4, fill: 'none' }} />
      <polygon
        points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`}
        fill="#ffffff"
        stroke="#1c1c1f"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </>
  );
}
