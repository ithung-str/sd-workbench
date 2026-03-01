import { BaseEdge, getBezierPath, type EdgeProps } from 'reactflow';
import type { EdgeData } from '../../../lib/modelToReactFlow';

function buildArrow(tipX: number, tipY: number, angle: number) {
  const arrowLength = 16;
  const arrowHalfWidth = 8.4;
  const baseX = tipX - Math.cos(angle) * arrowLength;
  const baseY = tipY - Math.sin(angle) * arrowLength;
  const leftX = baseX + Math.cos(angle + Math.PI / 2) * arrowHalfWidth;
  const leftY = baseY + Math.sin(angle + Math.PI / 2) * arrowHalfWidth;
  const rightX = baseX + Math.cos(angle - Math.PI / 2) * arrowHalfWidth;
  const rightY = baseY + Math.sin(angle - Math.PI / 2) * arrowHalfWidth;
  return { tipX, tipY, leftX, leftY, rightX, rightY };
}

function ArrowPolygon({ tipX, tipY, leftX, leftY, rightX, rightY }: ReturnType<typeof buildArrow>) {
  return (
    <polygon
      points={`${tipX},${tipY} ${leftX},${leftY} ${rightX},${rightY}`}
      fill="#ffffff"
      stroke="#1c1c1f"
      strokeWidth="1.6"
      strokeLinejoin="round"
    />
  );
}

export function FlowPipeEdge(props: EdgeProps<EdgeData>) {
  const waypoints = props.data?.waypoints;
  const flowSign = props.data?.flowSign ?? 'positive';
  const role = props.data?.flowLinkRole;

  // Determine arrow visibility based on the role of this specific edge segment.
  // Inflow (stock → flow): no arrows — the pipe just enters the valve
  // Outflow (flow → stock): arrow at the stock end (target) for positive,
  //   arrow at the flow end (source) for negative, both for both.
  // If no role info, fall back to legacy behavior.
  let showTargetArrow: boolean;
  let showSourceArrow: boolean;

  if (role === 'inflow') {
    // stock → flow: no arrows at all, continuous pipe into valve
    showTargetArrow = false;
    showSourceArrow = false;
  } else if (role === 'outflow') {
    // flow → stock: arrow at the stock (target) end
    showTargetArrow = flowSign === 'positive' || flowSign === 'both';
    showSourceArrow = flowSign === 'negative' || flowSign === 'both';
  } else {
    // Legacy fallback
    showTargetArrow = flowSign === 'positive' || flowSign === 'both';
    showSourceArrow = flowSign === 'negative' || flowSign === 'both';
  }

  if (waypoints && waypoints.length > 0) {
    const allPoints = [
      { x: props.sourceX, y: props.sourceY },
      ...waypoints,
      { x: props.targetX, y: props.targetY },
    ];

    const lastIdx = allPoints.length - 1;
    const lastAngle = Math.atan2(
      allPoints[lastIdx].y - allPoints[lastIdx - 1].y,
      allPoints[lastIdx].x - allPoints[lastIdx - 1].x,
    );
    const firstAngle = Math.atan2(
      allPoints[0].y - allPoints[1].y,
      allPoints[0].x - allPoints[1].x,
    );

    const trimPadding = 17.5;
    const trimmedTarget = showTargetArrow
      ? {
          x: allPoints[lastIdx].x - Math.cos(lastAngle) * trimPadding,
          y: allPoints[lastIdx].y - Math.sin(lastAngle) * trimPadding,
        }
      : allPoints[lastIdx];

    const trimmedSource = showSourceArrow
      ? {
          x: allPoints[0].x - Math.cos(firstAngle) * trimPadding,
          y: allPoints[0].y - Math.sin(firstAngle) * trimPadding,
        }
      : allPoints[0];

    const segments = allPoints.map((p, i) => {
      if (i === 0) return `M ${trimmedSource.x} ${trimmedSource.y}`;
      if (i === lastIdx) return `L ${trimmedTarget.x} ${trimmedTarget.y}`;
      return `L ${p.x} ${p.y}`;
    });
    const path = segments.join(' ');

    return (
      <>
        <BaseEdge path={path} style={{ stroke: '#1c1c1f', strokeWidth: 7, fill: 'none' }} />
        <BaseEdge path={path} style={{ stroke: '#ffffff', strokeWidth: 4, fill: 'none' }} />
        {showTargetArrow && <ArrowPolygon {...buildArrow(props.targetX, props.targetY, lastAngle)} />}
        {showSourceArrow && <ArrowPolygon {...buildArrow(props.sourceX, props.sourceY, firstAngle)} />}
      </>
    );
  }

  // Default bezier path (no waypoints)
  const angle = Math.atan2(props.targetY - props.sourceY, props.targetX - props.sourceX);
  const reverseAngle = angle + Math.PI;
  const trimPadding = 1.5;
  const arrowLength = 16;

  const trimmedTargetX = showTargetArrow
    ? props.targetX - Math.cos(angle) * (arrowLength + trimPadding)
    : props.targetX;
  const trimmedTargetY = showTargetArrow
    ? props.targetY - Math.sin(angle) * (arrowLength + trimPadding)
    : props.targetY;

  const trimmedSourceX = showSourceArrow
    ? props.sourceX + Math.cos(angle) * (arrowLength + trimPadding)
    : props.sourceX;
  const trimmedSourceY = showSourceArrow
    ? props.sourceY + Math.sin(angle) * (arrowLength + trimPadding)
    : props.sourceY;

  const [path] = getBezierPath({
    sourceX: trimmedSourceX,
    sourceY: trimmedSourceY,
    sourcePosition: props.sourcePosition,
    targetX: trimmedTargetX,
    targetY: trimmedTargetY,
    targetPosition: props.targetPosition,
    curvature: 0.2,
  });

  return (
    <>
      <BaseEdge path={path} style={{ stroke: '#1c1c1f', strokeWidth: 7, fill: 'none' }} />
      <BaseEdge path={path} style={{ stroke: '#ffffff', strokeWidth: 4, fill: 'none' }} />
      {showTargetArrow && <ArrowPolygon {...buildArrow(props.targetX, props.targetY, angle)} />}
      {showSourceArrow && <ArrowPolygon {...buildArrow(props.sourceX, props.sourceY, reverseAngle)} />}
    </>
  );
}
