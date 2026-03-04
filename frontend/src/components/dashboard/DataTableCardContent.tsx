import { useMemo } from 'react';
import { Table, Text } from '@mantine/core';
import type { DashboardCard } from '../../types/model';
import type { DataTable } from '../../types/dataTable';

type Props = {
  card: DashboardCard;
  table: DataTable;
};

export function DataTableCardContent({ card, table }: Props) {
  const maxRows = card.data_table_rows ?? 20;

  const displayRows = useMemo(
    () => table.rows.slice(0, maxRows),
    [table.rows, maxRows],
  );

  if (table.columns.length === 0) {
    return <Text size="xs" c="dimmed">Table has no columns.</Text>;
  }

  return (
    <Table striped highlightOnHover withTableBorder withColumnBorders style={{ fontSize: 11 }}>
      <Table.Thead>
        <Table.Tr>
          {table.columns.map((col) => (
            <Table.Th key={col.key} style={{ whiteSpace: 'nowrap' }}>
              {col.label}
            </Table.Th>
          ))}
        </Table.Tr>
      </Table.Thead>
      <Table.Tbody>
        {displayRows.map((row, ri) => (
          <Table.Tr key={ri}>
            {table.columns.map((col, ci) => (
              <Table.Td
                key={col.key}
                style={{ textAlign: col.type === 'number' ? 'right' : 'left' }}
              >
                {row[ci] != null ? String(row[ci]) : ''}
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
      {table.rows.length > maxRows && (
        <Table.Caption>
          Showing {maxRows} of {table.rows.length} rows
        </Table.Caption>
      )}
    </Table>
  );
}
