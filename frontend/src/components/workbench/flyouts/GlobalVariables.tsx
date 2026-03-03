import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  ActionIcon,
  Badge,
  Button,
  Code,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import {
  IconCheck,
  IconPencil,
  IconPlus,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { collectGlobalVariableUsage } from '../../../lib/globalVariableUsage';
import { useEditorStore } from '../../../state/editorStore';

export function GlobalVariables() {
  const addGlobalVariable = useEditorStore((s) => s.addGlobalVariable);
  const updateGlobalVariable = useEditorStore((s) => s.updateGlobalVariable);
  const deleteGlobalVariable = useEditorStore((s) => s.deleteGlobalVariable);
  const model = useEditorStore((s) => s.model);
  const selected = useEditorStore((s) => s.selected);
  const setSelected = useEditorStore((s) => s.setSelected);

  const [editingGlobalId, setEditingGlobalId] = useState<string | null>(null);
  const [editingGlobalValue, setEditingGlobalValue] = useState('');

  const globalUsage = useMemo(() => collectGlobalVariableUsage(model), [model]);

  const startGlobalValueEdit = (id: string, value: string) => {
    setEditingGlobalId(id);
    setEditingGlobalValue(value);
  };

  const commitGlobalValueEdit = (id: string) => {
    updateGlobalVariable(id, { equation: editingGlobalValue });
    setEditingGlobalId(null);
  };

  return (
    <Stack gap="sm">
      <Button
        variant="light"
        color="deepPurple"
        size="xs"
        fullWidth
        leftSection={<IconPlus size={14} />}
        onClick={addGlobalVariable}
      >
        Add Global Variable
      </Button>

      <ScrollArea.Autosize mah="calc(100vh - 220px)">
        <Stack gap={6}>
          {(model.global_variables ?? []).map((variable) => (
            <Paper
              key={variable.id}
              p={6}
              withBorder
              style={{
                borderColor:
                  selected?.kind === 'global_variable' && selected.id === variable.id
                    ? 'var(--mantine-color-blue-5)'
                    : undefined,
                background:
                  selected?.kind === 'global_variable' && selected.id === variable.id
                    ? 'var(--mantine-color-blue-0)'
                    : undefined,
              }}
            >
              <Group justify="space-between" align="center" wrap="nowrap" gap={4}>
                <UnstyledButton
                  onClick={() =>
                    setSelected({ kind: 'global_variable', id: variable.id })
                  }
                  style={{ display: 'block', flex: 1, minWidth: 0 }}
                >
                  <Group gap={4} wrap="nowrap">
                    <Badge size="xs" color="blue">
                      global
                    </Badge>
                    <div style={{ minWidth: 0 }}>
                      <Text size="xs" fw={600} truncate>
                        {variable.name}
                      </Text>
                      <Text size="xs" c="dimmed">
                        {globalUsage[variable.id]?.total ?? 0} uses
                      </Text>
                    </div>
                  </Group>
                </UnstyledButton>

                {editingGlobalId === variable.id ? (
                  <>
                    <TextInput
                      value={editingGlobalValue}
                      onChange={(e) => setEditingGlobalValue(e.target.value)}
                      size="xs"
                      w={80}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitGlobalValueEdit(variable.id);
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingGlobalId(null);
                        }
                      }}
                      onBlur={() => commitGlobalValueEdit(variable.id)}
                      autoFocus
                    />
                    <ActionIcon
                      size="sm"
                      color="green"
                      variant="subtle"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={(e) => {
                        e.stopPropagation();
                        commitGlobalValueEdit(variable.id);
                      }}
                      title="Save value"
                    >
                      <IconCheck size={14} />
                    </ActionIcon>
                    <ActionIcon
                      size="sm"
                      color="gray"
                      variant="subtle"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingGlobalId(null);
                      }}
                      title="Cancel edit"
                    >
                      <IconX size={14} />
                    </ActionIcon>
                  </>
                ) : (
                  <>
                    <UnstyledButton
                      onClick={(e) => {
                        e.stopPropagation();
                        startGlobalValueEdit(variable.id, variable.equation);
                      }}
                      title="Edit value"
                    >
                      <Code style={{ fontSize: '0.65rem' }}>{variable.equation}</Code>
                    </UnstyledButton>
                    <ActionIcon
                      size="sm"
                      color="gray"
                      variant="subtle"
                      onClick={(e) => {
                        e.stopPropagation();
                        startGlobalValueEdit(variable.id, variable.equation);
                      }}
                      title="Edit value"
                    >
                      <IconPencil size={14} />
                    </ActionIcon>
                  </>
                )}

                <ActionIcon
                  size="sm"
                  color="red"
                  variant="subtle"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteGlobalVariable(variable.id);
                  }}
                  title="Delete variable"
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            </Paper>
          ))}
        </Stack>
      </ScrollArea.Autosize>

      {editingGlobalId ? (
        <Text size="xs" c="dimmed">
          Press Enter to save or Esc to cancel value edits.
        </Text>
      ) : null}
    </Stack>
  );
}
