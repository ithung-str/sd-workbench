import { type Edge, type Node } from 'reactflow';
import type {
  EdgeModel,
  LayoutMetadata,
  NodeModel,
  VisualStyle,
  WaypointPosition,
} from '../types/model';

// ---------------------------------------------------------------------------
// Node data payload types
// ---------------------------------------------------------------------------

export type LabelNodeData = {
  label: string;
  subtitle: string;
  flowDirection?: 'left' | 'right';
  visualStyle?: VisualStyle;
  layoutMeta?: LayoutMetadata;
  sparklineValues?: number[];
  lookupPoints?: Array<{ x: number; y: number }>;
  selected?: boolean;
  nodeId?: string;
};

export type TextNodeData = {
  text: string;
  visualStyle?: VisualStyle;
  layoutMeta?: LayoutMetadata;
};

export type CloudNodeData = {
  visualStyle?: VisualStyle;
  layoutMeta?: LayoutMetadata;
};

export type CldSymbolNodeData = {
  symbol: '+' | '-' | '||' | 'R' | 'B';
  loopDirection?: 'clockwise' | 'counterclockwise';
  name?: string;
};

export type EdgeData = {
  waypoints?: WaypointPosition[];
  visualStyle?: VisualStyle;
  flowSign?: 'positive' | 'negative' | 'both';
  flowLinkRole?: 'inflow' | 'outflow'; // inflow = stock→flow, outflow = flow→stock
};

// ---------------------------------------------------------------------------
// Node type mapping
// ---------------------------------------------------------------------------

const NODE_TYPE_MAP: Record<string, string> = {
  stock: 'stockNode',
  flow: 'flowNode',
  lookup: 'lookupNode',
  text: 'textNode',
  cloud: 'cloudNode',
  cld_symbol: 'cldSymbolNode',
  phantom: 'phantomNode',
};

export function mapNodeType(modelType: string): string {
  return NODE_TYPE_MAP[modelType] ?? 'auxNode';
}

// ---------------------------------------------------------------------------
// Flow direction computation
// ---------------------------------------------------------------------------

export function computeFlowDirections(
  nodes: NodeModel[],
  edges: EdgeModel[],
): Map<string, 'left' | 'right'> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const result = new Map<string, 'left' | 'right'>();

  for (const edge of edges) {
    if (edge.type !== 'flow_link') continue;
    const source = byId.get(edge.source);
    const target = byId.get(edge.target);
    if (!source || !target) continue;

    // flow -> stock: direction toward stock
    if (source.type === 'flow' && target.type === 'stock') {
      result.set(source.id, target.position.x >= source.position.x ? 'right' : 'left');
    }
    // stock -> flow: direction away from stock
    if (source.type === 'stock' && target.type === 'flow') {
      result.set(target.id, target.position.x >= source.position.x ? 'right' : 'left');
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Equation subtitle helpers
// ---------------------------------------------------------------------------

const FUNCTION_NAMES = [
  'PULSE TRAIN', 'STEP', 'RAMP', 'PULSE', 'DELAY1', 'DELAY3',
  'DELAYN', 'DELAY', 'SMOOTH', 'SMOOTH3', 'SMOOTHN',
];

export function maskFunctionInternals(equation: string): string {
  const source = equation ?? '';
  const upper = source.toUpperCase();
  let out = '';
  let i = 0;
  while (i < source.length) {
    let matched = false;
    for (const fn of FUNCTION_NAMES) {
      if (!upper.startsWith(fn, i)) continue;
      const prev = i > 0 ? upper[i - 1] : '';
      if (/[A-Z0-9_]/.test(prev)) continue;
      let j = i + fn.length;
      while (j < source.length && /\s/.test(source[j])) j += 1;
      if (source[j] !== '(') continue;
      let depth = 0;
      let k = j;
      for (; k < source.length; k += 1) {
        const ch = source[k];
        if (ch === '(') depth += 1;
        if (ch === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      if (k >= source.length) break;
      out += `${source.slice(i, i + fn.length)}(...)`;
      i = k + 1;
      matched = true;
      break;
    }
    if (!matched) {
      out += source[i];
      i += 1;
    }
  }
  return out;
}

export function subtitleForNode(name: string, equation: string, showFunctionInternals: boolean): string {
  const rendered = showFunctionInternals ? equation : maskFunctionInternals(equation);
  return `${name} = ${rendered}`.slice(0, 64);
}

// ---------------------------------------------------------------------------
// Node data builder
// ---------------------------------------------------------------------------

export function buildNodeData(
  node: NodeModel,
  showFunctionInternals: boolean,
  flowDirectionById: Map<string, 'left' | 'right'>,
): LabelNodeData | TextNodeData | CloudNodeData | CldSymbolNodeData {
  const style = 'style' in node ? node.style : undefined;
  const layout = 'layout' in node ? node.layout : undefined;

  if (node.type === 'text') {
    return { text: node.text, visualStyle: style, layoutMeta: layout };
  }
  if (node.type === 'cloud') {
    return { visualStyle: style, layoutMeta: layout };
  }
  if (node.type === 'phantom') {
    return {} as CloudNodeData;
  }
  if (node.type === 'cld_symbol') {
    return { symbol: node.symbol, loopDirection: node.loop_direction, name: node.name };
  }
  return {
    label: node.label,
    subtitle: showFunctionInternals ? subtitleForNode(node.name, String(node.equation), true) : '',
    flowDirection: node.type === 'flow' ? flowDirectionById.get(node.id) ?? 'right' : undefined,
    visualStyle: style,
    layoutMeta: layout,
  };
}

// ---------------------------------------------------------------------------
// Handle routing
// ---------------------------------------------------------------------------

export type HandlePair = {
  sourceHandle: string | undefined;
  targetHandle: string | undefined;
};

export function computeHandles(
  edge: EdgeModel,
  sourceNode: NodeModel | undefined,
  targetNode: NodeModel | undefined,
): HandlePair {
  // Keep explicit handles set by user interaction
  if (edge.source_handle && edge.target_handle) {
    return { sourceHandle: edge.source_handle, targetHandle: edge.target_handle };
  }

  if (!sourceNode || !targetNode) {
    return { sourceHandle: undefined, targetHandle: undefined };
  }

  // Use direction to first waypoint if available, else direction to target
  const waypoints = edge.layout?.waypoints;
  const refPoint = waypoints?.length ? waypoints[0] : targetNode.position;
  const dx = refPoint.x - sourceNode.position.x;
  const dy = refPoint.y - sourceNode.position.y;

  // For the target side, always use direction from source to target (not waypoint)
  const tgtDx = targetNode.position.x - sourceNode.position.x;
  const tgtDy = targetNode.position.y - sourceNode.position.y;

  if (edge.type === 'flow_link') {
    if (sourceNode.type === 'flow') {
      // flow → stock/cloud: source from valve center, target on stock side
      return {
        sourceHandle: 'flow-out',
        targetHandle: tgtDx >= 0 ? 'left' : 'right',
      };
    }
    if (targetNode.type === 'flow') {
      // stock/cloud → flow: source from stock side, target to valve center
      return {
        sourceHandle: dx >= 0 ? 'right' : 'left',
        targetHandle: 'flow-in',
      };
    }
  }

  // Influence edges targeting a flow node use var-top/var-bottom
  if (edge.type === 'influence' && targetNode.type === 'flow') {
    const isMoreHorizontal = Math.abs(dx) >= Math.abs(dy);
    const srcHandle = isMoreHorizontal
      ? (dx >= 0 ? 'right' : 'left')
      : (dy >= 0 ? 'bottom' : 'top');
    return {
      sourceHandle: srcHandle,
      targetHandle: tgtDy >= 0 ? 'var-top' : 'var-bottom',
    };
  }

  // Influence edges from a flow node use var-top/var-bottom as source
  if (edge.type === 'influence' && sourceNode.type === 'flow') {
    const isMoreHorizontal = Math.abs(tgtDx) >= Math.abs(tgtDy);
    const tgtHandle = isMoreHorizontal
      ? (tgtDx >= 0 ? 'left' : 'right')
      : (tgtDy >= 0 ? 'top' : 'bottom');
    return {
      sourceHandle: dy >= 0 ? 'var-bottom' : 'var-top',
      targetHandle: tgtHandle,
    };
  }

  // General influence: pick horizontal or vertical based on dominant axis
  const isMoreHorizontal = Math.abs(dx) >= Math.abs(dy);
  if (isMoreHorizontal) {
    return dx >= 0
      ? { sourceHandle: 'right', targetHandle: 'left' }
      : { sourceHandle: 'left', targetHandle: 'right' };
  }
  return dy >= 0
    ? { sourceHandle: 'bottom', targetHandle: 'top' }
    : { sourceHandle: 'top', targetHandle: 'bottom' };
}

// ---------------------------------------------------------------------------
// Main conversion: nodes
// ---------------------------------------------------------------------------

export function toReactFlowNodes(
  nodes: NodeModel[],
  edges: EdgeModel[],
  selected: { kind: string; id: string } | null,
  showFunctionInternals: boolean,
  highlightedNodeIds?: Set<string>,
  sparklineDataMap?: Map<string, number[]>,
): Node[] {
  const flowDirectionById = computeFlowDirections(nodes, edges);

  return nodes.map((node) => {
    const data = buildNodeData(node, showFunctionInternals, flowDirectionById);
    const isSelected = selected?.kind === 'node' && selected.id === node.id;
    if (node.type === 'stock' || node.type === 'aux' || node.type === 'lookup') {
      (data as LabelNodeData).nodeId = node.id;
    }
    if (node.type === 'lookup' && node.points?.length >= 2) {
      (data as LabelNodeData).lookupPoints = [...node.points].sort((a, b) => a.x - b.x);
    }
    if (node.type === 'stock') {
      (data as LabelNodeData).selected = isSelected;
      if (node.show_graph && sparklineDataMap) {
        const values = sparklineDataMap.get(node.name);
        if (values) {
          (data as LabelNodeData).sparklineValues = values;
        }
      }
    }
    const layout = 'layout' in node ? node.layout : undefined;
    const nodeStyle: Record<string, unknown> = {};
    if (node.type === 'stock' && layout?.width) nodeStyle.width = layout.width;
    if (node.type === 'stock' && layout?.height) nodeStyle.height = layout.height;
    return {
      id: node.id,
      type: mapNodeType(node.type),
      position: node.position,
      selected: isSelected,
      className: highlightedNodeIds?.has(node.id) ? 'loop-highlighted' : undefined,
      style: Object.keys(nodeStyle).length ? nodeStyle : undefined,
      data,
    };
  });
}

// ---------------------------------------------------------------------------
// Elbow waypoint computation for flow_link edges
// ---------------------------------------------------------------------------

export function computeElbowWaypoint(
  sourcePos: { x: number; y: number },
  targetPos: { x: number; y: number },
): WaypointPosition {
  const dx = Math.abs(targetPos.x - sourcePos.x);
  const dy = Math.abs(targetPos.y - sourcePos.y);
  // If more horizontal, go horizontal first then vertical
  if (dx >= dy) {
    return { x: targetPos.x, y: sourcePos.y };
  }
  // If more vertical, go vertical first then horizontal
  return { x: sourcePos.x, y: targetPos.y };
}

// ---------------------------------------------------------------------------
// Main conversion: edges
// ---------------------------------------------------------------------------

export function toReactFlowEdges(
  edges: EdgeModel[],
  nodes: NodeModel[],
  highlightedEdgeIds?: Set<string>,
): Edge[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));

  return edges.map((edge) => {
    const isInfluence = edge.type === 'influence';
    const isFlowLink = edge.type === 'flow_link';
    const handles = computeHandles(edge, byId.get(edge.source), byId.get(edge.target));

    const edgeStyle = edge.style;
    let waypoints = edge.layout?.waypoints;

    // Auto-generate elbow waypoints for flow_link edges without explicit waypoints
    if (isFlowLink && (!waypoints || waypoints.length === 0)) {
      const sourceNode = byId.get(edge.source);
      const targetNode = byId.get(edge.target);
      if (sourceNode && targetNode) {
        const elbow = computeElbowWaypoint(sourceNode.position, targetNode.position);
        // Only add elbow if it differs meaningfully from a straight line
        const dx = Math.abs(targetNode.position.x - sourceNode.position.x);
        const dy = Math.abs(targetNode.position.y - sourceNode.position.y);
        if (dx > 10 && dy > 10) {
          waypoints = [elbow];
        }
      }
    }

    return {
      id: edge.id,
      type: isFlowLink ? 'flowPipe' : isInfluence ? 'influence' : undefined,
      source: edge.source,
      target: edge.target,
      sourceHandle: handles.sourceHandle,
      targetHandle: handles.targetHandle,
      animated: false,
      interactionWidth: 24,
      markerEnd: undefined,
      style: isInfluence
        ? {
            stroke: edgeStyle?.stroke ?? '#9ca8c6',
            strokeWidth: edgeStyle?.stroke_width ?? 1.2,
            strokeDasharray: edgeStyle?.line_style === '0' ? undefined : '4 5',
          }
        : {
            stroke: edgeStyle?.stroke ?? '#1c1c1f',
            strokeWidth: edgeStyle?.stroke_width ?? 4.2,
          },
      label: '',
      labelStyle: {
        fill: isInfluence ? '#737f9f' : '#4b1b78',
        fontSize: 10,
        fontWeight: isInfluence ? 500 : 700,
      },
      labelBgStyle: { fill: '#ffffff', fillOpacity: 0.9 },
      labelBgPadding: [4, 2] as [number, number],
      labelBgBorderRadius: 4,
      className: highlightedEdgeIds?.has(edge.id) ? 'loop-highlighted' : undefined,
      data: {
        waypoints,
        visualStyle: edgeStyle,
        ...(isFlowLink ? (() => {
          // Find the flow node for this flow_link edge to get flow_sign and role
          const sourceNode = byId.get(edge.source);
          const targetNode = byId.get(edge.target);
          const flowNode = sourceNode?.type === 'flow' ? sourceNode : targetNode?.type === 'flow' ? targetNode : undefined;
          const flowLinkRole: 'inflow' | 'outflow' = sourceNode?.type === 'flow' ? 'outflow' : 'inflow';
          return {
            ...(flowNode?.type === 'flow' ? { flowSign: flowNode.flow_sign ?? 'positive' } : {}),
            flowLinkRole,
          };
        })() : {}),
      } as EdgeData,
    };
  });
}
