import { Select, Stack } from '@mantine/core';
import { useMemo, useState } from 'react';
import type { ScenarioRunResult, SimulateResponse } from '../../types/model';

function csvEscape(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsv(results: SimulateResponse): string {
  const columns = Object.keys(results.series);
  const rowCount = results.series.time?.length ?? 0;
  const lines: string[] = [];
  lines.push(columns.map((c) => csvEscape(c)).join(','));
  for (let i = 0; i < rowCount; i += 1) {
    const row = columns.map((c) => String(results.series[c][i] ?? Number.NaN));
    lines.push(row.map((cell) => csvEscape(cell)).join(','));
  }
  return lines.join('\n');
}

export function ResultsTable({ results, compareRuns }: { results: SimulateResponse | null; compareRuns?: ScenarioRunResult[] }) {
  const [compareVariable, setCompareVariable] = useState<string>('');

  const compareVariables = useMemo(() => {
    const first = compareRuns?.[0];
    if (!first) return [];
    return Object.keys(first.series).filter((key) => key !== 'time');
  }, [compareRuns]);

  if (compareRuns && compareRuns.length > 0) {
    const variable = compareVariable || compareVariables[0] || '';
    const rowCount = compareRuns[0].series.time?.length ?? 0;
    return (
      <Stack gap="xs">
        <Select
          label="Variable"
          size="xs"
          value={variable}
          data={compareVariables.map((value) => ({ value, label: value }))}
          onChange={(value) => value && setCompareVariable(value)}
          w={220}
        />
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>time</th>
                {compareRuns.map((run) => (
                  <th key={run.scenario_id}>{run.scenario_name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rowCount }).map((_, i) => (
                <tr key={i}>
                  <td>{(compareRuns[0].series.time?.[i] ?? NaN).toFixed(4)}</td>
                  {compareRuns.map((run) => (
                    <td key={`${run.scenario_id}-${i}`}>{(run.series[variable]?.[i] ?? NaN).toFixed(4)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Stack>
    );
  }

  if (!results) return <p className="muted">No simulation results yet.</p>;
  const columns = Object.keys(results.series);
  const rowCount = results.series.time?.length ?? 0;

  const onDownloadCsv = () => {
    const csv = toCsv(results);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'simulation-results.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="table-actions">
        <button type="button" className="ghost-icon-button" onClick={onDownloadCsv}>
          Download CSV
        </button>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {Array.from({ length: rowCount }).map((_, i) => (
              <tr key={i}>
                {columns.map((c) => <td key={c}>{(results.series[c][i] ?? NaN).toFixed(4)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
