import { useMemo } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  ColorInput,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Textarea,
} from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import type {
  ModelDocument,
  OptimisationConfig,
  OptimisationMode,
  OptimisationObjective,
  OptimisationParameterRange,
} from '../../types/model';

type Props = {
  config: OptimisationConfig;
  model: ModelDocument;
  onUpdate: (patch: Partial<OptimisationConfig>) => void;
};

const METRIC_OPTIONS = [
  { value: 'final', label: 'Final value' },
  { value: 'max', label: 'Maximum' },
  { value: 'min', label: 'Minimum' },
  { value: 'mean', label: 'Mean' },
];

const DIRECTION_OPTIONS = [
  { value: 'minimize', label: 'Minimize' },
  { value: 'maximize', label: 'Maximize' },
];

type NamedNode = { name: string; label: string; type: string };

function namedNodes(model: ModelDocument): NamedNode[] {
  return model.nodes.filter(
    (n): n is NamedNode & typeof n =>
      n.type !== 'text' && n.type !== 'cloud' && n.type !== 'cld_symbol' && n.type !== 'phantom' && 'name' in n,
  ) as unknown as NamedNode[];
}

function getVariableOptions(model: ModelDocument) {
  return namedNodes(model).map((n) => ({ value: n.name, label: n.label ?? n.name }));
}

function getParamOptions(model: ModelDocument, existingNames: string[]) {
  const existing = new Set(existingNames);
  const all = namedNodes(model).filter((n) => !existing.has(n.name));
  const stocks = all.filter((n) => n.type === 'stock');
  const auxs = all.filter((n) => n.type === 'aux');
  const flows = all.filter((n) => n.type === 'flow');
  const groups = [];
  if (stocks.length > 0) groups.push({ group: 'Stocks', items: stocks.map((n) => ({ value: n.name, label: n.label ?? n.name })) });
  if (auxs.length > 0) groups.push({ group: 'Variables', items: auxs.map((n) => ({ value: n.name, label: n.label ?? n.name })) });
  if (flows.length > 0) groups.push({ group: 'Flows', items: flows.map((n) => ({ value: n.name, label: n.label ?? n.name })) });
  return groups;
}

function getNodeValue(model: ModelDocument, name: string): number {
  const node = model.nodes.find((n) => 'name' in n && (n as any).name === name);
  if (!node) return 0;
  if (node.type === 'stock') return typeof node.initial_value === 'number' ? node.initial_value : parseFloat(node.initial_value) || 0;
  const eq = 'equation' in node ? (node as any).equation : '0';
  const val = parseFloat(eq);
  return isNaN(val) ? 0 : val;
}

function estimateEvaluations(params: OptimisationParameterRange[]): number {
  if (params.length === 0) return 0;
  return params.reduce((acc, p) => acc * (Math.max(1, p.steps) + 1), 1);
}

export function OptimisationEditorPanel({ config, model, onUpdate }: Props) {
  const variableOptions = useMemo(() => getVariableOptions(model), [model]);
  const paramOptions = useMemo(
    () => getParamOptions(model, config.parameters.map((p) => p.name)),
    [model, config.parameters],
  );
  const evalCount = estimateEvaluations(config.parameters);

  const handleAddParam = (name: string | null) => {
    if (!name) return;
    const baseVal = getNodeValue(model, name);
    const low = baseVal * 0.5;
    const high = baseVal === 0 ? 10 : baseVal * 1.5;
    onUpdate({
      parameters: [...config.parameters, { name, low, high, steps: 5 }],
    });
  };

  const handleUpdateParam = (idx: number, patch: Partial<OptimisationParameterRange>) => {
    const params = config.parameters.map((p, i) => (i === idx ? { ...p, ...patch } : p));
    onUpdate({ parameters: params });
  };

  const handleRemoveParam = (idx: number) => {
    onUpdate({ parameters: config.parameters.filter((_, i) => i !== idx) });
  };

  const handleAddObjective = () => {
    const id = `obj_${Date.now()}`;
    const output = variableOptions[0]?.value ?? '';
    const objectives: OptimisationObjective[] = [
      ...(config.objectives ?? []),
      { id, output, metric: 'final', direction: 'minimize', weight: 1 },
    ];
    onUpdate({ objectives });
  };

  const handleUpdateObjective = (idx: number, patch: Partial<OptimisationObjective>) => {
    const objectives = (config.objectives ?? []).map((o, i) => (i === idx ? { ...o, ...patch } : o));
    onUpdate({ objectives });
  };

  const handleRemoveObjective = (idx: number) => {
    onUpdate({ objectives: (config.objectives ?? []).filter((_, i) => i !== idx) });
  };

  return (
      <Stack gap="md" p="md">
        {/* Common fields */}
        <Paper p="md" withBorder>
          <Stack gap="sm">
            <Group gap="sm" align="end">
              <TextInput
                label="Name"
                size="xs"
                value={config.name}
                onChange={(e) => onUpdate({ name: e.currentTarget.value })}
                style={{ flex: 1 }}
              />
              <ColorInput
                label="Color"
                size="xs"
                value={config.color ?? '#5c2d91'}
                onChange={(v) => onUpdate({ color: v })}
                w={100}
                format="hex"
                swatches={['#5c2d91', '#1b6ca8', '#2b8a3e', '#e67700', '#c2255c', '#d46a00']}
              />
            </Group>
            <Textarea
              label="Description"
              size="xs"
              value={config.description ?? ''}
              onChange={(e) => onUpdate({ description: e.currentTarget.value })}
              autosize
              minRows={1}
              maxRows={3}
            />
            <Box>
              <Text size="xs" fw={500} mb={4}>
                Mode
              </Text>
              <SegmentedControl
                size="xs"
                fullWidth
                value={config.mode}
                onChange={(v) => onUpdate({ mode: v as OptimisationMode })}
                data={[
                  { value: 'goal-seek', label: 'Goal Seek' },
                  { value: 'multi-objective', label: 'Multi-Objective' },
                  { value: 'policy', label: 'Policy' },
                ]}
              />
            </Box>
          </Stack>
        </Paper>

        {/* Goal Seek */}
        {config.mode === 'goal-seek' && (
          <Paper p="md" withBorder>
            <Stack gap="sm">
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                Goal Seek Settings
              </Text>
              <Select
                label="Output variable"
                size="xs"
                data={variableOptions}
                value={config.output ?? ''}
                onChange={(v) => onUpdate({ output: v ?? '' })}
                searchable
              />
              <Group gap="sm">
                <NumberInput
                  label="Target value"
                  size="xs"
                  value={config.target_value ?? 0}
                  onChange={(v) => onUpdate({ target_value: typeof v === 'number' ? v : 0 })}
                  style={{ flex: 1 }}
                />
                <Select
                  label="Metric"
                  size="xs"
                  data={METRIC_OPTIONS}
                  value={config.metric ?? 'final'}
                  onChange={(v) => onUpdate({ metric: (v as any) ?? 'final' })}
                  w={120}
                />
              </Group>
            </Stack>
          </Paper>
        )}

        {/* Multi-Objective */}
        {config.mode === 'multi-objective' && (
          <Paper p="md" withBorder>
            <Stack gap="sm">
              <Group justify="space-between">
                <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                  Objectives
                </Text>
                <Button size="compact-xs" variant="subtle" leftSection={<IconPlus size={12} />} onClick={handleAddObjective}>
                  Add
                </Button>
              </Group>
              {(config.objectives ?? []).length === 0 && (
                <Text size="xs" c="dimmed" ta="center" py="sm">
                  Add at least one objective
                </Text>
              )}
              {(config.objectives ?? []).map((obj, idx) => (
                <Paper key={obj.id} p="xs" withBorder style={{ background: '#fafafa' }}>
                  <Group gap="xs" align="end" wrap="nowrap">
                    <Select
                      label="Output"
                      size="xs"
                      data={variableOptions}
                      value={obj.output}
                      onChange={(v) => handleUpdateObjective(idx, { output: v ?? '' })}
                      style={{ flex: 1 }}
                      searchable
                    />
                    <Select
                      label="Metric"
                      size="xs"
                      data={METRIC_OPTIONS}
                      value={obj.metric}
                      onChange={(v) => handleUpdateObjective(idx, { metric: (v as any) ?? 'final' })}
                      w={100}
                    />
                    <Select
                      label="Direction"
                      size="xs"
                      data={DIRECTION_OPTIONS}
                      value={obj.direction}
                      onChange={(v) => handleUpdateObjective(idx, { direction: (v as any) ?? 'minimize' })}
                      w={100}
                    />
                    <NumberInput
                      label="Weight"
                      size="xs"
                      value={obj.weight}
                      onChange={(v) => handleUpdateObjective(idx, { weight: typeof v === 'number' ? v : 1 })}
                      w={70}
                      min={0}
                      step={0.1}
                    />
                    <ActionIcon size="sm" variant="subtle" color="red" onClick={() => handleRemoveObjective(idx)}>
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Group>
                </Paper>
              ))}
            </Stack>
          </Paper>
        )}

        {/* Policy */}
        {config.mode === 'policy' && (
          <Paper p="md" withBorder>
            <Stack gap="sm">
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                Policy Ranking Settings
              </Text>
              <Select
                label="Output variable"
                size="xs"
                data={variableOptions}
                value={config.policy_output ?? config.output ?? ''}
                onChange={(v) => onUpdate({ policy_output: v ?? '' })}
                searchable
              />
              <Group gap="sm">
                <Select
                  label="Metric"
                  size="xs"
                  data={METRIC_OPTIONS}
                  value={config.policy_metric ?? config.metric ?? 'final'}
                  onChange={(v) => onUpdate({ policy_metric: (v as any) ?? 'final' })}
                  style={{ flex: 1 }}
                />
                <Select
                  label="Direction"
                  size="xs"
                  data={DIRECTION_OPTIONS}
                  value={config.policy_direction ?? 'minimize'}
                  onChange={(v) => onUpdate({ policy_direction: (v as any) ?? 'minimize' })}
                  style={{ flex: 1 }}
                />
              </Group>
              <Text size="xs" c="dimmed">
                Runs all scenarios and ranks them by the selected metric. No parameter grid needed.
              </Text>
            </Stack>
          </Paper>
        )}

        {/* Parameters (not for policy mode) */}
        {config.mode !== 'policy' && (
          <Paper p="md" withBorder>
            <Stack gap="sm">
              <Text size="xs" fw={600} c="dimmed" tt="uppercase">
                Parameters
              </Text>
              {config.parameters.length > 0 && (
                <Table fz="xs" verticalSpacing={4}>
                  <Table.Thead>
                    <Table.Tr>
                      <Table.Th>Parameter</Table.Th>
                      <Table.Th>Low</Table.Th>
                      <Table.Th>High</Table.Th>
                      <Table.Th>Steps</Table.Th>
                      <Table.Th w={30} />
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {config.parameters.map((p, idx) => (
                      <Table.Tr key={p.name}>
                        <Table.Td>
                          <Text size="xs" truncate>
                            {p.name}
                          </Text>
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            size="xs"
                            value={p.low}
                            onChange={(v) => handleUpdateParam(idx, { low: typeof v === 'number' ? v : 0 })}
                            hideControls
                            styles={{ input: { width: 70 } }}
                          />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            size="xs"
                            value={p.high}
                            onChange={(v) => handleUpdateParam(idx, { high: typeof v === 'number' ? v : 0 })}
                            hideControls
                            styles={{ input: { width: 70 } }}
                          />
                        </Table.Td>
                        <Table.Td>
                          <NumberInput
                            size="xs"
                            value={p.steps}
                            onChange={(v) => handleUpdateParam(idx, { steps: typeof v === 'number' ? v : 1 })}
                            min={1}
                            max={50}
                            hideControls
                            styles={{ input: { width: 50 } }}
                          />
                        </Table.Td>
                        <Table.Td>
                          <ActionIcon size="xs" variant="subtle" color="red" onClick={() => handleRemoveParam(idx)}>
                            <IconTrash size={12} />
                          </ActionIcon>
                        </Table.Td>
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              )}
              <Select
                size="xs"
                placeholder="Add parameter..."
                data={paramOptions}
                value={null}
                onChange={handleAddParam}
                searchable
                clearable
              />
              {evalCount > 0 && (
                <Text size="xs" c={evalCount > 500 ? 'red' : 'dimmed'}>
                  {evalCount.toLocaleString()} evaluation{evalCount !== 1 ? 's' : ''}
                  {evalCount > 500 ? ' (capped at 500)' : ''}
                </Text>
              )}
            </Stack>
          </Paper>
        )}
      </Stack>
  );
}
