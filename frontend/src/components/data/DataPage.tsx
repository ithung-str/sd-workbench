import { useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  ScrollArea,
  Stack,
  Table,
  Text,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import { IconBrandGoogle, IconRefresh, IconTrash, IconUpload } from '@tabler/icons-react';
import type { DataTable, DataTableMeta } from '../../types/dataTable';
import {
  listDataTables,
  loadDataTable,
  deleteDataTable,
  saveDataTable,
} from '../../lib/dataTableStorage';
import { parseCSV } from '../../lib/csvParser';
import { GoogleSheetsImportModal } from '../analysis/GoogleSheetsImportModal';
import { refreshGoogleSheetsTable } from '../../lib/googleSheetsApi';
import { useGoogleAuth } from '../../lib/googleAuth';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

function SheetsImportButton({ onImported }: { onImported: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="compact-sm"
        variant="light"
        color="teal"
        leftSection={<IconBrandGoogle size={14} />}
        onClick={() => setOpen(true)}
      >
        Google Sheets
      </Button>
      <GoogleSheetsImportModal
        opened={open}
        onClose={() => setOpen(false)}
        onImport={async (table) => {
          await saveDataTable(table);
          onImported(table.id);
        }}
      />
    </>
  );
}

function RefreshSheetButton({ tableId, onRefreshed }: { tableId: string; onRefreshed: () => void }) {
  const { getToken } = useGoogleAuth();
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setRefreshing(true);
    try {
      const existing = await loadDataTable(tableId);
      if (!existing || existing.source !== 'google_sheets') return;
      const token = await getToken();
      const updated = await refreshGoogleSheetsTable(existing, token);
      await saveDataTable(updated);
      onRefreshed();
    } catch (err) {
      window.alert(`Refresh failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Tooltip label="Refresh from Google Sheets">
      <ActionIcon size="xs" variant="subtle" color="blue" onClick={handleRefresh} loading={refreshing}>
        <IconRefresh size={12} />
      </ActionIcon>
    </Tooltip>
  );
}

export function DataPage() {
  const [tables, setTables] = useState<DataTableMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<DataTable | null>(null);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    setLoading(true);
    const list = await listDataTables();
    setTables(list);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedTable(null);
      return;
    }
    void loadDataTable(selectedId).then(setSelectedTable);
  }, [selectedId]);

  // Auto-select first table
  useEffect(() => {
    if (!selectedId && tables.length > 0) {
      setSelectedId(tables[0].id);
    }
  }, [tables, selectedId]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const table = await parseCSV(file);
      await saveDataTable(table);
      await refresh();
      setSelectedId(table.id);
    } catch (err) {
      window.alert(`CSV import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    e.target.value = '';
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    await deleteDataTable(id);
    if (selectedId === id) setSelectedId(null);
    await refresh();
  };

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Group
        justify="space-between"
        px="md"
        py="xs"
        style={{ borderBottom: '1px solid var(--mantine-color-gray-3)', flexShrink: 0 }}
      >
        <Title order={4}>Data Tables</Title>
        <Group gap="xs">
          <Button
            size="compact-sm"
            variant="light"
            leftSection={<IconUpload size={14} />}
            onClick={() => fileRef.current?.click()}
          >
            Upload CSV
          </Button>
          {googleClientId && (
            <SheetsImportButton onImported={async (id) => { await refresh(); setSelectedId(id); }} />
          )}
        </Group>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} hidden />
      </Group>

      {/* Body: list + viewer */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left: table list */}
        <Box
          style={{
            width: 240,
            flexShrink: 0,
            borderRight: '1px solid var(--mantine-color-gray-3)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <ScrollArea style={{ flex: 1 }} type="auto">
            <Stack gap={2} p="xs">
              {loading && <Text size="xs" c="dimmed">Loading...</Text>}
              {!loading && tables.length === 0 && (
                <Text size="xs" c="dimmed" p="xs">No data tables. Upload a CSV to get started.</Text>
              )}
              {tables.map((t) => (
                <Group
                  key={t.id}
                  gap={4}
                  wrap="nowrap"
                  style={{
                    padding: '6px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: selectedId === t.id ? 'var(--mantine-color-violet-0)' : undefined,
                  }}
                >
                  <UnstyledButton
                    style={{ flex: 1, overflow: 'hidden' }}
                    onClick={() => setSelectedId(t.id)}
                  >
                    <Text size="xs" fw={500} truncate>{t.name}</Text>
                    <Group gap={4}>
                      <Badge size="xs" variant="light">{t.rowCount} rows</Badge>
                      <Badge size="xs" variant="light" color="gray">{t.columns.length} cols</Badge>
                      {t.source === 'google_sheets' && <Badge size="xs" variant="light" color="teal">Sheets</Badge>}
                    </Group>
                  </UnstyledButton>
                  {t.source === 'google_sheets' && googleClientId && (
                    <RefreshSheetButton tableId={t.id} onRefreshed={refresh} />
                  )}
                  <Tooltip label="Delete">
                    <ActionIcon size="xs" variant="subtle" color="red" onClick={() => handleDelete(t.id, t.name)}>
                      <IconTrash size={12} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              ))}
            </Stack>
          </ScrollArea>
        </Box>

        {/* Right: table viewer */}
        <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!selectedTable && (
            <Box p="xl" style={{ display: 'grid', placeItems: 'center', flex: 1 }}>
              <Text c="dimmed">Select a table to view its contents</Text>
            </Box>
          )}
          {selectedTable && (
            <>
              <Group px="md" py="xs" gap="sm" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', flexShrink: 0 }}>
                <Text size="sm" fw={600}>{selectedTable.name}</Text>
                <Badge size="xs" variant="light">{selectedTable.rows.length} rows</Badge>
                <Badge size="xs" variant="light" color="gray">{selectedTable.columns.length} columns</Badge>
                <Text size="xs" c="dimmed">Source: {selectedTable.source}</Text>
              </Group>
              <ScrollArea style={{ flex: 1 }} type="auto">
                <Table striped highlightOnHover withTableBorder withColumnBorders style={{ fontSize: '0.8rem' }}>
                  <Table.Thead style={{ position: 'sticky', top: 0, background: '#f8f9fa', zIndex: 1 }}>
                    <Table.Tr>
                      <Table.Th style={{ width: 50, textAlign: 'center', color: '#999', fontSize: '0.72rem' }}>#</Table.Th>
                      {selectedTable.columns.map((col) => (
                        <Table.Th key={col.key}>
                          <Group gap={4} wrap="nowrap">
                            <span>{col.label}</span>
                            <Badge size="xs" variant="light" color={col.type === 'number' ? 'blue' : 'gray'}>
                              {col.type}
                            </Badge>
                          </Group>
                        </Table.Th>
                      ))}
                    </Table.Tr>
                  </Table.Thead>
                  <Table.Tbody>
                    {selectedTable.rows.map((row, rowIdx) => (
                      <Table.Tr key={rowIdx}>
                        <Table.Td style={{ textAlign: 'center', color: '#999', fontSize: '0.72rem' }}>{rowIdx + 1}</Table.Td>
                        {row.map((cell, colIdx) => (
                          <Table.Td
                            key={colIdx}
                            style={{
                              textAlign: selectedTable.columns[colIdx]?.type === 'number' ? 'right' : 'left',
                              fontVariantNumeric: selectedTable.columns[colIdx]?.type === 'number' ? 'tabular-nums' : undefined,
                            }}
                          >
                            {cell == null ? <Text span size="xs" c="dimmed">—</Text> : String(cell)}
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </ScrollArea>
            </>
          )}
        </Box>
      </div>
    </Box>
  );
}
