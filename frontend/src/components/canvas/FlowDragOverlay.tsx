type FlowDragOverlayProps = {
  sourceX: number;
  sourceY: number;
  cursorX: number;
  cursorY: number;
  isInfluence?: boolean;
};

export function FlowDragOverlay({ sourceX, sourceY, cursorX, cursorY, isInfluence }: FlowDragOverlayProps) {
  const midX = (sourceX + cursorX) / 2;
  const midY = (sourceY + cursorY) / 2;
  const angle = Math.atan2(cursorY - sourceY, cursorX - sourceX);

  // Arrowhead
  const arrowLength = 12;
  const arrowHalfWidth = 6;
  const baseX = cursorX - Math.cos(angle) * arrowLength;
  const baseY = cursorY - Math.sin(angle) * arrowLength;
  const leftX = baseX + Math.cos(angle + Math.PI / 2) * arrowHalfWidth;
  const leftY = baseY + Math.sin(angle + Math.PI / 2) * arrowHalfWidth;
  const rightX = baseX + Math.cos(angle - Math.PI / 2) * arrowHalfWidth;
  const rightY = baseY + Math.sin(angle - Math.PI / 2) * arrowHalfWidth;

  // Valve diamond at midpoint
  const valveSize = 10;

  const svgStyle = {
    position: 'fixed' as const,
    top: 0,
    left: 0,
    width: '100vw',
    height: '100vh',
    pointerEvents: 'none' as const,
    zIndex: 10000,
  };

  if (isInfluence) {
    return (
      <svg className="flow-drag-overlay" style={svgStyle}>
        <line
          x1={sourceX}
          y1={sourceY}
          x2={baseX}
          y2={baseY}
          stroke="#9ca8c6"
          strokeWidth={1.5}
          strokeDasharray="6 4"
        />
        <polygon
          points={`${cursorX},${cursorY} ${leftX},${leftY} ${rightX},${rightY}`}
          fill="#9ca8c6"
          stroke="#9ca8c6"
          strokeWidth={1}
          strokeLinejoin="round"
        />
      </svg>
    );
  }

  return (
    <svg className="flow-drag-overlay" style={svgStyle}>
      {/* Pipe line */}
      <line
        x1={sourceX}
        y1={sourceY}
        x2={baseX}
        y2={baseY}
        stroke="#1c1c1f"
        strokeWidth={6}
        strokeLinecap="round"
      />
      <line
        x1={sourceX}
        y1={sourceY}
        x2={baseX}
        y2={baseY}
        stroke="#fff"
        strokeWidth={3}
        strokeLinecap="round"
      />

      {/* Valve diamond at midpoint */}
      <polygon
        points={`${midX},${midY - valveSize} ${midX + valveSize},${midY} ${midX},${midY + valveSize} ${midX - valveSize},${midY}`}
        fill="#fff"
        stroke="#1c1c1f"
        strokeWidth={1.5}
      />

      {/* Arrowhead */}
      <polygon
        points={`${cursorX},${cursorY} ${leftX},${leftY} ${rightX},${rightY}`}
        fill="#fff"
        stroke="#1c1c1f"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}
