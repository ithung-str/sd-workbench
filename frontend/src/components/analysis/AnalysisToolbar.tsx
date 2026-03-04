import { Button, Group, TextInput } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import type { AnalysisPipeline } from '../../types/model';

type Props = {
  pipeline: AnalysisPipeline;
  isRunning: boolean;
  onUpdatePipeline: (id: string, patch: Partial<AnalysisPipeline>) => void;
  onRun: () => void;
};

export function AnalysisToolbar({ pipeline, isRunning, onUpdatePipeline, onRun }: Props) {
  return (
    <Group
      gap="sm"
      px="sm"
      py={6}
      style={{ borderBottom: '1px solid var(--mantine-color-gray-3)', flexShrink: 0 }}
    >
      <Button
        size="xs"
        leftSection={<IconPlayerPlay size={14} />}
        onClick={onRun}
        loading={isRunning}
      >
        Run Pipeline
      </Button>

      <TextInput
        size="xs"
        value={pipeline.name}
        onChange={(e) => onUpdatePipeline(pipeline.id, { name: e.currentTarget.value })}
        styles={{ input: { fontWeight: 600 } }}
        style={{ flex: 1 }}
      />
    </Group>
  );
}
