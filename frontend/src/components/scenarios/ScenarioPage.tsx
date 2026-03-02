import { useMemo, useState } from 'react';
import {
  Alert,
  Badge,
  Box,
  Button,
  Group,
  NumberInput,
  Paper,
  ScrollArea,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import {
  IconPlayerPlay,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import { ResultsChart } from '../results/ResultsChart';
import { ResultsTable } from '../results/ResultsTable';

function numericValue(value: number | string | undefined): number | '' {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : '';
  }
  return '';
}

export function ScenarioPage() {
  const model = useEditorStore((s) => s.model);
  const scenarios = useEditorStore((s) => s.scenarios);
  const activeScenarioId = useEditorStore((s) => s.activeScenarioId);
  const setActiveScenario = useEditorStore((s) => s.setActiveScenario);
  const createScenario = useEditorStore((s) => s.createScenario);
  const updateScenario = useEditorStore((s) => s.updateScenario);
  const deleteScenario = useEditorStore((s) => s.deleteScenario);
  const runScenarioBatch = useEditorStore((s) => s.runScenarioBatch);
  const isRunningBatch = useEditorStore((s) => s.isRunningBatch);
  const compareResults = useEditorStore((s) => s.compareResults);

  const [resultsView, setResultsView] = useState<'chart' | 'table'>('chart');

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0],
    [scenarios, activeScenarioId],
  );

  const paramEntries = Object.entries(activeScenario?.overrides?.params ?? {});

  const variableOptions = useMemo(() => {
    return model.nodes
      .filter(
        (n) =>
          n.type !== 'text' &&
          n.type !== 'cloud' &&
          n.type !== 'cld_symbol' &&
          n.type !== 'phantom',
      )
      .map((n) => ({ value: n.name, label: `${n.label} (${n.name})` }));
  }, [model.nodes]);

  return (
    <Box className="scenario-page" p="md" style={{ height: '100%', overflow: 'auto' }}>
      <Group justify="space-between" mb="md">
        <Group>
          <Title order={4}>Scenario Builder</Title>
        </Group>
        <Group>
          <Button
            leftSection={<IconPlayerPlay size={16} />}
            onClick={() => void runScenarioBatch()}
            loading={isRunningBatch}
          >
            Run Scenarios
          </Button>
        </Group>
      </Group>
        <Box
          style={{
            display: 'flex',
            flexDirection: 'row',
            gap: 16,
            alignItems: 'flex-start',
            width: '100%',
          }}
        >
          {/* Left panel: Scenario list */}
          <Paper withBorder p="md" style={{ width: 340, flex: '0 0 340px' }}>
            <Stack gap="sm">
              <Group justify="space-between">
                <Title order={5}>Scenarios</Title>
                <Button
                  size="xs"
                  variant="light"
                  leftSection={<IconPlus size={14} />}
                  onClick={createScenario}
                >
                  New
                </Button>
              </Group>

              <ScrollArea h={500}>
                <Stack gap="xs">
                  {scenarios.map((scenario) => {
                    const isActive = scenario.id === activeScenarioId;
                    return (
                      <Paper
                        key={scenario.id}
                        withBorder
                        p="xs"
                        style={{
                          borderColor: isActive
                            ? 'var(--mantine-color-blue-5)'
                            : undefined,
                          background: isActive
                            ? 'var(--mantine-color-blue-0)'
                            : undefined,
                          cursor: 'pointer',
                        }}
                        onClick={() => setActiveScenario(scenario.id)}
                      >
                        <Group justify="space-between" wrap="nowrap">
                          <div style={{ minWidth: 0 }}>
                            <Text size="sm" fw={600} truncate>
                              {scenario.name}
                            </Text>
                            <Group gap={4}>
                              <Badge
                                size="xs"
                                color={
                                  scenario.status === 'baseline'
                                    ? 'blue'
                                    : 'orange'
                                }
                              >
                                {scenario.status ?? 'policy'}
                              </Badge>
                              {scenario.description && (
                                <Text size="xs" c="dimmed" truncate>
                                  {scenario.description}
                                </Text>
                              )}
                            </Group>
                          </div>
                          {scenario.status !== 'baseline' && (
                            <Button
                              size="compact-xs"
                              variant="subtle"
                              color="red"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteScenario(scenario.id);
                              }}
                            >
                              <IconTrash size={14} />
                            </Button>
                          )}
                        </Group>
                      </Paper>
                    );
                  })}
                </Stack>
              </ScrollArea>
            </Stack>
          </Paper>

          {/* Right area: Active scenario editor + results */}
          <Stack gap="md" style={{ minWidth: 0, flex: '1 1 auto' }}>
            {activeScenario ? (
              <>
                {/* Scenario editor */}
                <Paper withBorder p="md">
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Title order={5}>
                        {activeScenario.name}
                      </Title>
                      <Badge
                        color={
                          activeScenario.status === 'baseline'
                            ? 'blue'
                            : 'orange'
                        }
                      >
                        {activeScenario.status ?? 'policy'}
                      </Badge>
                    </Group>

                    <Group grow>
                      <TextInput
                        label="Name"
                        value={activeScenario.name}
                        onChange={(e) =>
                          updateScenario(activeScenario.id, {
                            name: e.currentTarget.value,
                          })
                        }
                      />
                      <TextInput
                        label="Description"
                        value={activeScenario.description ?? ''}
                        onChange={(e) =>
                          updateScenario(activeScenario.id, {
                            description:
                              e.currentTarget.value || undefined,
                          })
                        }
                      />
                      <Select
                        label="Status"
                        value={activeScenario.status ?? 'policy'}
                        data={[
                          { value: 'baseline', label: 'Baseline' },
                          { value: 'policy', label: 'Policy' },
                          { value: 'draft', label: 'Draft' },
                          { value: 'archived', label: 'Archived' },
                        ]}
                        onChange={(value) =>
                          value &&
                          updateScenario(activeScenario.id, {
                            status: value as 'baseline' | 'policy' | 'draft' | 'archived',
                          })
                        }
                      />
                    </Group>

                    <Text fw={600} size="sm" mt="xs">
                      Simulation Config Overrides
                    </Text>
                    <Group grow>
                      <NumberInput
                        label="Start"
                        size="sm"
                        value={numericValue(
                          activeScenario.overrides?.sim_config?.start,
                        )}
                        onChange={(value) =>
                          updateScenario(activeScenario.id, {
                            overrides: {
                              sim_config: {
                                ...(activeScenario.overrides?.sim_config ??
                                  {}),
                                start:
                                  value === ''
                                    ? undefined
                                    : Number(value),
                              },
                            },
                          })
                        }
                      />
                      <NumberInput
                        label="Stop"
                        size="sm"
                        value={numericValue(
                          activeScenario.overrides?.sim_config?.stop,
                        )}
                        onChange={(value) =>
                          updateScenario(activeScenario.id, {
                            overrides: {
                              sim_config: {
                                ...(activeScenario.overrides?.sim_config ??
                                  {}),
                                stop:
                                  value === ''
                                    ? undefined
                                    : Number(value),
                              },
                            },
                          })
                        }
                      />
                      <NumberInput
                        label="dt"
                        size="sm"
                        value={numericValue(
                          activeScenario.overrides?.sim_config?.dt,
                        )}
                        onChange={(value) =>
                          updateScenario(activeScenario.id, {
                            overrides: {
                              sim_config: {
                                ...(activeScenario.overrides?.sim_config ??
                                  {}),
                                dt:
                                  value === ''
                                    ? undefined
                                    : Number(value),
                              },
                            },
                          })
                        }
                      />
                      <NumberInput
                        label="Return Step"
                        size="sm"
                        value={numericValue(
                          activeScenario.overrides?.sim_config?.return_step,
                        )}
                        onChange={(value) =>
                          updateScenario(activeScenario.id, {
                            overrides: {
                              sim_config: {
                                ...(activeScenario.overrides?.sim_config ??
                                  {}),
                                return_step:
                                  value === ''
                                    ? undefined
                                    : Number(value),
                              },
                            },
                          })
                        }
                      />
                    </Group>

                    <Text fw={600} size="sm" mt="xs">
                      Parameter Overrides
                    </Text>
                    <Table striped highlightOnHover withTableBorder>
                      <Table.Thead>
                        <Table.Tr>
                          <Table.Th>Parameter</Table.Th>
                          <Table.Th>Value</Table.Th>
                          <Table.Th w={80} />
                        </Table.Tr>
                      </Table.Thead>
                      <Table.Tbody>
                        {paramEntries.length === 0 && (
                          <Table.Tr>
                            <Table.Td colSpan={3}>
                              <Text size="sm" c="dimmed">
                                No parameter overrides. Add one below.
                              </Text>
                            </Table.Td>
                          </Table.Tr>
                        )}
                        {paramEntries.map(([key, value]) => (
                          <Table.Tr key={key}>
                            <Table.Td>
                              <Text size="sm" fw={500}>
                                {key}
                              </Text>
                            </Table.Td>
                            <Table.Td>
                              <NumberInput
                                size="xs"
                                value={numericValue(value)}
                                onChange={(next) =>
                                  updateScenario(activeScenario.id, {
                                    overrides: {
                                      params: {
                                        ...(activeScenario.overrides
                                          ?.params ?? {}),
                                        [key]:
                                          next === ''
                                            ? 0
                                            : Number(next),
                                      },
                                    },
                                  })
                                }
                                style={{ maxWidth: 200 }}
                              />
                            </Table.Td>
                            <Table.Td>
                              <Button
                                size="compact-xs"
                                variant="subtle"
                                color="red"
                                onClick={() => {
                                  const params = {
                                    ...(activeScenario.overrides?.params ??
                                      {}),
                                  };
                                  delete params[key];
                                  updateScenario(activeScenario.id, {
                                    overrides: { params },
                                  });
                                }}
                              >
                                Remove
                              </Button>
                            </Table.Td>
                          </Table.Tr>
                        ))}
                        <Table.Tr>
                          <Table.Td colSpan={3}>
                            <TextInput
                              size="xs"
                              placeholder="Type parameter name and press Enter"
                              onKeyDown={(e) => {
                                if (e.key !== 'Enter') return;
                                const key =
                                  e.currentTarget.value.trim();
                                if (!key) return;
                                e.preventDefault();
                                updateScenario(activeScenario.id, {
                                  overrides: {
                                    params: {
                                      ...(activeScenario.overrides
                                        ?.params ?? {}),
                                      [key]: 0,
                                    },
                                  },
                                });
                                e.currentTarget.value = '';
                              }}
                            />
                          </Table.Td>
                        </Table.Tr>
                      </Table.Tbody>
                    </Table>
                  </Stack>
                </Paper>

                {/* Batch results preview */}
                <Paper withBorder p="md">
                  <Stack gap="sm">
                    <Group justify="space-between">
                      <Title order={5}>Comparison Results</Title>
                      <Group gap="xs">
                        <Button
                          size="xs"
                          variant={resultsView === 'chart' ? 'filled' : 'light'}
                          onClick={() => setResultsView('chart')}
                        >
                          Chart
                        </Button>
                        <Button
                          size="xs"
                          variant={resultsView === 'table' ? 'filled' : 'light'}
                          onClick={() => setResultsView('table')}
                        >
                          Table
                        </Button>
                      </Group>
                    </Group>

                    {!compareResults ? (
                      <Alert color="violet" variant="light">
                        Click "Run Scenarios" to run all scenarios and see
                        comparison results.
                      </Alert>
                    ) : compareResults.runs.length === 0 ? (
                      <Alert color="yellow" variant="light">
                        No scenario runs returned. Check your scenario
                        configuration.
                      </Alert>
                    ) : resultsView === 'chart' ? (
                      <Box h={400}>
                        <ResultsChart
                          results={null}
                          compareRuns={compareResults.runs}
                        />
                      </Box>
                    ) : (
                      <Box style={{ maxHeight: 400, overflow: 'auto' }}>
                        <ResultsTable
                          results={null}
                          compareRuns={compareResults.runs}
                        />
                      </Box>
                    )}

                    {compareResults &&
                      compareResults.errors.length > 0 && (
                        <Stack gap="xs">
                          {compareResults.errors.map((err) => (
                            <Alert
                              key={err.scenario_id}
                              color="red"
                              variant="light"
                            >
                              <Text size="sm" fw={600}>
                                {err.scenario_name}:
                              </Text>
                              <Text size="sm">{err.message}</Text>
                            </Alert>
                          ))}
                        </Stack>
                      )}
                  </Stack>
                </Paper>
              </>
            ) : (
              <Alert color="blue" variant="light">
                Create a scenario to get started.
              </Alert>
            )}
          </Stack>
        </Box>
    </Box>
  );
}
