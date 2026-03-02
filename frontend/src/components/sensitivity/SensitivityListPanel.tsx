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
import type { SensitivityConfig } from '../../types/model';

type SensitivityListPanelProps = {
  configs: SensitivityConfig[];
  activeConfigId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

export function SensitivityListPanel({
  configs,
  activeConfigId,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
}: SensitivityListPanelProps) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <Stack gap="sm" p="sm">
      <Group justify="space-between">
        <Text fw={600} size="sm">Analyses</Text>
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
          {configs.map((config) => {
            const isActive = config.id === activeConfigId;
            const isConfirming = confirmDeleteId === config.id;

            return (
              <Paper
                key={config.id}
                p="xs"
                style={{
                  borderLeft: isActive
                    ? '3px solid var(--mantine-color-blue-5)'
                    : '3px solid transparent',
                  background: isActive
                    ? 'var(--mantine-color-blue-0)'
                    : undefined,
                  cursor: 'pointer',
                }}
                onClick={() => onSelect(config.id)}
              >
                <Group justify="space-between" wrap="nowrap" gap="xs">
                  <Group gap="xs" wrap="nowrap" style={{ minWidth: 0 }}>
                    <ColorSwatch
                      color={config.color ?? '#888'}
                      size={14}
                      style={{ flexShrink: 0 }}
                    />
                    <Box style={{ minWidth: 0 }}>
                      <Text size="sm" fw={600} truncate>
                        {config.name}
                      </Text>
                      <Group gap={4}>
                        <Badge
                          size="xs"
                          color={config.type === 'oat' ? 'teal' : 'violet'}
                        >
                          {config.type === 'oat' ? 'OAT' : 'Monte Carlo'}
                        </Badge>
                        <Text size="xs" c="dimmed">
                          {config.parameters.length} param{config.parameters.length !== 1 ? 's' : ''}
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
                          onDelete(config.id);
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
                        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => onDuplicate(config.id)}>
                          <IconCopy size={14} />
                        </ActionIcon>
                      </Tooltip>
                      <Tooltip label="Delete">
                        <ActionIcon size="sm" variant="subtle" color="red" onClick={() => setConfirmDeleteId(config.id)}>
                          <IconTrash size={14} />
                        </ActionIcon>
                      </Tooltip>
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
