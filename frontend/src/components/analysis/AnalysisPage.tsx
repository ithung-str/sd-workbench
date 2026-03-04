import { useCallback, useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Box, Button, Group, Select, Text } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import type { AnalysisNodeType, AnalysisNode as AnalysisNodeT, AnalysisEdge as AnalysisEdgeT } from '../../types/model';
import { AnalysisToolbar } from './AnalysisToolbar';
import { DataSourceNode } from './nodes/DataSourceNode';
import { CodeNode } from './nodes/CodeNode';
import { OutputNode } from './nodes/OutputNode';

const nodeTypes: NodeTypes = {
  data_source: DataSourceNode,
  code: CodeNode,
  output: OutputNode,
};

function pipelineNodesToFlow(
  nodes: AnalysisNodeT[],
  results: Record<string, any>,
  onUpdate: (nodeId: string, patch: Record<string, unknown>) => void,
  onSaveComponent: (name: string, code: string) => void,
  selectedNodeId: string | null,
): Node[] {
  return nodes.map((n) => ({
    id: n.id,
    type: n.type,
    position: { x: n.x, y: n.y },
    ...(n.w && n.h ? { style: { width: n.w, height: n.h } } : {}),
    data: {
      ...n,
      result: results[n.id],
      selected: n.id === selectedNodeId,
      onUpdate: (patch: Record<string, unknown>) => onUpdate(n.id, patch),
      onSaveComponent: n.type === 'code' ? onSaveComponent : undefined,
    },
  }));
}

function pipelineEdgesToFlow(edges: AnalysisEdgeT[]): Edge[] {
  return edges.map((e) => ({
    id: e.id,
    source: e.source,
    target: e.target,
    animated: true,
  }));
}

export function AnalysisPage() {
  const pipelines = useEditorStore((s) => s.pipelines);
  const activePipelineId = useEditorStore((s) => s.activePipelineId);
  const createPipeline = useEditorStore((s) => s.createPipeline);
  const updatePipeline = useEditorStore((s) => s.updatePipeline);
  const setActivePipeline = useEditorStore((s) => s.setActivePipeline);
  const runPipeline = useEditorStore((s) => s.runPipeline);
  const isRunningPipeline = useEditorStore((s) => s.isRunningPipeline);
  const analysisResults = useEditorStore((s) => s.analysisResults);
  const analysisComponents = useEditorStore((s) => s.analysisComponents);
  const saveAnalysisComponent = useEditorStore((s) => s.saveAnalysisComponent);

  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;

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

  const flowNodes = useMemo(
    () => activePipeline ? pipelineNodesToFlow(activePipeline.nodes, analysisResults, handleUpdateNode, saveAnalysisComponent, null) : [],
    [activePipeline, analysisResults, handleUpdateNode, saveAnalysisComponent],
  );

  const flowEdges = useMemo(
    () => activePipeline ? pipelineEdgesToFlow(activePipeline.edges) : [],
    [activePipeline],
  );

  const onNodesChange = useCallback(
    (changes: any[]) => {
      if (!activePipeline) return;
      const posChanges = changes.filter((c: any) => c.type === 'position' && c.position);
      if (posChanges.length > 0) {
        const nodes = activePipeline.nodes.map((n) => {
          const change = posChanges.find((c: any) => c.id === n.id);
          if (change) return { ...n, x: change.position.x, y: change.position.y };
          return n;
        });
        updatePipeline(activePipeline.id, { nodes });
      }
      const resizeChanges = changes.filter((c: any) => c.type === 'dimensions' && c.dimensions);
      if (resizeChanges.length > 0) {
        const nodes = activePipeline.nodes.map((n) => {
          const change = resizeChanges.find((c: any) => c.id === n.id);
          if (change) return { ...n, w: change.dimensions.width, h: change.dimensions.height };
          return n;
        });
        updatePipeline(activePipeline.id, { nodes });
      }
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

  const handleAddNode = useCallback(
    (type: AnalysisNodeType, code?: string) => {
      if (!activePipeline) return;
      const id = `node_${Date.now()}`;
      const newNode: AnalysisNodeT = {
        id,
        type,
        x: 100 + activePipeline.nodes.length * 50,
        y: 100 + activePipeline.nodes.length * 50,
        ...(type === 'code' ? { code: code ?? '# Transform your data\ndf = df', w: 350, h: 300 } : {}),
      };
      updatePipeline(activePipeline.id, { nodes: [...activePipeline.nodes, newNode] });
    },
    [activePipeline, updatePipeline],
  );

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
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <AnalysisToolbar
        pipeline={activePipeline}
        isRunning={isRunningPipeline}
        components={analysisComponents}
        onUpdatePipeline={updatePipeline}
        onAddNode={handleAddNode}
        onRun={() => void runPipeline()}
      />
      <Box style={{ flex: 1 }}>
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          onNodesChange={onNodesChange}
          onConnect={onConnect}
          onEdgesDelete={onEdgesDelete}
          onNodesDelete={onNodesDelete}
          fitView
          deleteKeyCode="Delete"
        >
          <Background />
          <Controls />
        </ReactFlow>
      </Box>
    </Box>
  );
}
