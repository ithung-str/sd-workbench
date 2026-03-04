import { Button, Group, Menu, TextInput } from '@mantine/core';
import { IconPlayerPlay, IconPlus, IconCode, IconDatabase, IconTableFilled } from '@tabler/icons-react';
import type { AnalysisPipeline, AnalysisNodeType } from '../../types/model';

type Props = {
  pipeline: AnalysisPipeline;
  isRunning: boolean;
  onUpdatePipeline: (id: string, patch: Partial<AnalysisPipeline>) => void;
  onAddNode: (type: AnalysisNodeType) => void;
  onRun: () => void;
};

export function AnalysisToolbar({ pipeline, isRunning, onUpdatePipeline, onAddNode, onRun }: Props) {
  return (
    <Group
      gap="sm"
      px="sm"
      py={6}
      style={{ borderBottom: '1px solid var(--mantine-color-gray-3)', flexShrink: 0 }}
    >
      <Menu shadow="md" width={200}>
        <Menu.Target>
          <Button size="xs" variant="light" leftSection={<IconPlus size={14} />}>
            Add Node
          </Button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconDatabase size={14} />} onClick={() => onAddNode('data_source')}>
            Data Source
          </Menu.Item>
          <Menu.Item leftSection={<IconCode size={14} />} onClick={() => onAddNode('code')}>
            Code
          </Menu.Item>
          <Menu.Item leftSection={<IconTableFilled size={14} />} onClick={() => onAddNode('output')}>
            Output
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>

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
