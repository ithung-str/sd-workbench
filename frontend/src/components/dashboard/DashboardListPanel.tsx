import { useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconCopy, IconPlus, IconTrash } from '@tabler/icons-react';
import type { DashboardDefinition, ModelDocument } from '../../types/model';
import { generateTemplateCards } from '../../lib/dashboardTemplates';

type Props = {
  dashboards: DashboardDefinition[];
  activeDashboardId: string | null;
  model: ModelDocument;
  onSelect: (id: string) => void;
  onCreate: (name?: string, cards?: Omit<import('../../types/model').DashboardCard, 'id' | 'order'>[]) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
};

export function DashboardListPanel({
  dashboards,
  activeDashboardId,
  model,
  onSelect,
  onCreate,
  onDuplicate,
  onDelete,
}: Props) {
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Group justify="space-between" p="xs" pb={4}>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase">
          Dashboards
        </Text>
      </Group>

      <ScrollArea style={{ flex: 1 }} offsetScrollbars scrollbarSize={6}>
        <Stack gap={2} p="xs" pt={0}>
          {dashboards.length === 0 && (
            <Text size="xs" c="dimmed" ta="center" py="lg">
              No dashboards yet
            </Text>
          )}
          {dashboards.map((d) => {
            const isActive = d.id === activeDashboardId;
            const isConfirmingDelete = confirmDeleteId === d.id;
            return (
              <Box
                key={d.id}
                onClick={() => onSelect(d.id)}
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
                  <Text size="sm" truncate fw={isActive ? 600 : 400} style={{ minWidth: 0 }}>
                    {d.name}
                  </Text>
                  <Badge size="xs" color="gray" variant="light">
                    {d.cards.length} card{d.cards.length !== 1 ? 's' : ''}
                  </Badge>
                </Group>
                <Group gap={4} mt={4}>
                  <Box style={{ flex: 1 }} />
                  <Tooltip label="Duplicate">
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color="gray"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDuplicate(d.id);
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
                        onDelete(d.id);
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
                          setConfirmDeleteId(d.id);
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
        <Menu shadow="md" width={220}>
          <Menu.Target>
            <Button size="xs" variant="light" fullWidth leftSection={<IconPlus size={14} />}>
              New Dashboard
            </Button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Choose template</Menu.Label>
            <Menu.Item onClick={() => onCreate()}>Blank</Menu.Item>
            <Menu.Item onClick={() => onCreate('Overview', generateTemplateCards(model, 'overview'))}>
              Overview (stocks)
            </Menu.Item>
            <Menu.Item onClick={() => onCreate('All Variables', generateTemplateCards(model, 'all_variables'))}>
              All Variables
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </Box>
    </Box>
  );
}
