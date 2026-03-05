import { useNodes, type EdgeProps } from 'reactflow';
import type { EdgeData } from '../../../lib/modelToReactFlow';
import { nodeBorderPoint } from '../../../lib/edgeGeometry';
import { useUIStore } from '../../../state/uiStore';

/**
 * Custom edge component for influence (dashed arrow) edges.
 *
 * Instead of connecting to fixed cardinal handles, this computes the
 * exact border intersection points on both source and target nodes,
 * giving a clean "connect anywhere on the border" look.
 *
 * When "curved influence arrows" is enabled, renders a gentle arc
 * (quadratic Bezier) instead of straight lines, matching the
 * convention used in traditional SD modeling tools.
 */
export function InfluenceEdge(props: EdgeProps<EdgeData>) {
  const nodes = useNodes();
  const curved = useUIStore((s) => s.curvedEdges);

  const sourceNode = nodes.find((n) => n.id === props.source);
  const targetNode = nodes.find((n) => n.id === props.target);

  // Fallback to handle-based positions if nodes not found or not measured yet
  if (
    !sourceNode?.width ||
    !sourceNode?.height ||
    !targetNode?.width ||
    !targetNode?.height
  ) {
    return <FallbackEdge {...props} />;
  }

  const waypoints = props.data?.waypoints;

  // Node centers
  const srcCx = sourceNode.position.x + sourceNode.width / 2;
  const srcCy = sourceNode.position.y + sourceNode.height / 2;
  const tgtCx = targetNode.position.x + targetNode.width / 2;
  const tgtCy = targetNode.position.y + targetNode.height / 2;

  // When waypoints exist, aim the source border point at the first waypoint
  // and the target border point from the last waypoint
  const srcAimAt = waypoints?.length
    ? waypoints[0]
    : { x: tgtCx, y: tgtCy };
  const tgtAimFrom = waypoints?.length
    ? waypoints[waypoints.length - 1]
    : { x: srcCx, y: srcCy };

  const srcPoint = nodeBorderPoint(
    sourceNode.type ?? 'auxNode',
    sourceNode.position,
    sourceNode.width,
    sourceNode.height,
    srcAimAt,
  );

  const tgtPoint = nodeBorderPoint(
    targetNode.type ?? 'auxNode',
    targetNode.position,
    targetNode.width,
    targetNode.height,
    tgtAimFrom,
  );

  // Build the full point sequence
  const allPoints = waypoints?.length
    ? [srcPoint, ...waypoints, tgtPoint]
    : [srcPoint, tgtPoint];

  const arrowLength = 10;
  const arrowHalfWidth = 5;

  const strokeColor = props.style?.stroke ?? '#9ca8c6';
  const strokeWidth = props.style?.strokeWidth ?? 1.2;
  const strokeDasharray = props.style?.strokeDasharray ?? '4 5';

  // ── Curved mode: quadratic Bezier with perpendicular offset ──
  if (curved && !waypoints?.length) {
    const dx = tgtPoint.x - srcPoint.x;
    const dy = tgtPoint.y - srcPoint.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Offset the control point perpendicular to the line, proportional to distance.
    // A subtle bend (~12% of distance, capped) matches traditional SD tools.
    const bendAmount = Math.min(dist * 0.12, 60);
    // Perpendicular direction (rotate 90° CCW)
    const px = -dy / (dist || 1);
    const py = dx / (dist || 1);
    const ctrlX = (srcPoint.x + tgtPoint.x) / 2 + px * bendAmount;
    const ctrlY = (srcPoint.y + tgtPoint.y) / 2 + py * bendAmount;

    // Tangent at t=1 of a quadratic Bezier is from the control point to the end
    const angle = Math.atan2(tgtPoint.y - ctrlY, tgtPoint.x - ctrlX);

    const trimmedEnd = {
      x: tgtPoint.x - Math.cos(angle) * arrowLength,
      y: tgtPoint.y - Math.sin(angle) * arrowLength,
    };

    const baseX = tgtPoint.x - Math.cos(angle) * arrowLength;
    const baseY = tgtPoint.y - Math.sin(angle) * arrowLength;
    const leftX = baseX + Math.cos(angle + Math.PI / 2) * arrowHalfWidth;
    const leftY = baseY + Math.sin(angle + Math.PI / 2) * arrowHalfWidth;
    const rightX = baseX + Math.cos(angle - Math.PI / 2) * arrowHalfWidth;
    const rightY = baseY + Math.sin(angle - Math.PI / 2) * arrowHalfWidth;

    const pathD = `M ${srcPoint.x} ${srcPoint.y} Q ${ctrlX} ${ctrlY} ${trimmedEnd.x} ${trimmedEnd.y}`;

    return (
      <g className="react-flow__edge-path">
        <path d={pathD} fill="none" stroke="transparent" strokeWidth={24} />
        <path
          d={pathD}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeDasharray={strokeDasharray}
        />
        <polygon
          points={`${tgtPoint.x},${tgtPoint.y} ${leftX},${leftY} ${rightX},${rightY}`}
          fill={strokeColor}
        />
      </g>
    );
  }

  // ── Straight mode (default) or has waypoints ──
  const lastIdx = allPoints.length - 1;
  const angle = Math.atan2(
    allPoints[lastIdx].y - allPoints[lastIdx - 1].y,
    allPoints[lastIdx].x - allPoints[lastIdx - 1].x,
  );

  // Trim the last segment so it stops before the arrowhead
  const trimmedEnd = {
    x: tgtPoint.x - Math.cos(angle) * arrowLength,
    y: tgtPoint.y - Math.sin(angle) * arrowLength,
  };

  // Arrow triangle
  const baseX = tgtPoint.x - Math.cos(angle) * arrowLength;
  const baseY = tgtPoint.y - Math.sin(angle) * arrowLength;
  const leftX = baseX + Math.cos(angle + Math.PI / 2) * arrowHalfWidth;
  const leftY = baseY + Math.sin(angle + Math.PI / 2) * arrowHalfWidth;
  const rightX = baseX + Math.cos(angle - Math.PI / 2) * arrowHalfWidth;
  const rightY = baseY + Math.sin(angle - Math.PI / 2) * arrowHalfWidth;

  // Build SVG path
  const pathPoints = [...allPoints.slice(0, -1), trimmedEnd];
  const pathD = pathPoints
    .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
    .join(' ');

  return (
    <g className="react-flow__edge-path">
      {/* Invisible wide path for interaction */}
      <path d={pathD} fill="none" stroke="transparent" strokeWidth={24} />
      {/* Visible dashed line */}
      <path
        d={pathD}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
      />
      {/* Arrowhead */}
      <polygon
        points={`${tgtPoint.x},${tgtPoint.y} ${leftX},${leftY} ${rightX},${rightY}`}
        fill={strokeColor}
      />
    </g>
  );
}

/**
 * Fallback rendering using the handle-based coordinates React Flow provides.
 * Used before node dimensions are measured.
 */
function FallbackEdge(props: EdgeProps<EdgeData>) {
  const strokeColor = props.style?.stroke ?? '#9ca8c6';
  const strokeWidth = props.style?.strokeWidth ?? 1.2;
  const strokeDasharray = props.style?.strokeDasharray ?? '4 5';

  return (
    <g className="react-flow__edge-path">
      <path
        d={`M ${props.sourceX} ${props.sourceY} L ${props.targetX} ${props.targetY}`}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
      />
      <path
        d={`M ${props.sourceX} ${props.sourceY} L ${props.targetX} ${props.targetY}`}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={strokeDasharray}
      />
    </g>
  );
}
