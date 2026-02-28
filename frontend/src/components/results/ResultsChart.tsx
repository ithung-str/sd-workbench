import { useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, CartesianGrid, ReferenceLine } from 'recharts';
import { Select, Stack, Text } from '@mantine/core';
import type { ScenarioRunResult, SimulateResponse } from '../../types/model';
import { useUIStore } from '../../state/uiStore';

function toRows(results: SimulateResponse) {
  const time = results.series.time ?? [];
  return time.map((t, i) => {
    const row: Record<string, number> = { time: t };
    for (const [key, values] of Object.entries(results.series)) {
      row[key] = values[i] ?? Number.NaN;
    }
    return row;
  });
}

function toCompareRows(runs: ScenarioRunResult[], variable: string) {
  const longest = runs.reduce((max, run) => Math.max(max, run.series.time?.length ?? 0), 0);
  return Array.from({ length: longest }).map((_, i) => {
    const row: Record<string, number | string> = { time: runs[0]?.series.time?.[i] ?? i };
    for (const run of runs) {
      row[run.scenario_name] = run.series[variable]?.[i] ?? Number.NaN;
    }
    return row;
  });
}

export function ResultsChart({ results, compareRuns }: { results: SimulateResponse | null; compareRuns?: ScenarioRunResult[] }) {
  const selectedMfaTimestamp = useUIStore((s) => s.selectedMfaTimestamp);
  const setSelectedMfaTimestamp = useUIStore((s) => s.setSelectedMfaTimestamp);
  const [selectedVariable, setSelectedVariable] = useState<string>('');

  const compareVariables = useMemo(() => {
    const first = compareRuns?.[0];
    if (!first) return [];
    return Object.keys(first.series).filter((key) => key !== 'time');
  }, [compareRuns]);

  const compareVariable = selectedVariable || compareVariables[0] || '';

  if (compareRuns && compareRuns.length > 0 && compareVariable) {
    const rows = toCompareRows(compareRuns, compareVariable);
    const colors = ['#1b6ca8', '#d46a00', '#2f7d32', '#8a2be2', '#d32f2f', '#00838f'];
    return (
      <Stack gap="xs">
        <Select
          label="Variable"
          size="xs"
          value={compareVariable}
          onChange={(value) => value && setSelectedVariable(value)}
          data={compareVariables.map((value) => ({ value, label: value }))}
          w={220}
        />
        <div className="chart-wrap">
          <div className="chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="time" />
                <YAxis />
                <Tooltip />
                <Legend />
                {compareRuns.map((run, index) => (
                  <Line
                    key={`${run.scenario_id}-${compareVariable}`}
                    type="monotone"
                    dataKey={run.scenario_name}
                    dot={false}
                    stroke={colors[index % colors.length]}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Stack>
    );
  }

  if (!results) return <p className="muted">Run a simulation to see chart output.</p>;
  const rows = toRows(results);
  const keys = Object.keys(results.series).filter((k) => k !== 'time');

  const handleClick = (e: any) => {
    if (e && e.activeLabel !== undefined) {
      setSelectedMfaTimestamp(e.activeLabel);
    }
  };

  return (
    <div className="chart-wrap">
      <div className="chart-canvas">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} onClick={handleClick}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="time" />
            <YAxis />
            <Tooltip />
            <Legend />
            {selectedMfaTimestamp !== null && (
              <ReferenceLine x={selectedMfaTimestamp} stroke="#9c27b0" strokeWidth={2} strokeDasharray="3 3" label={{ value: `t=${selectedMfaTimestamp}`, position: 'top', fill: '#9c27b0' }} />
            )}
            {keys.map((key, index) => (
              <Line key={key} type="monotone" dataKey={key} dot={false} stroke={["#1b6ca8", "#d46a00", "#2f7d32", "#8a2be2"][index % 4]} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      {selectedMfaTimestamp !== null && (
        <Text size="xs" c="dimmed" ta="center" mt={8}>
          Selected timestamp: t={selectedMfaTimestamp} (click chart to change)
        </Text>
      )}
    </div>
  );
}
