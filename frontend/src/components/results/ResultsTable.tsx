import type { SimulateResponse } from '../../types/model';

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

export function ResultsTable({ results }: { results: SimulateResponse | null }) {
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
