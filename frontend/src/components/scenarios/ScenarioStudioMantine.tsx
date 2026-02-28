import { Badge, Button, Group, NumberInput, Paper, ScrollArea, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { useMemo } from 'react';
import { useEditorStore } from '../../state/editorStore';

function numericValue(value: number | string | undefined): number | '' {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : '';
  }
  return '';
}

type ScenarioStudioProps = {
  showHeading?: boolean;
};

export function ScenarioStudio({ showHeading = true }: ScenarioStudioProps) {
  const scenarios = useEditorStore((s) => s.scenarios);
  const activeScenarioId = useEditorStore((s) => s.activeScenarioId);
  const setActiveScenario = useEditorStore((s) => s.setActiveScenario);
  const createScenario = useEditorStore((s) => s.createScenario);
  const updateScenario = useEditorStore((s) => s.updateScenario);
  const deleteScenario = useEditorStore((s) => s.deleteScenario);

  const activeScenario = useMemo(
    () => scenarios.find((scenario) => scenario.id === activeScenarioId) ?? scenarios[0],
    [scenarios, activeScenarioId],
  );

  if (!activeScenario) {
    return null;
  }

  const paramEntries = Object.entries(activeScenario.overrides?.params ?? {});

  return (
    <Stack gap="sm" mt={showHeading ? 'md' : 0}>
      {showHeading ? (
        <Group justify="space-between" align="center">
          <Title order={5}>Scenario Studio</Title>
          <Button size="xs" variant="light" onClick={createScenario}>
            New Scenario
          </Button>
        </Group>
      ) : (
        <Group justify="flex-end" align="center">
          <Button size="xs" variant="light" onClick={createScenario}>
            New Scenario
          </Button>
        </Group>
      )}

      <Select
        label="Active scenario"
        size="xs"
        value={activeScenario.id}
        data={scenarios.map((scenario) => ({ value: scenario.id, label: scenario.name }))}
        onChange={(value) => value && setActiveScenario(value)}
      />

      <Group gap="xs">
        <Badge size="sm" color={activeScenario.status === 'baseline' ? 'blue' : 'orange'}>
          {activeScenario.status ?? 'policy'}
        </Badge>
        {activeScenario.status !== 'baseline' && (
          <Button size="xs" variant="subtle" color="red" onClick={() => deleteScenario(activeScenario.id)}>
            Delete
          </Button>
        )}
      </Group>

      <TextInput
        label="Name"
        size="xs"
        value={activeScenario.name}
        onChange={(event) => updateScenario(activeScenario.id, { name: event.currentTarget.value })}
      />

      <TextInput
        label="Description"
        size="xs"
        value={activeScenario.description ?? ''}
        onChange={(event) => updateScenario(activeScenario.id, { description: event.currentTarget.value || undefined })}
      />

      <Group grow>
        <NumberInput
          label="Start"
          size="xs"
          value={numericValue(activeScenario.overrides?.sim_config?.start)}
          onChange={(value) =>
            updateScenario(activeScenario.id, {
              overrides: {
                sim_config: {
                  ...(activeScenario.overrides?.sim_config ?? {}),
                  start: value === '' ? undefined : Number(value),
                },
              },
            })
          }
        />
        <NumberInput
          label="Stop"
          size="xs"
          value={numericValue(activeScenario.overrides?.sim_config?.stop)}
          onChange={(value) =>
            updateScenario(activeScenario.id, {
              overrides: {
                sim_config: {
                  ...(activeScenario.overrides?.sim_config ?? {}),
                  stop: value === '' ? undefined : Number(value),
                },
              },
            })
          }
        />
      </Group>

      <Group grow>
        <NumberInput
          label="dt"
          size="xs"
          value={numericValue(activeScenario.overrides?.sim_config?.dt)}
          onChange={(value) =>
            updateScenario(activeScenario.id, {
              overrides: {
                sim_config: {
                  ...(activeScenario.overrides?.sim_config ?? {}),
                  dt: value === '' ? undefined : Number(value),
                },
              },
            })
          }
        />
        <NumberInput
          label="return_step"
          size="xs"
          value={numericValue(activeScenario.overrides?.sim_config?.return_step)}
          onChange={(value) =>
            updateScenario(activeScenario.id, {
              overrides: {
                sim_config: {
                  ...(activeScenario.overrides?.sim_config ?? {}),
                  return_step: value === '' ? undefined : Number(value),
                },
              },
            })
          }
        />
      </Group>

      <Paper withBorder p="xs">
        <Text size="xs" fw={600} mb={6}>
          Parameter overrides
        </Text>
        <ScrollArea h={150}>
          <Stack gap="xs">
            {paramEntries.length === 0 && (
              <Text size="xs" c="dimmed">
                No overrides yet. Add keys used in equations.
              </Text>
            )}
            {paramEntries.map(([key, value]) => (
              <Group key={key} grow align="end">
                <TextInput value={key} size="xs" disabled />
                <NumberInput
                  size="xs"
                  value={numericValue(value)}
                  onChange={(next) =>
                    updateScenario(activeScenario.id, {
                      overrides: {
                        params: {
                          ...(activeScenario.overrides?.params ?? {}),
                          [key]: next === '' ? 0 : Number(next),
                        },
                      },
                    })
                  }
                />
                <Button
                  size="xs"
                  variant="subtle"
                  color="red"
                  onClick={() => {
                    const params = { ...(activeScenario.overrides?.params ?? {}) };
                    delete params[key];
                    updateScenario(activeScenario.id, { overrides: { params } });
                  }}
                >
                  Remove
                </Button>
              </Group>
            ))}
            <Group grow align="end">
              <TextInput
                size="xs"
                placeholder="parameter_name"
                onKeyDown={(event) => {
                  if (event.key !== 'Enter') return;
                  const key = event.currentTarget.value.trim();
                  if (!key) return;
                  event.preventDefault();
                  updateScenario(activeScenario.id, {
                    overrides: {
                      params: {
                        ...(activeScenario.overrides?.params ?? {}),
                        [key]: 0,
                      },
                    },
                  });
                  event.currentTarget.value = '';
                }}
              />
              <Text size="xs" c="dimmed">
                Press Enter to add
              </Text>
            </Group>
          </Stack>
        </ScrollArea>
      </Paper>
    </Stack>
  );
}
