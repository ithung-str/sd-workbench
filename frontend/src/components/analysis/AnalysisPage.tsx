import { useCallback, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Box, Button, Group, Select, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import type { AnalysisNodeType, AnalysisNode as AnalysisNodeT, AnalysisEdge as AnalysisEdgeT } from '../../types/model';
import { parseCSV } from '../../lib/csvParser';
import { saveDataTable } from '../../lib/dataTableStorage';
import { AnalysisToolbar } from './AnalysisToolbar';
import { AnalysisIconStrip, type AnalysisFlyout } from './AnalysisIconStrip';
import { AnalysisFlyoutPanel } from './AnalysisFlyoutPanel';
import { DataSourceNode } from './nodes/DataSourceNode';
import { CodeNode } from './nodes/CodeNode';
import { OutputNode } from './nodes/OutputNode';

const nodeTypes: NodeTypes = {
  data_source: DataSourceNode,
  code: CodeNode,
  output: OutputNode,
};

export type RunScope = 'this' | 'upstream' | 'downstream' | 'connected' | 'all' | 'smart';
export type ZoomLevel = 'mini' | 'summary' | 'full';

/** Compute the set of node IDs to run based on scope. */
function computeRunNodeIds(
  nodeId: string,
  scope: RunScope,
  nodes: AnalysisNodeT[],
  edges: AnalysisEdgeT[],
  results?: Record<string, { ok?: boolean }>,
): string[] | undefined {
  if (scope === 'all') return undefined; // run everything

  const allIds = new Set(nodes.map((n) => n.id));
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();
  for (const id of allIds) {
    childrenOf.set(id, []);
    parentsOf.set(id, []);
  }
  for (const e of edges) {
    childrenOf.get(e.source)?.push(e.target);
    parentsOf.get(e.target)?.push(e.source);
  }

  const collectUp = (id: string, visited: Set<string>) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const p of parentsOf.get(id) ?? []) collectUp(p, visited);
  };
  const collectDown = (id: string, visited: Set<string>) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const c of childrenOf.get(id) ?? []) collectDown(c, visited);
  };

  if (scope === 'this') return [nodeId];

  if (scope === 'smart') {
    // Run this node + upstream nodes that don't have successful results
    const upstream = new Set<string>();
    collectUp(nodeId, upstream);
    return [...upstream].filter((id) => id === nodeId || !results?.[id]?.ok);
  }

  if (scope === 'upstream') {
    const set = new Set<string>();
    collectUp(nodeId, set);
    return [...set];
  }
  if (scope === 'downstream') {
    const set = new Set<string>();
    collectDown(nodeId, set);
    return [...set];
  }
  // 'connected' = upstream + downstream
  const set = new Set<string>();
  collectUp(nodeId, set);
  collectDown(nodeId, set);
  return [...set];
}

/** Extract column names from a node's result preview. */
function resultColumns(result: any): string[] | undefined {
  if (!result?.ok || !result.preview?.columns) return undefined;
  return result.preview.columns.map((c: any) => typeof c === 'string' ? c : c.key);
}

function pipelineNodesToFlow(
  nodes: AnalysisNodeT[],
  edges: AnalysisEdgeT[],
  results: Record<string, any>,
  onUpdate: (nodeId: string, patch: Record<string, unknown>) => void,
  onDelete: (nodeId: string) => void,
  onRunScope: (nodeId: string, scope: RunScope) => void,
  onSaveComponent: (name: string, code: string) => void,
  selectedNodeId: string | null,
  zoomLevel: ZoomLevel,
): Node[] {
  return nodes.map((n) => {
    // Compute input variable info for code nodes
    const parentIds = edges.filter((e) => e.target === n.id).map((e) => e.source);
    let inputVars: { varName: string; label: string; columns?: string[] }[] = [];
    if (n.type === 'code' && parentIds.length > 0) {
      if (parentIds.length === 1) {
        inputVars = [{ varName: 'df_in', label: 'DataFrame', columns: resultColumns(results[parentIds[0]]) }];
      } else {
        inputVars = parentIds.map((pid, i) => ({
          varName: `df_in${i + 1}`,
          label: 'DataFrame',
          columns: resultColumns(results[pid]),
        }));
      }
    }

    return {
      id: n.id,
      type: n.type,
      position: { x: n.x, y: n.y },
      ...(n.w && n.h ? { style: { width: n.w, height: n.h } } : {}),
      data: {
        ...n,
        result: results[n.id],
        selected: n.id === selectedNodeId,
        zoomLevel,
        inputVars,
        onUpdate: (patch: Record<string, unknown>) => onUpdate(n.id, patch),
        onDelete: () => onDelete(n.id),
        onRunScope: (scope: RunScope) => onRunScope(n.id, scope),
        onSaveComponent: n.type === 'code' ? onSaveComponent : undefined,
      },
    };
  });
}

function pipelineEdgesToFlow(edges: AnalysisEdgeT[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: true,
  }));
}

/** Inner component that has access to useReactFlow. */
function AnalysisCanvas() {
  const pipelines = useEditorStore((s) => s.pipelines);
  const activePipelineId = useEditorStore((s) => s.activePipelineId);
  const updatePipeline = useEditorStore((s) => s.updatePipeline);
  const runPipeline = useEditorStore((s) => s.runPipeline);
  const isRunningPipeline = useEditorStore((s) => s.isRunningPipeline);
  const analysisResults = useEditorStore((s) => s.analysisResults);
  const analysisComponents = useEditorStore((s) => s.analysisComponents);
  const saveAnalysisComponent = useEditorStore((s) => s.saveAnalysisComponent);

  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;
  const [canvasDragOver, setCanvasDragOver] = useState(false);
  const [activeFlyout, setActiveFlyout] = useState<AnalysisFlyout>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const { screenToFlowPosition, fitBounds } = useReactFlow();
  const { zoom } = useViewport();
  const zoomLevel: ZoomLevel = zoom < 0.45 ? 'mini' : zoom < 0.85 ? 'summary' : 'full';

  const handleToggleFlyout = useCallback((panel: NonNullable<AnalysisFlyout>) => {
    setActiveFlyout((prev) => (prev === panel ? null : panel));
  }, []);

  /** Create a node at a specific canvas position. */
  const handleAddNodeAtPosition = useCallback(
    (type: AnalysisNodeType, position: { x: number; y: number }, opts?: { tableId?: string; tableName?: string; code?: string; outputMode?: string }) => {
      if (!activePipeline) return;
      const id = `node_${Date.now()}`;
      const newNode: AnalysisNodeT = {
        id,
        type,
        x: position.x,
        y: position.y,
        ...(type === 'data_source' && opts?.tableId ? { data_table_id: opts.tableId, name: opts.tableName ?? '' } : {}),
        ...(type === 'code' ? { code: opts?.code ?? '# df_in: input DataFrame from upstream node\n# df_out: output DataFrame to pass downstream\n\ndf_out = df_in\n', w: 420, h: 400 } : {}),
        ...(type === 'output' ? { w: 380, h: 320, ...(opts?.outputMode ? { output_mode: opts.outputMode } : {}) } : {}),
      };
      updatePipeline(activePipeline.id, { nodes: [...activePipeline.nodes, newNode] });
    },
    [activePipeline, updatePipeline],
  );

  /** Add node at a default stacked offset position (for click-to-add). */
  const handleAddNode = useCallback(
    (type: AnalysisNodeType, code?: string, outputMode?: string) => {
      if (!activePipeline) return;
      const pos = { x: 100 + activePipeline.nodes.length * 50, y: 100 + activePipeline.nodes.length * 50 };
      handleAddNodeAtPosition(type, pos, { code, outputMode });
    },
    [activePipeline, handleAddNodeAtPosition],
  );

  /** Import a CSV file, save it, and create a Data Source node. */
  const handleCsvDrop = useCallback(
    async (file: File) => {
      if (!activePipeline) return;
      try {
        const table = await parseCSV(file);
        await saveDataTable(table);
        const pos = { x: 100 + activePipeline.nodes.length * 50, y: 100 + activePipeline.nodes.length * 50 };
        handleAddNodeAtPosition('data_source', pos, { tableId: table.id, tableName: table.name });
      } catch (err) {
        window.alert(`CSV import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [activePipeline, handleAddNodeAtPosition],
  );

  /** When a table is clicked/selected, create a Data Source node. */
  const handleSelectTable = useCallback(
    (tableId: string, tableName: string) => {
      if (!activePipeline) return;
      const pos = { x: 100 + activePipeline.nodes.length * 50, y: 100 + activePipeline.nodes.length * 50 };
      handleAddNodeAtPosition('data_source', pos, { tableId, tableName });
    },
    [activePipeline, handleAddNodeAtPosition],
  );

  const handleUpdateNode = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      if (!activePipeline) return;
      const nodes = activePipeline.nodes.map((n) =>
        n.id === nodeId ? { ...n, ...patch } : n,
      );
      updatePipeline(activePipeline.id, { nodes });
    },
    [activePipeline, updatePipeline],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      if (!activePipeline) return;
      updatePipeline(activePipeline.id, {
        nodes: activePipeline.nodes.filter((n) => n.id !== nodeId),
        edges: activePipeline.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      });
    },
    [activePipeline, updatePipeline],
  );

  const handleRunScope = useCallback(
    (nodeId: string, scope: RunScope) => {
      if (!activePipeline) return;
      const ids = computeRunNodeIds(nodeId, scope, activePipeline.nodes, activePipeline.edges, analysisResults);
      void runPipeline(ids);
    },
    [activePipeline, runPipeline, analysisResults],
  );

  // Derive flow nodes/edges from pipeline state
  const derivedFlowNodes = useMemo(
    () => activePipeline ? pipelineNodesToFlow(activePipeline.nodes, activePipeline.edges, analysisResults, handleUpdateNode, handleDeleteNode, handleRunScope, saveAnalysisComponent, selectedNodeId, zoomLevel) : [],
    [activePipeline, analysisResults, handleUpdateNode, handleDeleteNode, handleRunScope, saveAnalysisComponent, selectedNodeId, zoomLevel],
  );

  const derivedFlowEdges = useMemo(
    () => activePipeline ? pipelineEdgesToFlow(activePipeline.edges) : [],
    [activePipeline],
  );

  // Local state for ReactFlow
  const [flowNodes, setFlowNodes] = useState<Node[]>(derivedFlowNodes);
  const [flowEdges, setFlowEdges] = useState<Edge[]>(derivedFlowEdges);

  useEffect(() => { setFlowNodes(derivedFlowNodes); }, [derivedFlowNodes]);
  useEffect(() => { setFlowEdges(derivedFlowEdges); }, [derivedFlowEdges]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => { setFlowNodes((nds) => applyNodeChanges(changes, nds)); },
    [],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => { setFlowEdges((eds) => applyEdgeChanges(changes, eds)); },
    [],
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!activePipeline) return;
      const nodes = activePipeline.nodes.map((n) =>
        n.id === node.id ? { ...n, x: node.position.x, y: node.position.y } : n,
      );
      updatePipeline(activePipeline.id, { nodes });
    },
    [activePipeline, updatePipeline],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!activePipeline || !connection.source || !connection.target) return;
      const id = `edge_${Date.now()}`;
      const newEdge: AnalysisEdgeT = { id, source: connection.source, target: connection.target };
      updatePipeline(activePipeline.id, { edges: [...activePipeline.edges, newEdge] });
    },
    [activePipeline, updatePipeline],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!activePipeline) return;
      const deletedIds = new Set(deleted.map((e) => e.id));
      updatePipeline(activePipeline.id, {
        edges: activePipeline.edges.filter((e) => !deletedIds.has(e.id)),
      });
    },
    [activePipeline, updatePipeline],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      if (!activePipeline) return;
      const deletedIds = new Set(deleted.map((n) => n.id));
      updatePipeline(activePipeline.id, {
        nodes: activePipeline.nodes.filter((n) => !deletedIds.has(n.id)),
        edges: activePipeline.edges.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)),
      });
    },
    [activePipeline, updatePipeline],
  );

  // Unified drag-over handler
  const onCanvasDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const hasNodeType = e.dataTransfer.types.includes('application/analysis-node-type');
    const hasFile = e.dataTransfer.types.includes('Files');
    if (hasNodeType || hasFile) {
      e.dataTransfer.dropEffect = 'copy';
      setCanvasDragOver(true);
    }
  }, []);

  // Unified drop handler
  const onCanvasDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setCanvasDragOver(false);

      // Case 1: node type from flyout
      const nodeType = e.dataTransfer.getData('application/analysis-node-type') as AnalysisNodeType | '';
      if (nodeType) {
        const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const tableId = e.dataTransfer.getData('application/analysis-data-table-id') || undefined;
        const tableName = e.dataTransfer.getData('application/analysis-data-table-name') || undefined;
        const code = e.dataTransfer.getData('application/analysis-node-code') || undefined;
        const outputMode = e.dataTransfer.getData('application/analysis-output-mode') || undefined;
        handleAddNodeAtPosition(nodeType, position, { tableId, tableName, code, outputMode });
        return;
      }

      // Case 2: CSV file drop
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) {
        void handleCsvDrop(file);
      }
    },
    [screenToFlowPosition, handleAddNodeAtPosition, handleCsvDrop],
  );

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const padding = 50;
      const width = node.width ?? 300;
      const height = node.height ?? 200;
      fitBounds(
        { x: node.position.x - padding, y: node.position.y - padding, width: width + padding * 2, height: height + padding * 2 },
        { duration: 300 },
      );
    },
    [fitBounds],
  );

  // Keyboard shortcut: Cmd+Enter runs smart scope on selected node
  const onCanvasKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && selectedNodeId) {
        e.preventDefault();
        handleRunScope(selectedNodeId, 'smart');
      }
    },
    [selectedNodeId, handleRunScope],
  );

  if (!activePipeline) return null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AnalysisToolbar
        pipeline={activePipeline}
        isRunning={isRunningPipeline}
        onUpdatePipeline={updatePipeline}
        onRun={() => void runPipeline()}
      />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <AnalysisIconStrip activeFlyout={activeFlyout} onToggle={handleToggleFlyout} />
        <AnalysisFlyoutPanel
          activeFlyout={activeFlyout}
          onClose={() => setActiveFlyout(null)}
          components={analysisComponents}
          onAddNode={handleAddNode}
          onSelectTable={handleSelectTable}
        />
        <div
          style={{ flex: 1, width: '100%', height: '100%', position: 'relative', outline: 'none' }}
          onDragOver={onCanvasDragOver}
          onDragLeave={() => setCanvasDragOver(false)}
          onDrop={onCanvasDrop}
          onKeyDown={onCanvasKeyDown}
          tabIndex={0}
        >
          {canvasDragOver && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              background: 'rgba(12, 166, 120, 0.08)',
              border: '2px dashed var(--mantine-color-teal-5)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <Text size="lg" fw={600} c="teal">Drop to add node</Text>
            </div>
          )}
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onEdgesDelete={onEdgesDelete}
            onNodesDelete={onNodesDelete}
            onNodeDoubleClick={onNodeDoubleClick}
            onSelectionChange={({ nodes: sel }) => {
              setSelectedNodeId(sel.length === 1 ? sel[0].id : null);
            }}
            fitView
            deleteKeyCode={['Delete', 'Backspace']}
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}

export function AnalysisPage() {
  const pipelines = useEditorStore((s) => s.pipelines);
  const activePipelineId = useEditorStore((s) => s.activePipelineId);
  const createPipeline = useEditorStore((s) => s.createPipeline);
  const setActivePipeline = useEditorStore((s) => s.setActivePipeline);

  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;

  if (!activePipeline) {
    return (
      <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Group px="md" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
          <Text fw={600}>Analysis Pipelines</Text>
          <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => createPipeline()}>
            New Pipeline
          </Button>
          {pipelines.length > 0 && (
            <Select
              size="xs"
              placeholder="Select pipeline"
              data={pipelines.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(v) => v && setActivePipeline(v)}
              w={200}
            />
          )}
        </Group>
        <Box style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text c="dimmed">Create a pipeline to get started</Text>
        </Box>
      </Box>
    );
  }

  return (
    <ReactFlowProvider>
      <AnalysisCanvas />
    </ReactFlowProvider>
  );
}
