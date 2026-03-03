import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  MultiSelect,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { BatchSimulateResponse, ScenarioDefinition, ScenarioRunResult } from '../../types/model';

type ScenarioResultsPanelProps = {
  compareResults: BatchSimulateResponse | null;
  scenarios: ScenarioDefinition[];
  isRunningBatch: boolean;
};

function toCompareRows(runs: ScenarioRunResult[], variable: string) {
  const longest = runs.reduce(
    (max, run) => Math.max(max, run.series.time?.length ?? 0),
    0,
  );
  return Array.from({ length: longest }).map((_, i) => {
    const row: Record<string, number | string> = {
      time: runs[0]?.series.time?.[i] ?? i,
    };
    for (const run of runs) {
      row[run.scenario_name] = run.series[variable]?.[i] ?? Number.NaN;
    }
    return row;
  });
}

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCompareCsv(runs: ScenarioRunResult[], variables: string[]): string {
  const time = runs[0]?.series.time ?? [];
  const headers = ['time'];
  for (const variable of variables) {
    for (const run of runs) {
      headers.push(`${variable}_${run.scenario_name}`);
    }
  }
  const lines = [headers.map(csvEscape).join(',')];
  for (let i = 0; i < time.length; i++) {
    const row = [String(time[i])];
    for (const variable of variables) {
      for (const run of runs) {
        row.push(String(run.series[variable]?.[i] ?? NaN));
      }
    }
    lines.push(row.join(','));
  }
  return lines.join('\n');
}

const FALLBACK_COLORS = ['#1b6ca8', '#d46a00', '#2f7d32', '#8a2be2', '#d32f2f', '#00838f'];

export function ScenarioResultsPanel({
  compareResults,
  scenarios,
  isRunningBatch,
}: ScenarioResultsPanelProps) {
  const [view, setView] = useState<string>('chart');
  const [selectedVariables, setSelectedVariables] = useState<string[]>([]);
  const [tableVariable, setTableVariable] = useState<string>('');

  const runs = compareResults?.runs ?? [];

  const compareVariables = useMemo(() => {
    const first = runs[0];
    if (!first) return [];
    return Object.keys(first.series).filter((key) => key !== 'time');
  }, [runs]);

  // Effective chart variables: default to first if nothing selected
  const chartVariables = useMemo(() => {
    if (selectedVariables.length > 0) return selectedVariables;
    return compareVariables.slice(0, 1);
  }, [selectedVariables, compareVariables]);

  const effectiveTableVariable = tableVariable || compareVariables[0] || '';

  // Scenario color map
  const scenarioColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    scenarios.forEach((s, i) => {
      map[s.name] = s.color ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length];
    });
    return map;
  }, [scenarios]);

  const handleExportCsv = () => {
    const vars = chartVariables.length > 0 ? chartVariables : compareVariables;
    if (runs.length === 0 || vars.length === 0) return;
    const csv = toCompareCsv(runs, vars);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scenario-comparison.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Stack gap="sm" p="sm" style={{ height: '100%' }}>
      <Text fw={600} size="sm">
        Comparison Results
      </Text>

      <SegmentedControl
        size="xs"
        value={view}
        onChange={setView}
        data={[
          { label: 'Chart', value: 'chart' },
          { label: 'Table', value: 'table' },
          { label: 'Summary', value: 'summary' },
        ]}
      />

      {!compareResults && !isRunningBatch && (
        <Alert color="violet" variant="light">
          Click "Run Scenarios" to compare results.
        </Alert>
      )}

      {isRunningBatch && (
        <Alert color="blue" variant="light">
          Running simulations...
        </Alert>
      )}

      {compareResults && runs.length === 0 && !isRunningBatch && (
        <Alert color="yellow" variant="light">
          No scenario runs returned. Check your configuration.
        </Alert>
      )}

      {/* Chart view */}
      {view === 'chart' && runs.length > 0 && (
        <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
          <MultiSelect
            label="Variables"
            size="xs"
            value={selectedVariables}
            onChange={setSelectedVariables}
            data={compareVariables.map((v) => ({ value: v, label: v }))}
            placeholder="All variables (select to filter)"
            maxDropdownHeight={200}
            searchable
            maxValues={6}
          />
          {chartVariables.map((variable) => (
            <Box key={variable}>
              <Text size="xs" fw={500} c="dimmed" mb={2}>
                {variable}
              </Text>
              <Box h={220}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={toCompareRows(runs, variable)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="time" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Legend />
                    {runs.map((run) => (
                      <Line
                        key={`${run.scenario_id}-${variable}`}
                        type="monotone"
                        dataKey={run.scenario_name}
                        dot={false}
                        stroke={
                          scenarioColorMap[run.scenario_name] ??
                          FALLBACK_COLORS[0]
                        }
                        strokeWidth={2}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </Box>
            </Box>
          ))}
        </Stack>
      )}

      {/* Table view */}
      {view === 'table' && runs.length > 0 && (
        <Stack gap="xs" style={{ flex: 1, minHeight: 0 }}>
          <Select
            label="Variable"
            size="xs"
            value={effectiveTableVariable}
            onChange={(v) => v && setTableVariable(v)}
            data={compareVariables.map((v) => ({ value: v, label: v }))}
            w={220}
          />
          <Box style={{ flex: 1, overflow: 'auto' }}>
            <Table striped withTableBorder>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>time</Table.Th>
                  {runs.map((run) => (
                    <Table.Th key={run.scenario_id}>
                      {run.scenario_name}
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {Array.from({
                  length: runs[0]?.series.time?.length ?? 0,
                }).map((_, i) => (
                  <Table.Tr key={i}>
                    <Table.Td>
                      {(runs[0].series.time?.[i] ?? NaN).toFixed(2)}
                    </Table.Td>
                    {runs.map((run) => (
                      <Table.Td key={`${run.scenario_id}-${i}`}>
                        {(
                          run.series[effectiveTableVariable]?.[i] ?? NaN
                        ).toFixed(4)}
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Box>
        </Stack>
      )}

      {/* Summary / diff view */}
      {view === 'summary' && runs.length > 0 && (
        <Box style={{ flex: 1, overflow: 'auto' }}>
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Variable</Table.Th>
                {runs.map((run) => (
                  <Table.Th key={run.scenario_id}>
                    {run.scenario_name}
                  </Table.Th>
                ))}
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {compareVariables.map((variable) => {
                const finalValues = runs.map((run) => {
                  const vals = run.series[variable] ?? [];
                  return vals[vals.length - 1] ?? NaN;
                });
                const finiteValues = finalValues.filter(Number.isFinite);
                const maxVal =
                  finiteValues.length > 0
                    ? Math.max(...finiteValues)
                    : undefined;
                const minVal =
                  finiteValues.length > 0
                    ? Math.min(...finiteValues)
                    : undefined;
                const hasVariance = maxVal !== minVal;

                return (
                  <Table.Tr key={variable}>
                    <Table.Td>
                      <Text size="xs" fw={500}>
                        {variable}
                      </Text>
                    </Table.Td>
                    {finalValues.map((val, i) => (
                      <Table.Td key={runs[i].scenario_id}>
                        <Text
                          size="xs"
                          fw={hasVariance && val === maxVal ? 700 : undefined}
                          c={
                            hasVariance && val === maxVal
                              ? 'green'
                              : hasVariance && val === minVal
                                ? 'red'
                                : undefined
                          }
                        >
                          {Number.isFinite(val) ? val.toFixed(4) : 'N/A'}
                        </Text>
                      </Table.Td>
                    ))}
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Box>
      )}

      {/* Errors */}
      {compareResults && compareResults.errors.length > 0 && (
        <Stack gap="xs">
          {compareResults.errors.map((err) => (
            <Alert key={err.scenario_id} color="red" variant="light">
              <Text size="sm" fw={600}>
                {err.scenario_name}:
              </Text>
              <Text size="sm">{err.message}</Text>
            </Alert>
          ))}
        </Stack>
      )}

      {/* Export */}
      {runs.length > 0 && (
        <Button
          size="xs"
          variant="light"
          leftSection={<IconDownload size={14} />}
          onClick={handleExportCsv}
        >
          Export CSV
        </Button>
      )}
    </Stack>
  );
}
