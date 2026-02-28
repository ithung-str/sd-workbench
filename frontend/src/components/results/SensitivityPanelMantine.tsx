import { Button, Group, NumberInput, Paper, Select, Stack, Table, Text, TextInput, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { useEditorStore } from '../../state/editorStore';
import type { MonteCarloParameter } from '../../types/model';

function defaultOutput(outputs: string[]): string {
  return outputs[0] ?? 'time';
}

export function buildSensitivityOutputOptions(
  outputs: string[],
  nodeNames: string[],
): string[] {
  const unique = new Set<string>();
  for (const name of outputs.concat(nodeNames)) {
    const normalized = name?.trim();
    if (!normalized || unique.has(normalized)) continue;
    unique.add(normalized);
  }
  return [...unique];
}

export function SensitivityPanel() {
  const model = useEditorStore((s) => s.model);
  const runOAT = useEditorStore((s) => s.runOATSensitivity);
  const runMC = useEditorStore((s) => s.runMonteCarlo);
  const isRunningSensitivity = useEditorStore((s) => s.isRunningSensitivity);
  const oatResults = useEditorStore((s) => s.oatResults);
  const monteCarloResults = useEditorStore((s) => s.monteCarloResults);

  const outputOptions = useMemo(
    () =>
      buildSensitivityOutputOptions(
        model.outputs,
        model.nodes
          .filter((n) => n.type !== 'text' && n.type !== 'cloud' && n.type !== 'cld_symbol')
          .map((n: any) => n.name),
      ),
    [model.outputs, model.nodes],
  );

  const [output, setOutput] = useState(defaultOutput(outputOptions));
  const [metric, setMetric] = useState<'final' | 'max' | 'min' | 'mean'>('final');
  const [paramName, setParamName] = useState('');
  const [low, setLow] = useState<number>(0);
  const [high, setHigh] = useState<number>(1);
  const [steps, setSteps] = useState<number>(5);
  const [runs, setRuns] = useState<number>(100);
  const [seed, setSeed] = useState<number>(42);

  const parameterSpec: MonteCarloParameter[] =
    paramName.trim().length > 0
      ? [
          {
            name: paramName.trim(),
            distribution: 'uniform',
            min: low,
            max: high,
          },
        ]
      : [];

  return (
    <Stack gap="sm">
      <Title order={5}>Sensitivity</Title>
      <Group grow>
        <Select
          label="Output"
          size="xs"
          value={output}
          onChange={(value) => value && setOutput(value)}
          data={outputOptions.map((value) => ({ value, label: value }))}
        />
        <Select
          label="Metric"
          size="xs"
          value={metric}
          onChange={(value) => setMetric((value as typeof metric) ?? 'final')}
          data={['final', 'max', 'min', 'mean'].map((value) => ({ value, label: value }))}
        />
      </Group>

      <Paper withBorder p="sm">
        <Text fw={600} size="sm" mb="xs">
          Parameter
        </Text>
        <Group grow>
          <TextInput label="Name" size="xs" value={paramName} onChange={(event) => setParamName(event.currentTarget.value)} />
          <NumberInput label="Low" size="xs" value={low} onChange={(value) => setLow(Number(value) || 0)} />
          <NumberInput label="High" size="xs" value={high} onChange={(value) => setHigh(Number(value) || 0)} />
          <NumberInput label="Steps" size="xs" min={2} value={steps} onChange={(value) => setSteps(Math.max(2, Number(value) || 2))} />
        </Group>
      </Paper>

      <Group>
        <Button
          size="xs"
          variant="light"
          loading={isRunningSensitivity}
          onClick={() =>
            void runOAT({
              output,
              metric,
              parameters: paramName.trim() ? [{ name: paramName.trim(), low, high, steps }] : [],
            })
          }
        >
          Run OAT
        </Button>

        <NumberInput label="Runs" size="xs" min={2} value={runs} onChange={(value) => setRuns(Math.max(2, Number(value) || 2))} />
        <NumberInput label="Seed" size="xs" value={seed} onChange={(value) => setSeed(Number(value) || 0)} />
        <Button
          size="xs"
          loading={isRunningSensitivity}
          onClick={() =>
            void runMC({
              output,
              metric,
              runs,
              seed,
              parameters: parameterSpec,
            })
          }
        >
          Run Monte Carlo
        </Button>
      </Group>

      {oatResults && (
        <Paper withBorder p="sm">
          <Text fw={600} size="sm" mb="xs">
            OAT Ranking (Tornado)
          </Text>
          <Table striped withRowBorders withColumnBorders>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Parameter</Table.Th>
                <Table.Th>Swing</Table.Th>
                <Table.Th>Normalized</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {oatResults.items.map((item) => (
                <Table.Tr key={item.parameter}>
                  <Table.Td>{item.parameter}</Table.Td>
                  <Table.Td>{item.swing.toFixed(4)}</Table.Td>
                  <Table.Td>{item.normalized_swing.toFixed(4)}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Paper>
      )}

      {monteCarloResults && (
        <Paper withBorder p="sm">
          <Text fw={600} size="sm" mb="xs">
            Monte Carlo Percentiles
          </Text>
          <Group gap="md">
            <Text size="sm">p05: {monteCarloResults.quantiles.p05.toFixed(4)}</Text>
            <Text size="sm">p50: {monteCarloResults.quantiles.p50.toFixed(4)}</Text>
            <Text size="sm">p95: {monteCarloResults.quantiles.p95.toFixed(4)}</Text>
            <Text size="sm">mean: {monteCarloResults.quantiles.mean.toFixed(4)}</Text>
          </Group>
        </Paper>
      )}
    </Stack>
  );
}
