import { useMemo, useState } from 'react';
import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, CartesianGrid, ReferenceLine } from 'recharts';
import { Select, Stack, Text } from '@mantine/core';
import type { ScenarioRunResult, SimulateResponse } from '../../types/model';
import { useUIStore } from '../../state/uiStore';

/** Format a number for display — compact with appropriate precision. */
function fmt(value: number): string {
  if (value == null || Number.isNaN(value)) return '—';
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}K`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(2)}K`;
  if (abs >= 100) return value.toFixed(1);
  if (abs >= 1) return value.toFixed(2);
  if (abs >= 0.01) return value.toFixed(4);
  return value.toExponential(2);
}

/** Shorter format for Y-axis tick labels. */
function fmtAxis(value: number): string {
  if (value == null || Number.isNaN(value)) return '';
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(0)}K`;
  if (abs >= 1) return value.toFixed(1);
  return value.toFixed(2);
}

const COLORS = [
  '#1b6ca8', '#d46a00', '#2f7d32', '#8a2be2',
  '#d32f2f', '#00838f', '#c2185b', '#455a64',
];

type TooltipPayloadItem = {
  name: string;
  value: number;
  color: string;
  dataKey: string;
};

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: number | string;
}) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-label">t = {label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="chart-tooltip-row">
          <span className="chart-tooltip-dot" style={{ background: entry.color }} />
          <span className="chart-tooltip-name">{entry.name}</span>
          <span className="chart-tooltip-value">{fmt(entry.value)}</span>
        </div>
      ))}
    </div>
  );
}

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

  // Group subscripted variables: "Population[North]", "Population[South]" → group under "Population"
  const compareSelectData = useMemo(() => {
    const groups: Record<string, string[]> = {};
    const scalars: string[] = [];
    for (const key of compareVariables) {
      const match = key.match(/^(.+)\[(.+)\]$/);
      if (match) {
        const base = match[1];
        if (!groups[base]) groups[base] = [];
        groups[base].push(key);
      } else {
        scalars.push(key);
      }
    }
    const items: Array<{ group?: string; value: string; label: string }> = [];
    for (const scalar of scalars) {
      items.push({ value: scalar, label: scalar });
    }
    for (const [group, members] of Object.entries(groups)) {
      for (const member of members) {
        items.push({ group, value: member, label: member });
      }
    }
    return items;
  }, [compareVariables]);

  const compareVariable = selectedVariable || compareVariables[0] || '';

  if (compareRuns && compareRuns.length > 0 && compareVariable) {
    const rows = toCompareRows(compareRuns, compareVariable);
    return (
      <Stack gap="xs">
        <Select
          label="Variable"
          size="xs"
          value={compareVariable}
          onChange={(value) => value && setSelectedVariable(value)}
          data={compareSelectData}
          w={220}
        />
        <div className="chart-wrap">
          <div className="chart-canvas">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} width={52} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {compareRuns.map((run, index) => (
                  <Line
                    key={`${run.scenario_id}-${compareVariable}`}
                    type="monotone"
                    dataKey={run.scenario_name}
                    dot={false}
                    strokeWidth={1.5}
                    stroke={COLORS[index % COLORS.length]}
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
          <LineChart data={rows} onClick={handleClick} margin={{ top: 8, right: 12, bottom: 4, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#eee" />
            <XAxis dataKey="time" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={fmtAxis} tick={{ fontSize: 11 }} width={52} />
            <Tooltip content={<CustomTooltip />} />
            <Legend wrapperStyle={{ fontSize: 11 }} />
            {selectedMfaTimestamp !== null && (
              <ReferenceLine x={selectedMfaTimestamp} stroke="#9c27b0" strokeWidth={2} strokeDasharray="3 3" label={{ value: `t=${selectedMfaTimestamp}`, position: 'top', fill: '#9c27b0' }} />
            )}
            {keys.map((key, index) => (
              <Line key={key} type="monotone" dataKey={key} dot={false} strokeWidth={1.5} stroke={COLORS[index % COLORS.length]} />
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
