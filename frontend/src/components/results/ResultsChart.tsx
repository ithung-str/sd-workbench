import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend, CartesianGrid, ReferenceLine } from 'recharts';
import type { SimulateResponse } from '../../types/model';
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

export function ResultsChart({ results }: { results: SimulateResponse | null }) {
  const selectedMfaTimestamp = useUIStore((s) => s.selectedMfaTimestamp);
  const setSelectedMfaTimestamp = useUIStore((s) => s.setSelectedMfaTimestamp);

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
        <p style={{ fontSize: '0.85rem', color: '#666', marginTop: 8, textAlign: 'center' }}>
          Selected timestamp: t={selectedMfaTimestamp} (click chart to change)
        </p>
      )}
    </div>
  );
}
