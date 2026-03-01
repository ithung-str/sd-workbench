/**
 * Geometry utilities for computing where an edge line intersects a node's border.
 *
 * Used by InfluenceEdge to connect to the nearest point on a node's boundary
 * rather than snapping to fixed cardinal handles.
 */

export type Point = { x: number; y: number };
export type Rect = { x: number; y: number; width: number; height: number };

/**
 * Compute where a ray from `center` toward `target` exits a rectangle.
 * Returns the intersection point on the rectangle border.
 */
export function rectBorderPoint(rect: Rect, target: Point): Point {
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;

  const dx = target.x - cx;
  const dy = target.y - cy;

  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  const halfW = rect.width / 2;
  const halfH = rect.height / 2;

  // Scale factor to reach each edge
  const scaleX = dx !== 0 ? halfW / Math.abs(dx) : Infinity;
  const scaleY = dy !== 0 ? halfH / Math.abs(dy) : Infinity;
  const scale = Math.min(scaleX, scaleY);

  return {
    x: cx + dx * scale,
    y: cy + dy * scale,
  };
}

/**
 * Compute where a ray from `center` toward `target` exits an ellipse.
 * Used for circular nodes (cld_symbol) and rounded shapes.
 */
export function ellipseBorderPoint(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  target: Point,
): Point {
  const dx = target.x - cx;
  const dy = target.y - cy;

  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  // Parametric angle on the ellipse
  const angle = Math.atan2(dy * rx, dx * ry);
  return {
    x: cx + rx * Math.cos(angle),
    y: cy + ry * Math.sin(angle),
  };
}

/**
 * Get the border intersection point for a given node type and dimensions.
 *
 * `nodePos` is the React Flow node position (top-left corner).
 * `target` is the point we're aiming at (the other end of the edge).
 */
export function nodeBorderPoint(
  nodeType: string,
  nodePos: Point,
  nodeWidth: number,
  nodeHeight: number,
  target: Point,
): Point {
  if (nodeType === 'cldSymbolNode') {
    // Circular — use ellipse
    const cx = nodePos.x + nodeWidth / 2;
    const cy = nodePos.y + nodeHeight / 2;
    return ellipseBorderPoint(cx, cy, nodeWidth / 2, nodeHeight / 2, target);
  }

  // All other nodes: treat as rectangle
  return rectBorderPoint(
    { x: nodePos.x, y: nodePos.y, width: nodeWidth, height: nodeHeight },
    target,
  );
}
