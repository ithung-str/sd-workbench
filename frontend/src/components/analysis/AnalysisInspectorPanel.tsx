import { useCallback } from 'react';
import { Badge, Box, ScrollArea, Text } from '@mantine/core';
import { useEditorStore } from '../../state/editorStore';
import type { NodeResultResponse } from '../../lib/api';
import type { AnalysisNode } from '../../types/model';
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

function GroupInspectorBody({ node, children }: { node: AnalysisNode; children: AnalysisNode[] }) {
  const stageNodeCount = node.stageNodeCount ?? children.length;
  const nodeTypeCounts = new Map<string, number>();
  for (const child of children) {
    nodeTypeCounts.set(child.type, (nodeTypeCounts.get(child.type) ?? 0) + 1);
  }

  return (
    <>
      {/* Header */}
      <Box mb={10} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <Text size="sm" fw={600} style={{ flex: 1 }} truncate>{node.name || 'Group'}</Text>
        <Badge size="xs" variant="light" color="gray">group</Badge>
      </Box>

      {/* Stage role */}
      {node.importedStage && node.stageRole && (
        <Box mb={8}>
          <Badge size="xs" variant="dot" color={node.stageRole === 'branch' ? 'gray' : 'teal'}>
            {node.stageRole === 'branch' ? 'Branch' : 'Main path'}
          </Badge>
        </Box>
      )}

      {/* Purpose */}
      {(node.stagePurpose || node.description) && (
        <Box mb={10}>
          <Text size="xs" c="dimmed" fw={600} mb={2}>Purpose</Text>
          <Text size="xs">{node.stagePurpose || node.description}</Text>
        </Box>
      )}

      {/* Inputs */}
      {node.stageInputs && node.stageInputs.length > 0 && (
        <Box mb={8}>
          <Text size="xs" c="dimmed" fw={600} mb={2}>Inputs</Text>
          <Box style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {node.stageInputs.map((input) => (
              <Badge key={input} size="xs" variant="light" color="blue">{input}</Badge>
            ))}
          </Box>
        </Box>
      )}

      {/* Outputs */}
      {node.stageOutputs && node.stageOutputs.length > 0 && (
        <Box mb={8}>
          <Text size="xs" c="dimmed" fw={600} mb={2}>Outputs</Text>
          <Box style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {node.stageOutputs.map((output) => (
              <Badge key={output} size="xs" variant="light" color="teal">{output}</Badge>
            ))}
          </Box>
        </Box>
      )}

      {/* Step count + breakdown */}
      <Box mb={8}>
        <Text size="xs" c="dimmed" fw={600} mb={2}>Steps ({stageNodeCount})</Text>
        <Box style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {[...nodeTypeCounts.entries()].map(([type, count]) => (
            <Badge key={type} size="xs" variant="outline" color="gray">{count} {type}</Badge>
          ))}
        </Box>
      </Box>

      {/* Child node list */}
      {children.length > 0 && (
        <Box mb={8}>
          <Text size="xs" c="dimmed" fw={600} mb={4}>Nodes in this stage</Text>
          {children.map((child) => (
            <Box
              key={child.id}
              mb={4}
              style={{
                padding: '4px 8px',
                background: '#fff',
                borderRadius: 6,
                border: '1px solid #eee',
              }}
            >
              <Box style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Text size="xs" fw={500} style={{ flex: 1 }} truncate>{child.name || child.id}</Text>
                <Badge size="xs" variant="light" color="gray">{child.type}</Badge>
              </Box>
              {child.description && (
                <Text size="xs" c="dimmed" lineClamp={1}>{child.description}</Text>
              )}
            </Box>
          ))}
        </Box>
      )}
    </>
  );
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

  // Group nodes get a dedicated inspector
  if (node.type === 'group') {
    const childNodes = activePipeline
      ? activePipeline.nodes.filter((n) => n.parentGroup === node.id)
      : [];
    return (
      <ScrollArea style={{ flex: 1 }} px={12} py={8}>
        <GroupInspectorBody node={node} children={childNodes} />
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
