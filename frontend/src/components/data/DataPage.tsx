import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Chip,
  Group,
  ScrollArea,
  Stack,
  Table,
  Text,
  Textarea,
  TextInput,
  Title,
  Tooltip,
  UnstyledButton,
} from '@mantine/core';
import {
  IconBrandGoogle,
  IconCheck,
  IconClock,
  IconDownload,
  IconEdit,
  IconFilter,
  IconRefresh,
  IconSearch,
  IconTag,
  IconTrash,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import type { DataTable, DataTableMeta, ColumnStats } from '../../types/dataTable';
import {
  apiListDataTables,
  apiGetDataTable,
  apiCreateDataTable,
  apiUpdateDataTable,
  apiDeleteDataTable,
  apiUpsertDataTable,
  apiDataTableCsvUrl,
} from '../../lib/api';
import { parseCSV } from '../../lib/csvParser';
import { GoogleSheetsImportModal } from '../analysis/GoogleSheetsImportModal';
import { refreshGoogleSheetsTable } from '../../lib/googleSheetsApi';
import { useGoogleAuth } from '../../lib/googleAuth';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

// ── Sub-components (isolated for hook safety) ──

function SheetsImportButton({ onImported }: { onImported: (table: DataTable) => void }) {
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
        onImport={onImported}
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
      const existing = await apiGetDataTable(tableId);
      if (!existing || existing.source !== 'google_sheets') return;
      const token = await getToken();
      const updated = await refreshGoogleSheetsTable(existing, token);
      await apiUpsertDataTable(updated.id, {
        name: updated.name,
        source: updated.source,
        columns: updated.columns,
        rows: updated.rows,
        googleSheets: updated.googleSheets,
      });
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

// ── Inline editable name ──

function EditableName({ value, onSave }: { value: string; onSave: (name: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  useEffect(() => { setDraft(value); }, [value]);

  if (!editing) {
    return (
      <Group gap={4} wrap="nowrap">
        <Text size="sm" fw={600}>{value}</Text>
        <Tooltip label="Rename">
          <ActionIcon size="xs" variant="subtle" onClick={() => setEditing(true)}>
            <IconEdit size={12} />
          </ActionIcon>
        </Tooltip>
      </Group>
    );
  }

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== value) onSave(trimmed);
    setEditing(false);
  };

  return (
    <Group gap={4} wrap="nowrap">
      <TextInput
        size="xs"
        value={draft}
        onChange={(e) => setDraft(e.currentTarget.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        autoFocus
        style={{ width: 200 }}
      />
      <ActionIcon size="xs" variant="light" color="green" onClick={commit}><IconCheck size={12} /></ActionIcon>
      <ActionIcon size="xs" variant="subtle" onClick={() => setEditing(false)}><IconX size={12} /></ActionIcon>
    </Group>
  );
}

// ── Column stats row ──

function StatsRow({ col, stats }: { col: { key: string; type: string }; stats?: ColumnStats }) {
  if (!stats) return null;
  if (col.type === 'number') {
    return (
      <Group gap={8} style={{ fontSize: '0.7rem', color: '#666' }}>
        {stats.min != null && <span>min: {stats.min}</span>}
        {stats.max != null && <span>max: {stats.max}</span>}
        {stats.mean != null && <span>avg: {stats.mean}</span>}
        {stats.std != null && <span>std: {stats.std}</span>}
        <span>nulls: {stats.nulls}</span>
      </Group>
    );
  }
  return (
    <Group gap={8} style={{ fontSize: '0.7rem', color: '#666' }}>
      <span>count: {stats.count}</span>
      {stats.unique != null && <span>unique: {stats.unique}</span>}
      <span>nulls: {stats.nulls}</span>
    </Group>
  );
}

// ── Tags editor ──

function TagsEditor({ tags, onSave }: { tags: string[]; onSave: (tags: string[]) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const addTag = () => {
    const trimmed = draft.trim().toLowerCase();
    if (trimmed && !tags.includes(trimmed)) {
      onSave([...tags, trimmed]);
    }
    setDraft('');
  };

  const removeTag = (tag: string) => onSave(tags.filter((t) => t !== tag));

  return (
    <Group gap={4} wrap="wrap">
      {tags.map((tag) => (
        <Badge key={tag} size="xs" variant="light" color="grape" rightSection={
          <ActionIcon size={10} variant="transparent" color="grape" onClick={() => removeTag(tag)}>
            <IconX size={8} />
          </ActionIcon>
        }>
          {tag}
        </Badge>
      ))}
      {editing ? (
        <TextInput
          size="xs"
          placeholder="tag name"
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { addTag(); } if (e.key === 'Escape') setEditing(false); }}
          onBlur={() => { if (draft.trim()) addTag(); setEditing(false); }}
          autoFocus
          style={{ width: 100 }}
        />
      ) : (
        <ActionIcon size="xs" variant="subtle" color="grape" onClick={() => setEditing(true)}>
          <IconTag size={10} />
        </ActionIcon>
      )}
    </Group>
  );
}

// ── Staleness indicator ──

function StalenessIndicator({ updatedAt }: { updatedAt: string }) {
  const updated = new Date(updatedAt);
  const diffMs = Date.now() - updated.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  let label: string;
  let color: string;
  if (diffDays === 0) {
    label = 'Updated today';
    color = 'green';
  } else if (diffDays < 7) {
    label = `Updated ${diffDays}d ago`;
    color = 'green';
  } else if (diffDays < 30) {
    label = `Updated ${Math.floor(diffDays / 7)}w ago`;
    color = 'yellow';
  } else {
    label = `Updated ${Math.floor(diffDays / 30)}mo ago`;
    color = 'orange';
  }
  return (
    <Tooltip label={`Last updated: ${updated.toLocaleString()}`}>
      <Badge size="xs" variant="light" color={color} leftSection={<IconClock size={9} />}>
        {label}
      </Badge>
    </Tooltip>
  );
}

// ── Main page ──

export function DataPage() {
  const [tables, setTables] = useState<DataTableMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<DataTable | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiListDataTables({
        search: search || undefined,
        source: sourceFilter || undefined,
      });
      setTables(list);
    } catch {
      // Backend may be unavailable — show empty
      setTables([]);
    }
    setLoading(false);
  }, [search, sourceFilter]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedTable(null);
      return;
    }
    void apiGetDataTable(selectedId).then(setSelectedTable).catch(() => setSelectedTable(null));
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
      await apiCreateDataTable({
        id: table.id,
        name: table.name,
        source: table.source,
        columns: table.columns,
        rows: table.rows,
        original_filename: file.name,
      });
      await refresh();
      setSelectedId(table.id);
    } catch (err) {
      window.alert(`CSV import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
    e.target.value = '';
  };

  const handleSheetsImport = async (table: DataTable) => {
    await apiCreateDataTable({
      id: table.id,
      name: table.name,
      source: table.source,
      columns: table.columns,
      rows: table.rows,
      googleSheets: table.googleSheets,
    });
    await refresh();
    setSelectedId(table.id);
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Delete "${name}"?`)) return;
    await apiDeleteDataTable(id);
    if (selectedId === id) setSelectedId(null);
    await refresh();
  };

  const handleRename = async (name: string) => {
    if (!selectedId) return;
    await apiUpdateDataTable(selectedId, { name });
    await refresh();
    // Reload detail to reflect updated name
    const updated = await apiGetDataTable(selectedId);
    setSelectedTable(updated);
  };

  const handleUpdateDescription = async (description: string) => {
    if (!selectedId) return;
    await apiUpdateDataTable(selectedId, { description });
    await refresh();
  };

  const handleUpdateTags = async (tags: string[]) => {
    if (!selectedId) return;
    await apiUpdateDataTable(selectedId, { tags });
    await refresh();
    const updated = await apiGetDataTable(selectedId);
    setSelectedTable(updated);
  };

  // Filter tables by source and tags
  const filteredTables = tables;

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
            <SheetsImportButton onImported={handleSheetsImport} />
          )}
        </Group>
        <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} hidden />
      </Group>

      {/* Body: list + viewer */}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {/* Left: table list with search + filters */}
        <Box
          style={{
            width: 260,
            flexShrink: 0,
            borderRight: '1px solid var(--mantine-color-gray-3)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Search */}
          <Box px="xs" pt="xs" pb={4}>
            <TextInput
              size="xs"
              placeholder="Search tables..."
              leftSection={<IconSearch size={12} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
          </Box>

          {/* Source filter chips */}
          <Group gap={4} px="xs" pb={6}>
            <Chip.Group value={sourceFilter ?? 'all'} onChange={(v) => setSourceFilter(v === 'all' ? null : (v as string))}>
              <Chip size="xs" value="all" variant="light">All</Chip>
              <Chip size="xs" value="csv" variant="light">CSV</Chip>
              <Chip size="xs" value="google_sheets" variant="light" color="teal">Sheets</Chip>
            </Chip.Group>
          </Group>

          <ScrollArea style={{ flex: 1 }} type="auto">
            <Stack gap={2} px="xs" pb="xs">
              {loading && <Text size="xs" c="dimmed">Loading...</Text>}
              {!loading && filteredTables.length === 0 && (
                <Text size="xs" c="dimmed" p="xs">
                  {tables.length === 0 ? 'No data tables yet. Upload a CSV or import from Google Sheets.' : 'No tables match your filter.'}
                </Text>
              )}
              {filteredTables.map((t) => (
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
                    {t.tags.length > 0 && (
                      <Group gap={2} mt={2}>
                        {t.tags.slice(0, 3).map((tag) => (
                          <Badge key={tag} size="xs" variant="dot" color="grape">{tag}</Badge>
                        ))}
                        {t.tags.length > 3 && <Text size="xs" c="dimmed">+{t.tags.length - 3}</Text>}
                      </Group>
                    )}
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
              {/* Table header with metadata */}
              <Stack gap={4} px="md" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', flexShrink: 0 }}>
                <Group gap="sm" justify="space-between">
                  <Group gap="sm">
                    <EditableName value={selectedTable.name} onSave={handleRename} />
                    <Badge size="xs" variant="light">{selectedTable.rows.length} rows</Badge>
                    <Badge size="xs" variant="light" color="gray">{selectedTable.columns.length} columns</Badge>
                    <StalenessIndicator updatedAt={selectedTable.updatedAt} />
                  </Group>
                  <Button
                    size="compact-xs"
                    variant="light"
                    color="gray"
                    leftSection={<IconDownload size={12} />}
                    component="a"
                    href={apiDataTableCsvUrl(selectedTable.id)}
                    download
                  >
                    CSV
                  </Button>
                </Group>

                {/* Tags */}
                <Group gap={4}>
                  <TagsEditor tags={selectedTable.tags ?? []} onSave={handleUpdateTags} />
                </Group>

                {/* Provenance */}
                <Group gap={8} style={{ fontSize: '0.72rem', color: '#888' }}>
                  <span>Source: {selectedTable.source === 'google_sheets' ? 'Google Sheets' : 'CSV'}</span>
                  {selectedTable.original_filename && <span>File: {selectedTable.original_filename}</span>}
                  {selectedTable.googleSheets && (
                    <Tooltip label={selectedTable.googleSheets.spreadsheetUrl}>
                      <span style={{ cursor: 'help' }}>Sheet: {selectedTable.googleSheets.sheetName}</span>
                    </Tooltip>
                  )}
                  <span>Created: {new Date(selectedTable.createdAt).toLocaleDateString()}</span>
                </Group>

                {/* Description */}
                <Textarea
                  size="xs"
                  placeholder="Add a description..."
                  value={selectedTable.description ?? ''}
                  onChange={(e) => {
                    // Optimistic local update
                    setSelectedTable((prev) => prev ? { ...prev, description: e.currentTarget.value } : prev);
                  }}
                  onBlur={(e) => handleUpdateDescription(e.currentTarget.value)}
                  autosize
                  minRows={1}
                  maxRows={3}
                  styles={{ input: { fontSize: '0.78rem', color: '#555' } }}
                />
              </Stack>

              {/* Column stats strip */}
              {selectedTable.column_stats && Object.keys(selectedTable.column_stats).length > 0 && (
                <Box px="md" py={4} style={{ borderBottom: '1px solid var(--mantine-color-gray-1)', background: '#fafbfc' }}>
                  <Group gap={16} wrap="wrap">
                    {selectedTable.columns.map((col) => {
                      const stats = selectedTable.column_stats?.[col.key];
                      if (!stats) return null;
                      return (
                        <Box key={col.key}>
                          <Text size="xs" fw={600} c="dimmed">{col.label}</Text>
                          <StatsRow col={col} stats={stats} />
                        </Box>
                      );
                    })}
                  </Group>
                </Box>
              )}

              {/* Table data */}
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
