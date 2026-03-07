import { useMemo } from 'react';
import { Badge, Box, ScrollArea, Text } from '@mantine/core';
import { useEditorStore } from '../../state/editorStore';
import type { AnalysisNode } from '../../types/model';

const STAGE_COLORS: Record<string, { bg: string; border: string; text: string; activeBg: string }> = {
  blue: { bg: '#f0f3ff', border: '#4263eb', text: '#364fc7', activeBg: '#dbe4ff' },
  green: { bg: '#ebfbee', border: '#2f9e44', text: '#2b8a3e', activeBg: '#d3f9d8' },
  orange: { bg: '#fff4e6', border: '#e67700', text: '#d9480f', activeBg: '#ffe8cc' },
  grape: { bg: '#f8f0fc', border: '#9c36b5', text: '#862e9c', activeBg: '#eebefa' },
  teal: { bg: '#e6fcf5', border: '#087f8c', text: '#0b7285', activeBg: '#c3fae8' },
  gray: { bg: '#f8f9fa', border: '#868e96', text: '#495057', activeBg: '#e9ecef' },
};

function StageCard({ stage, focused, onClick }: { stage: AnalysisNode; focused: boolean; onClick: () => void }) {
  const colorKey = stage.groupColor ?? 'blue';
  const color = STAGE_COLORS[colorKey] ?? STAGE_COLORS.blue;
  const stageNodeCount = stage.stageNodeCount ?? 0;

  return (
    <Box
      onClick={onClick}
      style={{
        borderRadius: 8,
        border: focused ? `2px solid ${color.border}` : `1.5px solid ${color.border}55`,
        background: focused ? color.activeBg : color.bg,
        padding: '8px 10px',
        cursor: 'pointer',
        transition: 'all 150ms ease',
        boxShadow: focused ? `0 0 0 2px ${color.border}22` : '0 1px 2px rgba(0,0,0,0.04)',
      }}
    >
      <Text fw={600} size="xs" c={color.text} lineClamp={1}>{stage.name || 'Stage'}</Text>
      {stage.stagePurpose && (
        <Text size="xs" c="dimmed" lineClamp={2} style={{ fontSize: 10, marginTop: 2 }}>{stage.stagePurpose}</Text>
      )}
      <Box style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
        <Badge size="xs" variant="light" color="gray">{stageNodeCount} steps</Badge>
        <Badge size="xs" variant="dot" color={stage.stageRole === 'branch' ? 'gray' : 'teal'}>
          {stage.stageRole === 'branch' ? 'Branch' : 'Main'}
        </Badge>
      </Box>
    </Box>
  );
}

export function AnalysisStagesPanel() {
  const pipelines = useEditorStore((s) => s.pipelines);
  const activePipelineId = useEditorStore((s) => s.activePipelineId);
  const focusedStageId = useEditorStore((s) => s.focusedAnalysisStageId);
  const setFocusedStageId = useEditorStore((s) => s.setFocusedAnalysisStageId);

  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;

  const stages = useMemo(
    () => activePipeline
      ? activePipeline.nodes
        .filter((node) => node.type === 'group' && node.importedStage)
        .sort((a, b) => (a.stageOrder ?? 0) - (b.stageOrder ?? 0))
      : [],
    [activePipeline],
  );

  if (stages.length === 0) {
    return (
      <ScrollArea style={{ flex: 1 }} px={12} py={8}>
        <Text size="xs" c="dimmed">No imported stages in this pipeline.</Text>
      </ScrollArea>
    );
  }

  return (
    <ScrollArea style={{ flex: 1 }} px={12} py={8}>
      <Text size="xs" fw={600} c="dimmed" mb={8}>Pipeline Stages ({stages.length})</Text>
      <Box style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {stages.map((stage) => (
          <StageCard
            key={stage.id}
            stage={stage}
            focused={focusedStageId === stage.id}
            onClick={() => setFocusedStageId(focusedStageId === stage.id ? null : stage.id)}
          />
        ))}
      </Box>
    </ScrollArea>
  );
}
