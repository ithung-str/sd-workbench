import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, { Background, BackgroundVariant, MarkerType, MiniMap, Panel, ReactFlowProvider, type Connection, type Edge, type EdgeTypes, type Node, type NodeTypes, type OnConnectStartParams, type OnSelectionChangeParams, type ReactFlowInstance } from 'reactflow';
import { createPortal } from 'react-dom';
import 'reactflow/dist/style.css';

import { useEditorStore } from '../../state/editorStore';
import { useUIStore } from '../../state/uiStore';
import type { NodeModel } from '../../types/model';
import { AuxNodeView } from './nodes/AuxNode';
import { FlowNodeView } from './nodes/FlowNode';
import { LookupNodeView } from './nodes/LookupNode';
import { StockNodeView, FLOW_DRAG_START_EVENT, EDGE_DRAG_START_EVENT } from './nodes/StockNode';
import { TextNodeView } from './nodes/TextNode';
import { CloudNodeView } from './nodes/CloudNode';
import { CldSymbolNodeView } from './nodes/CldSymbolNode';
import { PhantomNodeView } from './nodes/PhantomNode';
import { FlowPipeEdge } from './edges/FlowPipeEdge';
import { InfluenceEdge } from './edges/InfluenceEdge';
import { FlowDragOverlay } from './FlowDragOverlay';
import { NodePopover } from './NodePopover';
import { CanvasComponentsBar } from '../workbench/CanvasComponentsBar';
import { toReactFlowNodes, toReactFlowEdges } from '../../lib/modelToReactFlow';

const nodeTypes: NodeTypes = {
  stockNode: StockNodeView,
  auxNode: AuxNodeView,
  flowNode: FlowNodeView,
  lookupNode: LookupNodeView,
  textNode: TextNodeView,
  cloudNode: CloudNodeView,
  cldSymbolNode: CldSymbolNodeView,
  phantomNode: PhantomNodeView,
};

const edgeTypes: EdgeTypes = {
  flowPipe: FlowPipeEdge,
  influence: InfluenceEdge,
};

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

function ModelCanvasInner() {
  const model = useEditorStore((s) => s.model);
  const selected = useEditorStore((s) => s.selected);
  const setSelected = useEditorStore((s) => s.setSelected);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const multiSelectedNodeIds = useEditorStore((s) => s.multiSelectedNodeIds);
  const setMultiSelectedNodeIds = useEditorStore((s) => s.setMultiSelectedNodeIds);
  const deleteMultiSelected = useEditorStore((s) => s.deleteMultiSelected);
  const addModelEdge = useEditorStore((s) => s.addEdge);
  const updateNodePosition = useEditorStore((s) => s.updateNodePosition);
  const commitNodePosition = useEditorStore((s) => s.commitNodePosition);
  const addDanglingEdge = useEditorStore((s) => s.addDanglingEdge);
  const completeDanglingEdge = useEditorStore((s) => s.completeDanglingEdge);
  const createFlowBetweenStocks = useEditorStore((s) => s.createFlowBetweenStocks);
  const createFlowToCloud = useEditorStore((s) => s.createFlowToCloud);
  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);
  const isCanvasLocked = useEditorStore((s) => s.isCanvasLocked);
  const results = useEditorStore((s) => s.results);
  const showFunctionInternals = useUIStore((s) => s.showFunctionInternals);
  const showMinimap = useUIStore((s) => s.showMinimap);
  const [flowInstance, setFlowInstance] = useState<ReactFlowInstance | null>(null);

  const connectingFromRef = useRef<OnConnectStartParams | null>(null);

  // Flow drag state (from stock + button)
  const [flowDrag, setFlowDrag] = useState<{
    sourceStockId: string;
    cursorX: number;
    cursorY: number;
    sourceX: number;
    sourceY: number;
  } | null>(null);

  // Popover state (double-click to edit)
  const [popover, setPopover] = useState<{
    nodeId: string;
    screenX: number;
    screenY: number;
  } | null>(null);

  // Edge drag state (from variable/lookup + button)
  const [edgeDrag, setEdgeDrag] = useState<{
    sourceNodeId: string;
    cursorX: number;
    cursorY: number;
    sourceX: number;
    sourceY: number;
  } | null>(null);

  const sparklineDataMap = useMemo(() => {
    if (!results?.series) return undefined;
    const map = new Map<string, number[]>();
    for (const [name, values] of Object.entries(results.series)) {
      map.set(name, values);
    }
    return map;
  }, [results]);

  const rfNodes = useMemo<Node[]>(
    () => toReactFlowNodes(model.nodes, model.edges, selected, showFunctionInternals, undefined, sparklineDataMap, multiSelectedNodeIds),
    [model.nodes, model.edges, selected, showFunctionInternals, sparklineDataMap, multiSelectedNodeIds],
  );

  const rfEdges = useMemo<Edge[]>(
    () => toReactFlowEdges(model.edges, model.nodes),
    [model.edges, model.nodes],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (isCanvasLocked) return;
      if (!connection.source || !connection.target) return;
      const source = model.nodes.find((n) => n.id === connection.source);
      const target = model.nodes.find((n) => n.id === connection.target);
      if (!source || !target) return;

      // If connecting from a phantom node, complete the dangling edge
      if (source.type === 'phantom') {
        completeDanglingEdge(source.id, connection.target);
        return;
      }
      if (target.type === 'phantom') {
        completeDanglingEdge(target.id, connection.source);
        return;
      }

      if (
        source.type === 'text' ||
        source.type === 'cld_symbol' ||
        target.type === 'text' ||
        target.type === 'cld_symbol'
      ) {
        return;
      }

      // Stock-to-stock: create a flow between them instead of an influence arrow
      if (source.type === 'stock' && target.type === 'stock') {
        createFlowBetweenStocks(connection.source, connection.target);
        return;
      }

      // Stocks cannot receive influence edges — they only accumulate through flows
      if (target.type === 'stock') {
        return;
      }

      addModelEdge({
        id: `e_${Date.now()}`,
        type: 'influence',
        source: connection.source,
        target: connection.target,
      });
    },
    [isCanvasLocked, model.nodes, addModelEdge, completeDanglingEdge, createFlowBetweenStocks],
  );

  const onConnectStart = useCallback((_: unknown, params: OnConnectStartParams) => {
    connectingFromRef.current = params;
  }, []);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      const params = connectingFromRef.current;
      connectingFromRef.current = null;
      if (!params?.nodeId || !flowInstance || isCanvasLocked) return;

      // Check if dropped on a node (in which case onConnect fires instead)
      const target = event instanceof MouseEvent ? event.target : (event as TouchEvent).changedTouches?.[0]?.target;
      if (target instanceof HTMLElement && target.closest('.react-flow__node')) return;

      const clientX = event instanceof MouseEvent ? event.clientX : (event as TouchEvent).changedTouches?.[0]?.clientX;
      const clientY = event instanceof MouseEvent ? event.clientY : (event as TouchEvent).changedTouches?.[0]?.clientY;
      if (clientX == null || clientY == null) return;

      const position = flowInstance.screenToFlowPosition({ x: clientX, y: clientY });
      addDanglingEdge(params.nodeId, params.handleId, position);
    },
    [flowInstance, isCanvasLocked, addDanglingEdge],
  );

  // Flow drag from stock
  useEffect(() => {
    const onFlowDragStart = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !flowInstance) return;
      setFlowDrag({
        sourceStockId: detail.stockId,
        cursorX: detail.clientX,
        cursorY: detail.clientY,
        sourceX: detail.clientX,
        sourceY: detail.clientY,
      });
    };
    window.addEventListener(FLOW_DRAG_START_EVENT, onFlowDragStart);
    return () => window.removeEventListener(FLOW_DRAG_START_EVENT, onFlowDragStart);
  }, [flowInstance]);

  // Edge drag from variable/lookup
  useEffect(() => {
    const onEdgeDragStart = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!detail || !flowInstance) return;
      setEdgeDrag({
        sourceNodeId: detail.nodeId,
        cursorX: detail.clientX,
        cursorY: detail.clientY,
        sourceX: detail.clientX,
        sourceY: detail.clientY,
      });
    };
    window.addEventListener(EDGE_DRAG_START_EVENT, onEdgeDragStart);
    return () => window.removeEventListener(EDGE_DRAG_START_EVENT, onEdgeDragStart);
  }, [flowInstance]);

  useEffect(() => {
    if (!flowDrag || !flowInstance) return;

    const onMouseMove = (e: MouseEvent) => {
      setFlowDrag((prev) => prev ? { ...prev, cursorX: e.clientX, cursorY: e.clientY } : null);
    };
    const onMouseUp = (e: MouseEvent) => {
      const dropPos = flowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // Hit test: check if over a stock node
      const nodes = flowInstance.getNodes();
      const hitNode = nodes.find((n) => {
        if (n.id === flowDrag.sourceStockId) return false;
        if (n.type !== 'stockNode') return false;
        const w = n.width ?? 120;
        const h = n.height ?? 50;
        return (
          dropPos.x >= n.position.x &&
          dropPos.x <= n.position.x + w &&
          dropPos.y >= n.position.y &&
          dropPos.y <= n.position.y + h
        );
      });
      if (hitNode) {
        createFlowBetweenStocks(flowDrag.sourceStockId, hitNode.id);
      } else {
        createFlowToCloud(flowDrag.sourceStockId, dropPos);
      }
      setFlowDrag(null);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [flowDrag, flowInstance, createFlowBetweenStocks, createFlowToCloud]);

  // Edge drag mouse tracking (variable/lookup → influence edge)
  useEffect(() => {
    if (!edgeDrag || !flowInstance) return;

    const onMouseMove = (e: MouseEvent) => {
      setEdgeDrag((prev) => prev ? { ...prev, cursorX: e.clientX, cursorY: e.clientY } : null);
    };
    const onMouseUp = (e: MouseEvent) => {
      const dropPos = flowInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      // Hit test: check if over any non-text, non-cloud node
      const nodes = flowInstance.getNodes();
      const hitNode = nodes.find((n) => {
        if (n.id === edgeDrag.sourceNodeId) return false;
        const rfType = n.type ?? '';
        if (rfType === 'textNode' || rfType === 'cloudNode' || rfType === 'cldSymbolNode' || rfType === 'phantomNode' || rfType === 'stockNode') return false;
        const w = n.width ?? 120;
        const h = n.height ?? 50;
        return (
          dropPos.x >= n.position.x &&
          dropPos.x <= n.position.x + w &&
          dropPos.y >= n.position.y &&
          dropPos.y <= n.position.y + h
        );
      });
      if (hitNode) {
        addModelEdge({
          id: `e_${Date.now()}`,
          type: 'influence',
          source: edgeDrag.sourceNodeId,
          target: hitNode.id,
        });
      } else {
        addDanglingEdge(edgeDrag.sourceNodeId, null, dropPos);
      }
      setEdgeDrag(null);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [edgeDrag, flowInstance, addModelEdge, addDanglingEdge]);

  useEffect(() => {
    if (!flowInstance) return;
    const first = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        flowInstance.fitView({ padding: 0.16 });
      });
    });
    return () => cancelAnimationFrame(first);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowInstance]);

  const onSelectionChange = useCallback(({ nodes }: OnSelectionChangeParams) => {
    const selectedIds = nodes.map((n) => n.id);
    if (selectedIds.length >= 2) {
      setMultiSelectedNodeIds(selectedIds);
    } else if (selectedIds.length === 1) {
      setSelected({ kind: 'node', id: selectedIds[0] });
    }
    // When 0, we don't clear here — onPaneClick handles that
  }, [setMultiSelectedNodeIds, setSelected]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const key = event.key.toLowerCase();
      const hasModifier = event.metaKey || event.ctrlKey;
      const isUndoShortcut = hasModifier && !event.shiftKey && key === 'z';
      const isRedoShortcut = (hasModifier && event.shiftKey && key === 'z') || (event.ctrlKey && !event.metaKey && key === 'y');

      if ((isUndoShortcut || isRedoShortcut) && isEditableTarget(event.target)) {
        return;
      }
      if (isUndoShortcut) {
        event.preventDefault();
        undo();
        return;
      }
      if (isRedoShortcut) {
        event.preventDefault();
        redo();
        return;
      }
      if (event.key !== 'Backspace') return;
      if (isCanvasLocked) return;
      if (isEditableTarget(event.target)) return;
      if (multiSelectedNodeIds.length >= 2) {
        event.preventDefault();
        deleteMultiSelected();
        return;
      }
      if (!selected || (selected.kind !== 'node' && selected.kind !== 'edge')) return;
      event.preventDefault();
      deleteSelected();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [deleteSelected, deleteMultiSelected, isCanvasLocked, selected, multiSelectedNodeIds, undo, redo]);

  const onNodeDragStop = useCallback(
    (_: unknown, node: Node) => {
      if (isCanvasLocked) return;
      commitNodePosition(node.id, node.position.x, node.position.y);

      // Phantom node overlap detection
      const draggedNode = model.nodes.find((n) => n.id === node.id);
      if (draggedNode?.type === 'phantom') {
        const realNodes = model.nodes.filter(
          (n) => n.type !== 'phantom' && n.type !== 'text' && n.type !== 'cloud' && n.type !== 'cld_symbol',
        );
        for (const real of realNodes) {
          const dx = Math.abs(node.position.x - real.position.x);
          const dy = Math.abs(node.position.y - real.position.y);
          if (dx < 40 && dy < 40) {
            completeDanglingEdge(node.id, real.id);
            break;
          }
        }
      }
    },
    [isCanvasLocked, commitNodePosition, model.nodes, completeDanglingEdge],
  );

  return (
    <>
      <ReactFlow
        nodes={rfNodes}
        edges={rfEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.16 }}
        connectionRadius={40}
        onInit={setFlowInstance}
        nodesDraggable={!isCanvasLocked}
        nodesConnectable={!isCanvasLocked}
        elementsSelectable
        multiSelectionKeyCode="Shift"
        selectionOnDrag={false}
        onSelectionChange={onSelectionChange}
        onNodeClick={(event, node) => {
          const e = event as unknown as MouseEvent;
          if (e.shiftKey || e.metaKey) return; // let ReactFlow handle multi-select
          setSelected({ kind: 'node', id: node.id });
        }}
        onNodeDoubleClick={(event, node) => {
          setSelected({ kind: 'node', id: node.id });
          setPopover({ nodeId: node.id, screenX: (event as unknown as MouseEvent).clientX, screenY: (event as unknown as MouseEvent).clientY });
        }}
        onEdgeClick={(_, edge) => setSelected({ kind: 'edge', id: edge.id })}
        onPaneClick={() => { setSelected(null); setMultiSelectedNodeIds([]); setPopover(null); }}
        onConnect={onConnect}
        onConnectStart={onConnectStart}
        onConnectEnd={onConnectEnd}
        onNodeDrag={(_, node) => {
          if (isCanvasLocked) return;
          updateNodePosition(node.id, node.position.x, node.position.y);
        }}
        onNodeDragStop={onNodeDragStop}
        style={{ width: '100%', height: '100%', background: '#f7f8fb' }}
      >
        <Panel position="bottom-center" className="canvas-components-panel">
          <CanvasComponentsBar />
        </Panel>
        {showMinimap && <MiniMap pannable zoomable />}
        <Background variant={BackgroundVariant.Dots} gap={16} size={2} color="#b9c1cf" />
      </ReactFlow>
      {flowDrag && createPortal(
        <FlowDragOverlay
          sourceX={flowDrag.sourceX}
          sourceY={flowDrag.sourceY}
          cursorX={flowDrag.cursorX}
          cursorY={flowDrag.cursorY}
        />,
        document.body,
      )}
      {edgeDrag && createPortal(
        <FlowDragOverlay
          sourceX={edgeDrag.sourceX}
          sourceY={edgeDrag.sourceY}
          cursorX={edgeDrag.cursorX}
          cursorY={edgeDrag.cursorY}
          isInfluence
        />,
        document.body,
      )}
      {popover && createPortal(
        <NodePopover
          nodeId={popover.nodeId}
          screenX={popover.screenX}
          screenY={popover.screenY}
          onClose={() => setPopover(null)}
        />,
        document.body,
      )}
    </>
  );
}

export function ModelCanvas() {
  return (
    <div className="canvas-shell" data-testid="model-canvas" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <ReactFlowProvider>
        <ModelCanvasInner />
      </ReactFlowProvider>
    </div>
  );
}
