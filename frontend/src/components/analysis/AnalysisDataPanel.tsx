import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Badge, Box, Group, ScrollArea, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconBrandGoogle, IconRefresh, IconTrash, IconUpload, IconX } from '@tabler/icons-react';
import type { DataTableMeta } from '../../types/dataTable';
import { listDataTables, deleteDataTable, saveDataTable, loadDataTable } from '../../lib/dataTableStorage';
import { parseCSV } from '../../lib/csvParser';
import { GoogleSheetsImportModal } from './GoogleSheetsImportModal';
import { refreshGoogleSheetsTable } from '../../lib/googleSheetsApi';
import { useGoogleAuth } from '../../lib/googleAuth';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

type Props = {
  onClose: () => void;
  onSelectTable: (tableId: string, tableName: string) => void;
};

function SheetsControls({ onImported }: { onImported: () => void }) {
  const [sheetsModalOpen, setSheetsModalOpen] = useState(false);

  return (
    <>
      <Tooltip label="Import from Google Sheets">
        <ActionIcon variant="light" size="xs" onClick={() => setSheetsModalOpen(true)}>
          <IconBrandGoogle size={12} />
        </ActionIcon>
      </Tooltip>
      <GoogleSheetsImportModal
        opened={sheetsModalOpen}
        onClose={() => setSheetsModalOpen(false)}
        onImport={async (table) => {
          await saveDataTable(table);
          onImported();
        }}
      />
    </>
  );
}

function RefreshButton({ tableId, onRefreshed }: { tableId: string; onRefreshed: () => void }) {
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

export function AnalysisDataPanel({ onClose, onSelectTable }: Props) {
  const [tables, setTables] = useState<DataTableMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = async () => {
    setLoading(true);
    const list = await listDataTables();
    setTables(list);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const importCSV = async (file: File) => {
    try {
      const table = await parseCSV(file);
      await saveDataTable(table);
      await refresh();
    } catch (err) {
      window.alert(`CSV import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await importCSV(file);
    e.target.value = '';
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    await deleteDataTable(id);
    await refresh();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.csv')) {
      await importCSV(file);
    }
  };

  return (
    <Box
      style={{
        width: 240,
        borderRight: '1px solid var(--mantine-color-gray-3)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        background: '#fff',
      }}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <Group gap="xs" px="sm" py={8} style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
        <Text size="xs" fw={600}>Data Tables</Text>
        <Tooltip label="Upload CSV">
          <ActionIcon variant="light" size="xs" onClick={() => fileRef.current?.click()}>
            <IconUpload size={12} />
          </ActionIcon>
        </Tooltip>
        {googleClientId && <SheetsControls onImported={refresh} />}
        <Text size="xs" c="dimmed" style={{ marginLeft: 'auto' }}>{tables.length}</Text>
        <ActionIcon size="xs" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={12} />
        </ActionIcon>
      </Group>
      <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} hidden />

      <ScrollArea style={{ flex: 1 }}>
        <Stack gap={2} p="xs">
          {dragOver && (
            <Box style={{ border: '2px dashed var(--mantine-color-teal-4)', borderRadius: 8, padding: 16, textAlign: 'center' }}>
              <Text size="xs" c="teal">Drop CSV here</Text>
            </Box>
          )}

          {loading && <Text size="xs" c="dimmed">Loading...</Text>}

          {!loading && tables.length === 0 && (
            <Text size="xs" c="dimmed">No data tables. Upload a CSV{googleClientId ? ' or import from Google Sheets' : ''}.</Text>
          )}

          {tables.map((t) => (
            <Group key={t.id} gap={4} wrap="nowrap" style={{ padding: '4px 2px' }}>
              <UnstyledButton
                style={{ flex: 1, overflow: 'hidden' }}
                onClick={() => onSelectTable(t.id, t.name)}
              >
                <Text size="xs" truncate fw={500}>{t.name}</Text>
                <Group gap={4}>
                  <Badge size="xs" variant="light">{t.rowCount} rows</Badge>
                  <Badge size="xs" variant="light" color="gray">{t.columns.length} cols</Badge>
                  {t.source === 'google_sheets' && (
                    <Badge size="xs" variant="light" color="green">Sheets</Badge>
                  )}
                </Group>
              </UnstyledButton>
              {t.source === 'google_sheets' && googleClientId && (
                <RefreshButton tableId={t.id} onRefreshed={refresh} />
              )}
              <ActionIcon size="xs" variant="subtle" color="red" onClick={() => handleDelete(t.id, t.name)}>
                <IconTrash size={12} />
              </ActionIcon>
            </Group>
          ))}
        </Stack>
      </ScrollArea>
    </Box>
  );
}
