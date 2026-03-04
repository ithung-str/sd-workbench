import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconCopy, IconPlus, IconTrash } from '@tabler/icons-react';
import type { OptimisationConfig, OptimisationMode } from '../../types/model';

const MODE_COLORS: Record<OptimisationMode, string> = {
  'goal-seek': 'teal',
  'multi-objective': 'violet',
  policy: 'orange',
};

const MODE_LABELS: Record<OptimisationMode, string> = {
  'goal-seek': 'Goal Seek',
  'multi-objective': 'Multi-Obj',
  policy: 'Policy',
};

type Props = {
  configs: OptimisationConfig[];
  activeConfigId: string;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

export function OptimisationListPanel({
  configs,
  activeConfigId,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <Box
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <Group justify="space-between" p="xs" pb={4}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          Configs
        </Text>
        <Tooltip label="New config">
          <ActionIcon size="xs" variant="subtle" onClick={onCreate}>
            <IconPlus size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>
      <ScrollArea style={{ flex: 1 }} offsetScrollbars scrollbarSize={6}>
        <Stack gap={2} p="xs" pt={0}>
          {configs.length === 0 && (
            <Text size="xs" c="dimmed" ta="center" py="lg">
              No optimisation configs yet
            </Text>
          )}
          {configs.map((c) => {
            const isActive = c.id === activeConfigId;
            const isConfirmingDelete = confirmDeleteId === c.id;
            return (
              <Box
                key={c.id}
                onClick={() => onSelect(c.id)}
                style={{
                  padding: '8px 10px',
                  borderRadius: 6,
                  cursor: 'pointer',
                  background: isActive ? '#edf2ff' : 'transparent',
                  borderLeft: isActive ? '3px solid #4263eb' : '3px solid transparent',
                  transition: 'background 0.1s',
                }}
              >
                <Group gap="xs" justify="space-between" wrap="nowrap">
                  <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
                    {c.color && (
                      <Box
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: c.color,
                          flexShrink: 0,
                        }}
                      />
                    )}
                    <Text size="sm" truncate fw={isActive ? 600 : 400}>
                      {c.name}
                    </Text>
                  </Group>
                  <Badge size="xs" color={MODE_COLORS[c.mode]} variant="light">
                    {MODE_LABELS[c.mode]}
                  </Badge>
                </Group>
                <Group gap={4} mt={4}>
                  <Text size="xs" c="dimmed">
                    {c.parameters.length} param{c.parameters.length !== 1 ? 's' : ''}
                  </Text>
                  <Box style={{ flex: 1 }} />
                  <Tooltip label="Duplicate">
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicate(c.id);
                      }}
                    >
                      <IconCopy size={12} />
                    </ActionIcon>
                  </Tooltip>
                  {isConfirmingDelete ? (
                    <Button
                      size="compact-xs"
                      color="red"
                      variant="filled"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(c.id);
                        setConfirmDeleteId(null);
                      }}
                      onBlur={() => setConfirmDeleteId(null)}
                    >
                      Confirm
                    </Button>
                  ) : (
                    <Tooltip label="Delete">
                      <ActionIcon
                        size="xs"
                        variant="subtle"
                        color="red"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConfirmDeleteId(c.id);
                        }}
                      >
                        <IconTrash size={12} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Box>
            );
          })}
        </Stack>
      </ScrollArea>
      <Box p="xs" pt={4} style={{ borderTop: '1px solid #e7e7ee' }}>
        <Button size="xs" variant="light" fullWidth leftSection={<IconPlus size={14} />} onClick={onCreate}>
          New Config
        </Button>
      </Box>
    </Box>
  );
}
