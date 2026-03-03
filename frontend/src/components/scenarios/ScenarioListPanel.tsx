import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  ColorSwatch,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconCopy, IconPlus, IconTrash } from '@tabler/icons-react';
import type { ScenarioDefinition } from '../../types/model';

type ScenarioListPanelProps = {
  scenarios: ScenarioDefinition[];
  activeScenarioId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

function statusColor(status?: string): string {
  switch (status) {
    case 'baseline': return 'blue';
    case 'policy': return 'orange';
    case 'draft': return 'gray';
    case 'archived': return 'dimmed';
    default: return 'orange';
  }
}

function overrideCount(scenario: ScenarioDefinition): number {
  return Object.keys(scenario.overrides?.params ?? {}).length;
}

export function ScenarioListPanel({
  scenarios,
  activeScenarioId,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
}: ScenarioListPanelProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <Stack gap="sm" p="sm">
      <Group justify="space-between">
        <Text fw={600} size="sm">Scenarios</Text>
        <Button
          size="compact-xs"
          variant="light"
          leftSection={<IconPlus size={14} />}
          onClick={onCreate}
        >
          New
        </Button>
      </Group>

      <ScrollArea style={{ flex: 1 }}>
        <Stack gap={6}>
          {scenarios.map((scenario) => {
            const isActive = scenario.id === activeScenarioId;
            const isArchived = scenario.status === 'archived';
            const isBaseline = scenario.status === 'baseline';
            const count = overrideCount(scenario);
            const isConfirming = confirmDeleteId === scenario.id;

            return (
              <Paper
                key={scenario.id}
                p="xs"
                style={{
                  borderLeft: isActive
                    ? '3px solid var(--mantine-color-blue-5)'
                    : '3px solid transparent',
                  background: isActive
                    ? 'var(--mantine-color-blue-0)'
                    : undefined,
                  cursor: 'pointer',
                  opacity: isArchived ? 0.5 : 1,
                }}
                onClick={() => onSelect(scenario.id)}
              >
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                    <ColorSwatch
                      color={scenario.color ?? '#888'}
                      size={14}
                      style={{ flexShrink: 0 }}
                    />
                    <Box style={{ minWidth: 0 }}>
                      <Text
                        size="sm"
                        fw={600}
                        truncate
                        td={isArchived ? 'line-through' : undefined}
                      >
                        {scenario.name}
                      </Text>
                      <Group gap={4}>
                        <Badge size="xs" color={statusColor(scenario.status)}>
                          {scenario.status ?? 'policy'}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {count} override{count !== 1 ? 's' : ''}
                        </Text>
                      </Group>
                    </Box>
                  </Group>

                  {isConfirming ? (
                    <Group gap={4} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                      <Text size="xs" c="red" fw={500}>Delete?</Text>
                      <Button
                        size="compact-xs"
                        color="red"
                        variant="filled"
                        onClick={() => {
                          onDelete(scenario.id);
                          setConfirmDeleteId(null);
                        }}
                      >
                        Yes
                      </Button>
                      <Button
                        size="compact-xs"
                        variant="default"
                        onClick={() => setConfirmDeleteId(null)}
                      >
                        No
                      </Button>
                    </Group>
                  ) : (
                    <Group gap={2} wrap="nowrap" onClick={(e) => e.stopPropagation()}>
                      <Tooltip label="Duplicate">
                        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => onDuplicate(scenario.id)}>
                          <IconCopy size={14} />
                        </ActionIcon>
                      </Tooltip>
                      {!isBaseline && (
                        <Tooltip label="Delete">
                          <ActionIcon size="sm" variant="subtle" color="red" onClick={() => setConfirmDeleteId(scenario.id)}>
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </Group>
                  )}
                </Group>
              </Paper>
            );
          })}
        </Stack>
      </ScrollArea>
    </Stack>
  );
}
