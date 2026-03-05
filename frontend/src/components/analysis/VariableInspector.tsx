import { ActionIcon, Badge, Box, Button, ScrollArea, Table, Text } from '@mantine/core';
import { IconCamera, IconX } from '@tabler/icons-react';
import type { NodeResultResponse } from '../../lib/api';
import type { AnalysisNode } from '../../types/model';

type Props = {
  node: AnalysisNode;
  result?: NodeResultResponse;
  onClose: () => void;
  onSnapshotMock?: () => void;
  onClearMock?: () => void;
  isMockPreview?: boolean;
};

const TYPE_COLORS: Record<string, string> = {
  number: 'blue',
  string: 'green',
  boolean: 'orange',
  datetime: 'grape',
};

export function VariableInspector({ node, result, onClose, onSnapshotMock, onClearMock, isMockPreview }: Props) {
  const preview = result?.ok ? result.preview : null;
  const columns = preview?.columns ?? [];
  const shape = result?.shape;
  const valueKind = result?.value_kind ?? 'dataframe';

  return (
    <Box
      style={{
        width: 280,
        borderLeft: '1px solid var(--mantine-color-gray-3)',
        background: '#fafbfc',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        flexShrink: 0,
      }}
    >
      {/* Header */}
      <Box style={{ padding: '8px 12px', borderBottom: '1px solid var(--mantine-color-gray-3)', display: 'flex', alignItems: 'center', gap: 6 }}>
        <Text size="sm" fw={600} style={{ flex: 1 }} truncate>
          {node.name || node.id}
        </Text>
        <Badge size="xs" variant="light" color="gray">{node.type}</Badge>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </Box>

      <ScrollArea style={{ flex: 1 }} px={12} py={8}>
        {/* Shape info */}
        {shape && (
          <Box mb={8}>
            <Text size="xs" c="dimmed" fw={600} mb={2}>Shape</Text>
            <Text size="xs">{shape[0]} rows × {shape[1]} columns</Text>
          </Box>
        )}

        {/* Status */}
        {result && (
          <Box mb={8}>
            <Text size="xs" c="dimmed" fw={600} mb={2}>Status</Text>
            <Badge size="xs" color={result.ok ? 'green' : 'red'}>
              {result.ok ? 'Success' : 'Error'}
            </Badge>
            {!result.ok && result.error && (
              <Text size="xs" c="red" mt={4} style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>
                {result.error}
              </Text>
            )}
          </Box>
        )}

        {!result && !isMockPreview && (
          <Text size="xs" c="dimmed" mb={8}>Not executed yet</Text>
        )}

        {/* Value Kind */}
        {result?.ok && valueKind !== 'dataframe' && (
          <Box mb={8}>
            <Text size="xs" c="dimmed" fw={600} mb={2}>Value Kind</Text>
            <Badge size="xs" variant="light" color="grape">{valueKind}</Badge>
          </Box>
        )}

        {/* Mock data controls */}
        {isMockPreview && (
          <Box mb={8}>
            <Badge size="xs" variant="light" color="grape" mb={4}>Mock Preview</Badge>
            <Text size="xs" c="dimmed">Showing snapshot data (no live execution)</Text>
          </Box>
        )}
        {result?.ok && (onSnapshotMock || onClearMock) && (
          <Box mb={8} style={{ display: 'flex', gap: 6 }}>
            {onSnapshotMock && (
              <Button size="compact-xs" variant="light" color="grape" leftSection={<IconCamera size={12} />} onClick={onSnapshotMock}>
                Snapshot as mock
              </Button>
            )}
            {onClearMock && (
              <Button size="compact-xs" variant="light" color="gray" onClick={onClearMock}>
                Clear mock
              </Button>
            )}
          </Box>
        )}

        {/* Generic value preview for non-DataFrame kinds */}
        {result?.ok && valueKind !== 'dataframe' && preview && (
          <Box mb={8}>
            <Text size="xs" c="dimmed" fw={600} mb={4}>Value</Text>
            <Box style={{ background: '#fff', borderRadius: 6, padding: 8, border: '1px solid #eee', fontFamily: 'monospace', fontSize: 11, whiteSpace: 'pre-wrap', maxHeight: 200, overflow: 'auto' }}>
              {preview.display ?? JSON.stringify(result.generic_value ?? preview.sample, null, 2)}
            </Box>
          </Box>
        )}

        {/* Schema */}
        {columns.length > 0 && (
          <Box mb={8}>
            <Text size="xs" c="dimmed" fw={600} mb={4}>Schema</Text>
            <Table style={{ fontSize: 11 }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ padding: '2px 6px' }}>Column</Table.Th>
                  <Table.Th style={{ padding: '2px 6px' }}>Type</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {columns.map((col) => {
                  const key = typeof col === 'string' ? col : col.key;
                  const label = typeof col === 'string' ? col : col.label;
                  const type = typeof col === 'string' ? 'unknown' : col.type;
                  return (
                    <Table.Tr key={key}>
                      <Table.Td style={{ padding: '2px 6px', fontFamily: 'monospace' }}>{label}</Table.Td>
                      <Table.Td style={{ padding: '2px 6px' }}>
                        <Badge size="xs" variant="light" color={TYPE_COLORS[type] ?? 'gray'}>
                          {type}
                        </Badge>
                      </Table.Td>
                    </Table.Tr>
                  );
                })}
              </Table.Tbody>
            </Table>
          </Box>
        )}

        {/* Column stats */}
        {preview?.stats && Object.keys(preview.stats).length > 0 && (
          <Box mb={8}>
            <Text size="xs" c="dimmed" fw={600} mb={4}>Statistics</Text>
            {Object.entries(preview.stats).map(([colName, stats]) => (
              <Box key={colName} mb={6} style={{ background: '#fff', borderRadius: 6, padding: '4px 8px', border: '1px solid #eee' }}>
                <Text size="xs" fw={600} mb={2} style={{ fontFamily: 'monospace' }}>{colName}</Text>
                <Box style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1px 8px', fontSize: 10 }}>
                  {stats.min != null && <Text size="xs" c="dimmed">min: {Number(stats.min).toFixed(2)}</Text>}
                  {stats.max != null && <Text size="xs" c="dimmed">max: {Number(stats.max).toFixed(2)}</Text>}
                  {stats.mean != null && <Text size="xs" c="dimmed">mean: {Number(stats.mean).toFixed(2)}</Text>}
                  {stats.std != null && <Text size="xs" c="dimmed">std: {Number(stats.std).toFixed(2)}</Text>}
                  {stats.nulls != null && <Text size="xs" c="dimmed">nulls: {stats.nulls}</Text>}
                  {stats.unique != null && <Text size="xs" c="dimmed">unique: {stats.unique}</Text>}
                </Box>
              </Box>
            ))}
          </Box>
        )}

        {/* Preview (first 5 rows) */}
        {preview && preview.rows && preview.rows.length > 0 && (
          <Box mb={8}>
            <Text size="xs" c="dimmed" fw={600} mb={4}>Preview (first {Math.min(5, preview.rows!.length)} rows)</Text>
            <ScrollArea>
              <Table style={{ fontSize: 10 }}>
                <Table.Thead>
                  <Table.Tr>
                    {columns.map((col) => (
                      <Table.Th key={typeof col === 'string' ? col : col.key} style={{ padding: '1px 4px', whiteSpace: 'nowrap' }}>
                        {typeof col === 'string' ? col : col.label}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {preview.rows!.slice(0, 5).map((row, i) => (
                    <Table.Tr key={i}>
                      {(row as unknown[]).map((cell, j) => (
                        <Table.Td key={j} style={{ padding: '1px 4px', whiteSpace: 'nowrap', maxWidth: 80, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {cell != null ? String(cell) : ''}
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Box>
        )}

        {/* Logs */}
        {result?.logs && (
          <Box mb={8}>
            <Text size="xs" c="dimmed" fw={600} mb={4}>Logs</Text>
            <Box style={{ background: '#1e1e1e', borderRadius: 4, padding: 8, fontFamily: 'monospace', fontSize: 10, color: '#d4d4d4', whiteSpace: 'pre-wrap', maxHeight: 150, overflow: 'auto' }}>
              {result.logs}
            </Box>
          </Box>
        )}
      </ScrollArea>
    </Box>
  );
}
