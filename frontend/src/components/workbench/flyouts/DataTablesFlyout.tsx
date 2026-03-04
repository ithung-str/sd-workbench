import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Badge, Group, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { IconTrash, IconUpload } from '@tabler/icons-react';
import type { DataTableMeta } from '../../../types/dataTable';
import { listDataTables, deleteDataTable, saveDataTable } from '../../../lib/dataTableStorage';
import { parseCSV } from '../../../lib/csvParser';
import { useEditorStore } from '../../../state/editorStore';

export function DataTablesFlyout() {
  const [tables, setTables] = useState<DataTableMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);

  const refresh = async () => {
    setLoading(true);
    const list = await listDataTables();
    setTables(list);
    setLoading(false);
  };

  useEffect(() => { void refresh(); }, []);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const table = await parseCSV(file);
      await saveDataTable(table);
      await refresh();
    } catch (err) {
      window.alert(`CSV import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    e.target.value = '';
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    await deleteDataTable(id);
    await refresh();
  };

  return (
    <Stack gap="xs">
      <Group gap="xs">
        <Tooltip label="Upload CSV">
          <ActionIcon variant="light" size="sm" onClick={() => fileRef.current?.click()}>
            <IconUpload size={14} />
          </ActionIcon>
        </Tooltip>
        <Text size="xs" c="dimmed">{tables.length} table{tables.length !== 1 ? 's' : ''}</Text>
      </Group>
      <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} hidden />

      {loading && <Text size="xs" c="dimmed">Loading...</Text>}

      {!loading && tables.length === 0 && (
        <Text size="xs" c="dimmed">No data tables yet. Upload a CSV to get started.</Text>
      )}

      {tables.map((t) => (
        <Group key={t.id} gap={4} className="flyout-list-item" wrap="nowrap">
          <UnstyledButton
            style={{ flex: 1, overflow: 'hidden' }}
            onClick={() => setActiveTab('data')}
          >
            <Text size="xs" truncate fw={500}>{t.name}</Text>
            <Group gap={4}>
              <Badge size="xs" variant="light">{t.rowCount} rows</Badge>
              <Badge size="xs" variant="light" color="gray">{t.columns.length} cols</Badge>
            </Group>
          </UnstyledButton>
          <ActionIcon size="xs" variant="subtle" color="red" onClick={() => handleDelete(t.id, t.name)}>
            <IconTrash size={12} />
          </ActionIcon>
        </Group>
      ))}
    </Stack>
  );
}
