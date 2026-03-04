import { useMemo } from 'react';
import {
  Alert,
  Box,
  Paper,
  Progress,
  ScrollArea,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import {
  BarChart,
  Bar,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { OptimisationConfig, OptimisationResult } from '../../types/model';

type Props = {
  config: OptimisationConfig | undefined;
  results: OptimisationResult | null;
  isRunning: boolean;
  progress: { current: number; total: number } | null;
  apiError: string | null;
};

export function OptimisationResultsPanel({ config, results, isRunning, progress, apiError }: Props) {
  if (!config) {
    return (
      <Box p="md">
        <Text size="sm" c="dimmed">
          Select a config to see results.
        </Text>
      </Box>
    );
  }

  if (apiError && !isRunning) {
    return (
      <Box p="md">
        <Alert icon={<IconInfoCircle size={16} />} color="red" variant="light" title="Optimisation failed">
          {apiError}
        </Alert>
      </Box>
    );
  }

  if (isRunning) {
    return (
      <Box p="md">
        <Stack gap="sm">
          <Text size="sm" fw={500}>
            Running optimisation...
          </Text>
          {progress && (
            <>
              <Progress
                value={(progress.current / Math.max(1, progress.total)) * 100}
                size="sm"
                animated
              />
              <Text size="xs" c="dimmed">
                {progress.current} / {progress.total} evaluations
              </Text>
            </>
          )}
        </Stack>
      </Box>
    );
  }

  if (!results) {
    return (
      <Box p="md">
        <Alert icon={<IconInfoCircle size={16} />} color="gray" variant="light">
          Click <strong>Run</strong> to see results.
        </Alert>
      </Box>
    );
  }

  return (
    <ScrollArea style={{ flex: 1 }} offsetScrollbars scrollbarSize={6}>
      <Stack gap="md" p="md">
        {results.mode === 'goal-seek' && <GoalSeekResults config={config} results={results} />}
        {results.mode === 'multi-objective' && <MultiObjectiveResults config={config} results={results} />}
        {results.mode === 'policy' && <PolicyResults results={results} />}
        {results.elapsedMs != null && (
          <Text size="xs" c="dimmed" ta="right">
            {results.totalEvaluations} evaluations in {(results.elapsedMs / 1000).toFixed(1)}s
          </Text>
        )}
      </Stack>
    </ScrollArea>
  );
}

// ── Goal Seek ──

function GoalSeekResults({ config, results }: { config: OptimisationConfig; results: OptimisationResult }) {
  const output = config.output ?? '';
  const baselineData = useMemo(() => {
    if (!results.baselineSeries?.[output] || !results.baselineSeries?.['time']) return [];
    return results.baselineSeries['time'].map((t, i) => ({
      time: t,
      baseline: results.baselineSeries![output]?.[i] ?? 0,
      optimised: results.optimisedSeries?.[output]?.[i] ?? 0,
    }));
  }, [results, output]);

  return (
    <>
      {/* Best parameters */}
      <Paper p="sm" withBorder>
        <Stack gap="xs">
          <Text size="xs" fw={600} c="dimmed" tt="uppercase">
            Best Parameters
          </Text>
          {results.bestParams && Object.keys(results.bestParams).length > 0 ? (
            <Table fz="xs" verticalSpacing={2}>
              <Table.Tbody>
                {Object.entries(results.bestParams).map(([k, v]) => (
                  <Table.Tr key={k}>
                    <Table.Td>{k}</Table.Td>
                    <Table.Td ta="right" fw={500}>
                      {typeof v === 'number' ? v.toFixed(4) : v}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          ) : (
            <Text size="xs" c="dimmed">
              No parameters varied
            </Text>
          )}
          <Text size="xs">
            Best metric: <strong>{results.bestMetric?.toFixed(4)}</strong>
            {results.targetValue != null && (
              <> (target: {results.targetValue}, gap: {results.gap?.toFixed(4)})</>
            )}
          </Text>
        </Stack>
      </Paper>

      {/* Before/After chart */}
      {baselineData.length > 0 && (
        <Paper p="sm" withBorder>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
            Before / After
          </Text>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={baselineData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="baseline" stroke="#adb5bd" strokeDasharray="5 5" name="Baseline" dot={false} />
              <Line type="monotone" dataKey="optimised" stroke={config.color ?? '#5c2d91'} name="Optimised" dot={false} />
              {results.targetValue != null && (
                <ReferenceLine y={results.targetValue} stroke="#e03131" strokeDasharray="4 4" label="Target" />
              )}
            </LineChart>
          </ResponsiveContainer>
        </Paper>
      )}
    </>
  );
}

// ── Multi-Objective ──

function MultiObjectiveResults({ config, results }: { config: OptimisationConfig; results: OptimisationResult }) {
  const objectives = config.objectives ?? [];
  const frontier = results.paretoFrontier ?? [];
  const obj0 = objectives[0];
  const obj1 = objectives[1];

  const scatterData = useMemo(() => {
    if (!obj0 || !obj1) return [];
    return frontier.map((p) => ({
      x: p.objectiveValues[obj0.id] ?? 0,
      y: p.objectiveValues[obj1.id] ?? 0,
      rank: p.dominationRank,
    }));
  }, [frontier, obj0, obj1]);

  return (
    <>
      {/* Pareto scatter (only for 2+ objectives) */}
      {obj0 && obj1 && scatterData.length > 0 && (
        <Paper p="sm" withBorder>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
            Pareto Frontier
          </Text>
          <ResponsiveContainer width="100%" height={220}>
            <ScatterChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="x" name={obj0.output} tick={{ fontSize: 10 }} label={{ value: obj0.output, position: 'insideBottom', offset: -2, fontSize: 10 }} />
              <YAxis dataKey="y" name={obj1.output} tick={{ fontSize: 10 }} label={{ value: obj1.output, angle: -90, position: 'insideLeft', fontSize: 10 }} />
              <Tooltip />
              <Scatter data={scatterData} fill={config.color ?? '#5c2d91'} />
            </ScatterChart>
          </ResponsiveContainer>
        </Paper>
      )}

      {/* Ranked table */}
      <Paper p="sm" withBorder>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
          Ranked Solutions (top 20)
        </Text>
        <Table fz="xs" verticalSpacing={2}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Rank</Table.Th>
              {objectives.map((o) => (
                <Table.Th key={o.id}>{o.output}</Table.Th>
              ))}
              {config.parameters.map((p) => (
                <Table.Th key={p.name}>{p.name}</Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {frontier.slice(0, 20).map((p, idx) => (
              <Table.Tr key={idx}>
                <Table.Td>{p.dominationRank}</Table.Td>
                {objectives.map((o) => (
                  <Table.Td key={o.id} ta="right">
                    {(p.objectiveValues[o.id] ?? 0).toFixed(3)}
                  </Table.Td>
                ))}
                {config.parameters.map((param) => (
                  <Table.Td key={param.name} ta="right">
                    {(p.params[param.name] ?? 0).toFixed(3)}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </>
  );
}

// ── Policy ──

function PolicyResults({ results }: { results: OptimisationResult }) {
  const ranking = results.policyRanking ?? [];

  const barData = useMemo(
    () => ranking.map((r) => ({ name: r.scenarioName, value: r.metricValue })),
    [ranking],
  );

  return (
    <>
      {barData.length > 0 && (
        <Paper p="sm" withBorder>
          <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
            Policy Ranking
          </Text>
          <ResponsiveContainer width="100%" height={Math.max(120, ranking.length * 36)}>
            <BarChart data={barData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={100} />
              <Tooltip />
              <Bar dataKey="value" fill="#e67700" name="Metric" />
            </BarChart>
          </ResponsiveContainer>
        </Paper>
      )}

      <Paper p="sm" withBorder>
        <Text size="xs" fw={600} c="dimmed" tt="uppercase" mb="xs">
          Ranking Details
        </Text>
        <Table fz="xs" verticalSpacing={2}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Rank</Table.Th>
              <Table.Th>Scenario</Table.Th>
              <Table.Th ta="right">Metric</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {ranking.map((r) => (
              <Table.Tr key={r.scenarioId}>
                <Table.Td fw={600}>{r.rank}</Table.Td>
                <Table.Td>{r.scenarioName}</Table.Td>
                <Table.Td ta="right">{r.metricValue.toFixed(4)}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Paper>
    </>
  );
}
