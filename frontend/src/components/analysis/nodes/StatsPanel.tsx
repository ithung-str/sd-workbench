import { Box, ScrollArea, Table, Text } from '@mantine/core';
import type { ColumnStats } from '../../../lib/api';

type Props = {
  stats: Record<string, ColumnStats>;
  shape?: number[];
};

function fmt(v: number | null | undefined): string {
  if (v == null) return '—';
  if (Number.isInteger(v)) return String(v);
  return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
}

export function StatsPanel({ stats, shape }: Props) {
  const cols = Object.keys(stats);
  if (cols.length === 0) {
    return (
      <Box p={12}>
        <Text size="xs" c="dimmed">No stats available</Text>
      </Box>
    );
  }

  const hasNumeric = cols.some((c) => stats[c].mean !== undefined);

  return (
    <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {shape && (
        <Text size="xs" c="dimmed" px={12} py={4}>{shape[0]} rows × {shape[1]} columns</Text>
      )}
      <ScrollArea style={{ flex: 1 }}>
        <Table striped highlightOnHover style={{ fontSize: 11 }}>
          <Table.Thead>
            <Table.Tr>
              <Table.Th style={{ padding: '3px 8px' }}>Column</Table.Th>
              <Table.Th style={{ padding: '3px 8px' }}>dtype</Table.Th>
              <Table.Th style={{ padding: '3px 8px', textAlign: 'right' }}>Count</Table.Th>
              <Table.Th style={{ padding: '3px 8px', textAlign: 'right' }}>Nulls</Table.Th>
              {hasNumeric && (
                <>
                  <Table.Th style={{ padding: '3px 8px', textAlign: 'right' }}>Mean</Table.Th>
                  <Table.Th style={{ padding: '3px 8px', textAlign: 'right' }}>Std</Table.Th>
                  <Table.Th style={{ padding: '3px 8px', textAlign: 'right' }}>Min</Table.Th>
                  <Table.Th style={{ padding: '3px 8px', textAlign: 'right' }}>Max</Table.Th>
                </>
              )}
              {!hasNumeric && (
                <Table.Th style={{ padding: '3px 8px', textAlign: 'right' }}>Unique</Table.Th>
              )}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {cols.map((col) => {
              const s = stats[col];
              const isNum = s.mean !== undefined;
              return (
                <Table.Tr key={col}>
                  <Table.Td style={{ padding: '3px 8px', fontWeight: 600 }}>{col}</Table.Td>
                  <Table.Td style={{ padding: '3px 8px', fontFamily: 'monospace', color: 'var(--mantine-color-dimmed)' }}>{s.dtype}</Table.Td>
                  <Table.Td style={{ padding: '3px 8px', textAlign: 'right' }}>{s.count}</Table.Td>
                  <Table.Td style={{ padding: '3px 8px', textAlign: 'right', color: s.nulls > 0 ? 'var(--mantine-color-red-6)' : undefined }}>{s.nulls}</Table.Td>
                  {hasNumeric && isNum && (
                    <>
                      <Table.Td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(s.mean)}</Table.Td>
                      <Table.Td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(s.std)}</Table.Td>
                      <Table.Td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(s.min)}</Table.Td>
                      <Table.Td style={{ padding: '3px 8px', textAlign: 'right' }}>{fmt(s.max)}</Table.Td>
                    </>
                  )}
                  {hasNumeric && !isNum && (
                    <>
                      <Table.Td style={{ padding: '3px 8px' }} colSpan={4}>
                        <Text size="xs" c="dimmed">{s.unique} unique</Text>
                      </Table.Td>
                    </>
                  )}
                  {!hasNumeric && (
                    <Table.Td style={{ padding: '3px 8px', textAlign: 'right' }}>{s.unique}</Table.Td>
                  )}
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </Box>
  );
}
