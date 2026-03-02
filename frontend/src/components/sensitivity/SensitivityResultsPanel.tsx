import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
} from '@mantine/core';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  MonteCarloResponse,
  OATSensitivityResponse,
  SensitivityConfig,
} from '../../types/model';

type SensitivityResultsPanelProps = {
  config: SensitivityConfig | undefined;
  oatResults: OATSensitivityResponse | null;
  monteCarloResults: MonteCarloResponse | null;
  isRunning: boolean;
};

const COLORS = ['#1b6ca8', '#d46a00', '#2f7d32', '#8a2be2', '#d32f2f', '#00838f', '#f57c00', '#388e3c'];

function TornadoChart({ oatResults }: { oatResults: OATSensitivityResponse }) {
  const data = useMemo(() => {
    return oatResults.items
      .slice()
      .sort((a, b) => Math.abs(b.swing) - Math.abs(a.swing))
      .map((item) => ({
        parameter: item.parameter,
        low: item.min_metric - oatResults.baseline_metric,
        high: item.max_metric - oatResults.baseline_metric,
        swing: item.swing,
        normalized: item.normalized_swing,
      }));
  }, [oatResults]);

  if (data.length === 0) {
    return <Text size="sm" c="dimmed">No OAT results to display.</Text>;
  }

  return (
    <Stack gap="xs">
      <Box h={Math.max(200, data.length * 40 + 60)}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 80, right: 20, top: 10, bottom: 10 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="parameter" tick={{ fontSize: 11 }} width={80} />
            <Tooltip formatter={(value: number) => value.toFixed(4)} />
            <Bar dataKey="low" fill="#d32f2f" name="Low impact" stackId="stack" />
            <Bar dataKey="high" fill="#2f7d32" name="High impact" stackId="stack" />
          </BarChart>
        </ResponsiveContainer>
      </Box>
      <Table striped withTableBorder verticalSpacing={4} fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Parameter</Table.Th>
            <Table.Th>Swing</Table.Th>
            <Table.Th>Normalized</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {data.map((item) => (
            <Table.Tr key={item.parameter}>
              <Table.Td>{item.parameter}</Table.Td>
              <Table.Td>{item.swing.toFixed(4)}</Table.Td>
              <Table.Td>{(item.normalized * 100).toFixed(1)}%</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function SpiderPlot({ oatResults }: { oatResults: OATSensitivityResponse }) {
  const chartData = useMemo(() => {
    if (oatResults.items.length === 0) return [];
    const steps = oatResults.items[0]?.points.length ?? 0;
    return Array.from({ length: steps }).map((_, i) => {
      const row: Record<string, number> = { x: steps > 1 ? i / (steps - 1) : 0 };
      for (const item of oatResults.items) {
        row[item.parameter] = item.points[i]?.metric_value ?? 0;
      }
      return row;
    });
  }, [oatResults]);

  if (chartData.length === 0) {
    return <Text size="sm" c="dimmed">No data for spider plot.</Text>;
  }

  return (
    <Box h={300}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={chartData} margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis
            dataKey="x"
            tick={{ fontSize: 10 }}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
            label={{ value: 'Parameter range (normalized)', position: 'bottom', fontSize: 11 }}
          />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(value: number) => value.toFixed(4)} />
          <Legend />
          {oatResults.items.map((item, i) => (
            <Line
              key={item.parameter}
              type="monotone"
              dataKey={item.parameter}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={2}
              dot={true}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </Box>
  );
}

function FanChart({ monteCarloResults }: { monteCarloResults: MonteCarloResponse }) {
  const { quantiles } = monteCarloResults;

  const data = [
    {
      label: 'Result',
      p05: quantiles.p05,
      p25_band: quantiles.p25 - quantiles.p05,
      p50_band: quantiles.p50 - quantiles.p25,
      p75_band: quantiles.p75 - quantiles.p50,
      p95_band: quantiles.p95 - quantiles.p75,
      median: quantiles.p50,
      mean: quantiles.mean,
    },
  ];

  return (
    <Stack gap="xs">
      <Box h={200}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 60, right: 20, top: 10, bottom: 10 }}>
            <XAxis type="number" tick={{ fontSize: 10 }} />
            <YAxis type="category" dataKey="label" tick={{ fontSize: 11 }} width={60} />
            <Tooltip formatter={(value: number) => value.toFixed(4)} />
            <Bar dataKey="p05" stackId="fan" fill="transparent" />
            <Bar dataKey="p25_band" stackId="fan" fill="#bbdefb" name="p05-p25" />
            <Bar dataKey="p50_band" stackId="fan" fill="#64b5f6" name="p25-p50" />
            <Bar dataKey="p75_band" stackId="fan" fill="#64b5f6" name="p50-p75" />
            <Bar dataKey="p95_band" stackId="fan" fill="#bbdefb" name="p75-p95" />
          </BarChart>
        </ResponsiveContainer>
      </Box>
      <Table striped withTableBorder verticalSpacing={4} fz="xs">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>Statistic</Table.Th>
            <Table.Th>Value</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {([
            ['p05', quantiles.p05],
            ['p25', quantiles.p25],
            ['Median (p50)', quantiles.p50],
            ['p75', quantiles.p75],
            ['p95', quantiles.p95],
            ['Mean', quantiles.mean],
            ['Std Dev', quantiles.stddev],
            ['Min', quantiles.min],
            ['Max', quantiles.max],
          ] as const).map(([label, value]) => (
            <Table.Tr key={label}>
              <Table.Td>{label}</Table.Td>
              <Table.Td>{value.toFixed(4)}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}

function ScatterPlot({ monteCarloResults }: { monteCarloResults: MonteCarloResponse }) {
  const paramNames = useMemo(() => {
    if (monteCarloResults.samples.length === 0) return [];
    return Object.keys(monteCarloResults.samples[0].params);
  }, [monteCarloResults.samples]);

  const [selectedParam, setSelectedParam] = useState<string>(paramNames[0] ?? '');

  const data = useMemo(() => {
    if (!selectedParam) return [];
    return monteCarloResults.samples.map((s) => ({
      paramValue: s.params[selectedParam] ?? 0,
      metricValue: s.metric_value,
    }));
  }, [monteCarloResults.samples, selectedParam]);

  if (paramNames.length === 0) {
    return <Text size="sm" c="dimmed">No Monte Carlo samples to display.</Text>;
  }

  return (
    <Stack gap="xs">
      {paramNames.length > 1 && (
        <Select
          label="Color by parameter"
          size="xs"
          value={selectedParam}
          onChange={(v) => v && setSelectedParam(v)}
          data={paramNames.map((n) => ({ value: n, label: n }))}
          w={200}
        />
      )}
      <Box h={300}>
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ left: 20, right: 20, top: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="paramValue"
              name={selectedParam}
              tick={{ fontSize: 10 }}
              label={{ value: selectedParam, position: 'bottom', fontSize: 11 }}
              type="number"
            />
            <YAxis
              dataKey="metricValue"
              name={monteCarloResults.metric}
              tick={{ fontSize: 10 }}
              type="number"
            />
            <Tooltip
              formatter={(value: number) => value.toFixed(4)}
              cursor={{ strokeDasharray: '3 3' }}
            />
            <Scatter data={data} fill="#1b6ca8" fillOpacity={0.5} />
          </ScatterChart>
        </ResponsiveContainer>
      </Box>
    </Stack>
  );
}

export function SensitivityResultsPanel({
  config,
  oatResults,
  monteCarloResults,
  isRunning,
}: SensitivityResultsPanelProps) {
  const isOat = config?.type === 'oat';
  const tabs = isOat
    ? [
        { label: 'Tornado', value: 'tornado' },
        { label: 'Spider', value: 'spider' },
      ]
    : [
        { label: 'Fan Chart', value: 'fan' },
        { label: 'Scatter', value: 'scatter' },
      ];

  const [view, setView] = useState<string>(tabs[0].value);

  const effectiveView = tabs.some((t) => t.value === view) ? view : tabs[0].value;

  const hasResults = isOat ? oatResults !== null : monteCarloResults !== null;

  return (
    <Stack gap="sm" p="sm" style={{ height: '100%' }}>
      <Text fw={600} size="sm">Results</Text>

      <SegmentedControl
        size="xs"
        value={effectiveView}
        onChange={setView}
        data={tabs}
      />

      {!hasResults && !isRunning && (
        <Alert color="violet" variant="light">
          Click "Run Analysis" to see results.
        </Alert>
      )}

      {isRunning && (
        <Alert color="blue" variant="light">
          Running analysis...
        </Alert>
      )}

      {isOat && oatResults && effectiveView === 'tornado' && (
        <TornadoChart oatResults={oatResults} />
      )}
      {isOat && oatResults && effectiveView === 'spider' && (
        <SpiderPlot oatResults={oatResults} />
      )}

      {!isOat && monteCarloResults && effectiveView === 'fan' && (
        <FanChart monteCarloResults={monteCarloResults} />
      )}
      {!isOat && monteCarloResults && effectiveView === 'scatter' && (
        <ScatterPlot monteCarloResults={monteCarloResults} />
      )}
    </Stack>
  );
}
