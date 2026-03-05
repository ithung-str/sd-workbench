import { useCallback } from 'react';
import { ScrollArea, Text } from '@mantine/core';
import { useEditorStore } from '../../state/editorStore';
import type { NodeResultResponse } from '../../lib/api';
import { VariableInspector } from './VariableInspector';

/** Resolves mock value into a result-like shape for the inspector. */
function mockToResult(node: { mockValue?: any }): NodeResultResponse | undefined {
  if (!node.mockValue) return undefined;
  return {
    ok: true,
    preview: node.mockValue.preview,
    shape: node.mockValue.shape,
    value_kind: node.mockValue.kind,
    generic_value: node.mockValue.generic_value,
  } as NodeResultResponse;
}

/**
 * Analysis inspector panel rendered inside the workbench right sidebar.
 * Reads selected node from the store.
 */
export function AnalysisInspectorPanel() {
  const pipelines = useEditorStore((s) => s.pipelines);
  const activePipelineId = useEditorStore((s) => s.activePipelineId);
  const selectedNodeId = useEditorStore((s) => s.selectedAnalysisNodeId);
  const analysisResults = useEditorStore((s) => s.analysisResults);
  const updatePipeline = useEditorStore((s) => s.updatePipeline);

  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;
  const node = selectedNodeId && activePipeline
    ? activePipeline.nodes.find((n) => n.id === selectedNodeId) ?? null
    : null;
  const result = selectedNodeId
    ? analysisResults[selectedNodeId] ?? (node ? mockToResult(node) : undefined)
    : undefined;
  const isMockPreview = !!selectedNodeId && !analysisResults[selectedNodeId] && !!node?.mockValue;

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

  const handleSnapshotMock = selectedNodeId && analysisResults[selectedNodeId]?.ok
    ? () => {
        const res = analysisResults[selectedNodeId];
        if (!res?.ok || !res.preview) return;
        handleUpdateNode(selectedNodeId, {
          mockValue: {
            kind: (res.value_kind ?? 'dataframe') as string,
            preview: res.preview,
            shape: res.shape,
            generic_value: res.generic_value,
          },
        });
      }
    : undefined;

  const handleClearMock = node?.mockValue && selectedNodeId
    ? () => handleUpdateNode(selectedNodeId, { mockValue: undefined })
    : undefined;

  if (!node) {
    return (
      <ScrollArea style={{ flex: 1 }} px={12} py={8}>
        <Text size="xs" c="dimmed">Select a node to inspect</Text>
      </ScrollArea>
    );
  }

  return (
    <VariableInspector
      node={node}
      result={result}
      pipelineId={activePipelineId ?? undefined}
      onClose={() => useEditorStore.setState({ selectedAnalysisNodeId: null })}
      onSnapshotMock={handleSnapshotMock}
      onClearMock={handleClearMock}
      isMockPreview={isMockPreview}
      embedded
    />
  );
}
