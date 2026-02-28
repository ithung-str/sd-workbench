import { useEffect, useMemo, useState } from 'react';
import ReactFlow, { Background, BackgroundVariant, Controls, MarkerType, MiniMap, ReactFlowProvider, type Connection, type Edge, type EdgeTypes, type Node, type NodeTypes, type ReactFlowInstance } from 'reactflow';
import 'reactflow/dist/style.css';

import { useEditorStore } from '../../state/editorStore';
import { useUIStore } from '../../state/uiStore';
import type { NodeModel } from '../../types/model';
import { AuxNodeView } from './nodes/AuxNode';
import { FlowNodeView } from './nodes/FlowNode';
import { LookupNodeView } from './nodes/LookupNode';
import { StockNodeView } from './nodes/StockNode';
import { TextNodeView } from './nodes/TextNode';
import { CloudNodeView } from './nodes/CloudNode';
import { FlowPipeEdge } from './edges/FlowPipeEdge';

const nodeTypes: NodeTypes = {
  stockNode: StockNodeView,
  auxNode: AuxNodeView,
  flowNode: FlowNodeView,
  lookupNode: LookupNodeView,
  textNode: TextNodeView,
  cloudNode: CloudNodeView,
};

const edgeTypes: EdgeTypes = {
  flowPipe: FlowPipeEdge,
};

const FUNCTION_NAMES = ['PULSE TRAIN', 'STEP', 'RAMP', 'PULSE', 'DELAY1', 'DELAY3', 'DELAYN', 'DELAY', 'SMOOTH', 'SMOOTH3', 'SMOOTHN'];

function maskFunctionInternals(equation: string): string {
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

function subtitleForNode(name: string, equation: string, showFunctionInternals: boolean): string {
  const renderedEquation = showFunctionInternals ? equation : maskFunctionInternals(equation);
  return `${name} = ${renderedEquation}`.slice(0, 64);
}

function nodeData(node: NodeModel, showFunctionInternals: boolean, flowDirectionById: Map<string, 'left' | 'right'>) {
  if (node.type === 'text') {
    return { text: node.text };
  }
  if (node.type === 'cloud') {
    return {};
  }
  return {
    label: node.label,
    subtitle: showFunctionInternals ? subtitleForNode(node.name, String(node.equation), true) : '',
    flowDirection: node.type === 'flow' ? flowDirectionById.get(node.id) ?? 'right' : undefined,
  };
}

function ModelCanvasInner() {
  const model = useEditorStore((s) => s.model);
  const selected = useEditorStore((s) => s.selected);
  const setSelected = useEditorStore((s) => s.setSelected);
  const addModelEdge = useEditorStore((s) => s.addEdge);
  const updateNodePosition = useEditorStore((s) => s.updateNodePosition);
  const showFunctionInternals = useUIStore((s) => s.showFunctionInternals);
  const showMinimap = useUIStore((s) => s.showMinimap);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);

  const rfNodes = useMemo<Node[]>(() => {
    const byId = new Map(model.nodes.map((n) => [n.id, n]));
    const flowDirectionById = new Map<string, 'left' | 'right'>();
    for (const edge of model.edges) {
      if (edge.type !== 'flow_link') continue;
      const source = byId.get(edge.source);
      const target = byId.get(edge.target);
      if (!source || !target) continue;

      // flow -> stock means inflow toward stock
      if (source.type === 'flow' && target.type === 'stock') {
        flowDirectionById.set(source.id, target.position.x >= source.position.x ? 'right' : 'left');
      }
      // stock -> flow means outflow away from stock
      if (source.type === 'stock' && target.type === 'flow') {
        flowDirectionById.set(target.id, target.position.x >= source.position.x ? 'right' : 'left');
      }
    }

    const nodes = model.nodes.map((node) => ({
      id: node.id,
      type:
        node.type === 'stock'
          ? 'stockNode'
          : node.type === 'flow'
            ? 'flowNode'
          : node.type === 'lookup'
              ? 'lookupNode'
              : node.type === 'text'
                ? 'textNode'
              : node.type === 'cloud'
                ? 'cloudNode'
              : 'auxNode',
      position: node.position,
      selected: selected?.kind === 'node' && selected.id === node.id,
      data: nodeData(node, showFunctionInternals, flowDirectionById),
    }));

    console.log('ReactFlow nodes:', nodes);
    return nodes;
  }, [model.nodes, model.edges, selected, showFunctionInternals]);

  const rfEdges = useMemo<Edge[]>(
    () =>
      model.edges.map((edge) => {
        const isInfluence = edge.type === 'influence';
        const isFlowLink = edge.type === 'flow_link';
        return {
          id: edge.id,
          type: isFlowLink ? 'flowPipe' : undefined,
          source: edge.source,
          target: edge.target,
          sourceHandle: edge.source_handle,
          targetHandle: edge.target_handle,
          animated: false,
          interactionWidth: 24,
          markerEnd: isInfluence
            ? {
                type: MarkerType.ArrowClosed,
                color: '#8f9ab8',
                width: 18,
                height: 18,
              }
            : undefined,
          style: isInfluence
            ? { stroke: '#9ca8c6', strokeWidth: 1.2, strokeDasharray: '4 5' }
            : { stroke: '#1c1c1f', strokeWidth: 4.2 },
          label: '',
          labelStyle: {
            fill: isInfluence ? '#737f9f' : '#4b1b78',
            fontSize: 10,
            fontWeight: isInfluence ? 500 : 700,
          },
          labelBgStyle: {
            fill: '#ffffff',
            fillOpacity: 0.9,
          },
          labelBgPadding: [4, 2],
          labelBgBorderRadius: 4,
        };
      }),
    [model.edges],
  );

  const onConnect = (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    const source = model.nodes.find((n) => n.id === connection.source);
    const target = model.nodes.find((n) => n.id === connection.target);
    if (!source || !target) return;
    if (source.type === 'text' || target.type === 'text') return;
    addModelEdge({
      id: `e_${Date.now()}`,
      type: 'influence',
      source: connection.source,
      target: connection.target,
      source_handle: connection.sourceHandle ?? undefined,
      target_handle: connection.targetHandle ?? undefined,
    });
  };

  useEffect(() => {
    if (!flowInstance) return;

    console.log('ReactFlow instance initialized:', {
      nodeCount: model.nodes.length,
      edgeCount: model.edges.length,
      rfNodeCount: rfNodes.length,
      rfEdgeCount: rfEdges.length,
      nodes: rfNodes,
      edges: rfEdges
    });

    // Wait for layout to settle before fitting; avoids blank/off-screen content on initial mount.
    // Only fit view once on initialization
    const first = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        flowInstance.fitView({ padding: 0.16 });
      });
    });

    return () => cancelAnimationFrame(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowInstance]);

  return (
    <ReactFlow
      nodes={rfNodes}
      edges={rfEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      fitView
      fitViewOptions={{ padding: 0.16 }}
      onInit={setFlowInstance}
      onNodeClick={(_, node) => setSelected({ kind: 'node', id: node.id })}
      onEdgeClick={(_, edge) => setSelected({ kind: 'edge', id: edge.id })}
      onPaneClick={() => setSelected(null)}
      onConnect={onConnect}
      onNodeDrag={(_, node) => updateNodePosition(node.id, node.position.x, node.position.y)}
      onNodeDragStop={(_, node) => updateNodePosition(node.id, node.position.x, node.position.y)}
      style={{ width: '100%', height: '100%', background: '#f7f8fb' }}
    >
      {showMinimap && <MiniMap pannable zoomable />}
      <Controls />
      <Background variant={BackgroundVariant.Dots} gap={16} size={2} color="#b9c1cf" />
    </ReactFlow>
  );
}

export function ModelCanvas() {
  return (
    <div className="canvas-shell" data-testid="model-canvas" style={{ position: 'absolute', inset: 0 }}>
      <ReactFlowProvider>
        <ModelCanvasInner />
      </ReactFlowProvider>
    </div>
  );
}
