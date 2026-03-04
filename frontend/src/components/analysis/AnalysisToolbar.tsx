import { useState } from 'react';
import { ActionIcon, Button, Group, Menu, Text, TextInput, Tooltip } from '@mantine/core';
import { IconBookmark, IconHistory, IconPlayerPlay } from '@tabler/icons-react';
import type { AnalysisPipeline, PipelineCheckpoint } from '../../types/model';

type Props = {
  pipeline: AnalysisPipeline;
  isRunning: boolean;
  onUpdatePipeline: (id: string, patch: Partial<AnalysisPipeline>) => void;
  onRun: () => void;
  onCreateCheckpoint?: () => void;
  onRestoreCheckpoint?: (checkpoint: PipelineCheckpoint) => void;
};

export function AnalysisToolbar({ pipeline, isRunning, onUpdatePipeline, onRun, onCreateCheckpoint, onRestoreCheckpoint }: Props) {
  const checkpoints = pipeline.checkpoints ?? [];

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

      {onCreateCheckpoint && (
        <Tooltip label="Save checkpoint">
          <ActionIcon size="sm" variant="subtle" color="gray" onClick={onCreateCheckpoint}>
            <IconBookmark size={16} />
          </ActionIcon>
        </Tooltip>
      )}

      {checkpoints.length > 0 && onRestoreCheckpoint && (
        <Menu position="bottom-start" withArrow>
          <Menu.Target>
            <Tooltip label="Restore checkpoint">
              <ActionIcon size="sm" variant="subtle" color="gray">
                <IconHistory size={16} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Checkpoints</Menu.Label>
            {checkpoints.slice().reverse().map((cp) => (
              <Menu.Item
                key={cp.id}
                onClick={() => onRestoreCheckpoint(cp)}
              >
                <Text size="xs" fw={500}>{cp.name}</Text>
                <Text size="xs" c="dimmed">{new Date(cp.timestamp).toLocaleString()}</Text>
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      )}

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
