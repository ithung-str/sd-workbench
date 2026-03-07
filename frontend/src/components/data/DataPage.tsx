import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Chip,
  CopyButton,
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
  IconCopy,
  IconDatabase,
  IconDownload,
  IconEdit,
  IconFile,
  IconFilter,
  IconHash,
  IconLink,
  IconRefresh,
  IconSearch,
  IconTable,
  IconTag,
  IconTrash,
  IconUpload,
  IconX,
} from '@tabler/icons-react';
import type { DataTable, DataTableMeta, ColumnStats } from '../../types/dataTable';
import {
  apiListAssets,
  apiGetAsset,
  apiCreateDataTable,
  apiUpdateAsset,
  apiDeleteAsset,
  apiAssetDataUrl,
  apiGetAssetVersions,
  apiGetDataTable,
  apiUpsertDataTable,
  type AssetMeta,
  type AssetDetail,
  type AssetVersionMeta,
} from '../../lib/api';
import { parseCSV } from '../../lib/csvParser';
import { GoogleSheetsImportModal } from '../analysis/GoogleSheetsImportModal';
import { refreshGoogleSheetsTable } from '../../lib/googleSheetsApi';
import { useGoogleAuth } from '../../lib/googleAuth';

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;
const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8000';

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

// ── Kind icons & labels ──

function KindIcon({ kind, size = 14 }: { kind: string; size?: number }) {
  if (kind === 'file') return <IconFile size={size} />;
  if (kind === 'value') return <IconHash size={size} />;
  return <IconTable size={size} />;
}

function kindLabel(kind: string): string {
  if (kind === 'file') return 'File';
  if (kind === 'value') return 'Value';
  return 'Table';
}

function sourceLabel(source: string): string {
  if (source === 'google_sheets') return 'Google Sheets';
  if (source === 'excel') return 'Excel';
  if (source === 'pipeline') return 'Pipeline';
  if (source === 'api') return 'API';
  return 'Upload';
}

// ── Slug + API URL display ──

function SlugDisplay({ slug }: { slug: string | null }) {
  if (!slug) return null;
  const apiUrl = `${API_BASE}/api/assets/by-slug/${slug}/data`;
  return (
    <Group gap={4} wrap="nowrap">
      <IconLink size={10} color="#868e96" />
      <Text size="xs" c="dimmed" ff="monospace" style={{ fontSize: 10 }}>{slug}</Text>
      <CopyButton value={apiUrl}>
        {({ copied, copy }) => (
          <Tooltip label={copied ? 'Copied!' : 'Copy API URL'}>
            <ActionIcon size={14} variant="subtle" color={copied ? 'green' : 'gray'} onClick={copy}>
              {copied ? <IconCheck size={10} /> : <IconCopy size={10} />}
            </ActionIcon>
          </Tooltip>
        )}
      </CopyButton>
    </Group>
  );
}

// ── Version list ──

function VersionList({ versions }: { versions: AssetVersionMeta[] }) {
  if (versions.length <= 1) return null;
  return (
    <Box mt={4}>
      <Text size="xs" fw={600} c="dimmed" mb={2}>Versions ({versions.length})</Text>
      <Stack gap={2}>
        {versions.map((v) => (
          <Group key={v.id} gap={6} style={{ fontSize: '0.7rem' }}>
            <Badge size="xs" variant="light">v{v.version}</Badge>
            <Text size="xs" c="dimmed">{new Date(v.created_at).toLocaleDateString()}</Text>
            {v.row_count != null && <Text size="xs" c="dimmed">{v.row_count} rows</Text>}
            {v.lineage && <Badge size="xs" variant="dot" color="violet">pipeline</Badge>}
          </Group>
        ))}
      </Stack>
    </Box>
  );
}

// ── Main page ──

export function DataPage() {
  const [assets, setAssets] = useState<AssetMeta[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedAsset, setSelectedAsset] = useState<AssetDetail | null>(null);
  const [versions, setVersions] = useState<AssetVersionMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [kindFilter, setKindFilter] = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const list = await apiListAssets({
        search: search || undefined,
        kind: kindFilter || undefined,
        source: sourceFilter || undefined,
      });
      setAssets(list);
    } catch (err) {
      console.warn('[AssetsPage] Failed to load assets:', err);
      setAssets([]);
    }
    setLoading(false);
  }, [search, kindFilter, sourceFilter]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedAsset(null);
      setVersions([]);
      return;
    }
    void apiGetAsset(selectedId).then((a) => {
      setSelectedAsset(a);
      void apiGetAssetVersions(selectedId).then(setVersions).catch(() => setVersions([]));
    }).catch(() => { setSelectedAsset(null); setVersions([]); });
  }, [selectedId]);

  // Auto-select first
  useEffect(() => {
    if (!selectedId && assets.length > 0) {
      setSelectedId(assets[0].id);
    }
  }, [assets, selectedId]);

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
    await apiDeleteAsset(id);
    if (selectedId === id) setSelectedId(null);
    await refresh();
  };

  const handleRename = async (name: string) => {
    if (!selectedId) return;
    await apiUpdateAsset(selectedId, { name });
    await refresh();
    const updated = await apiGetAsset(selectedId);
    setSelectedAsset(updated);
  };

  const handleUpdateDescription = async (description: string) => {
    if (!selectedId) return;
    await apiUpdateAsset(selectedId, { description });
    await refresh();
  };

  const handleUpdateTags = async (tags: string[]) => {
    if (!selectedId) return;
    await apiUpdateAsset(selectedId, { tags });
    await refresh();
    const updated = await apiGetAsset(selectedId);
    setSelectedAsset(updated);
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
        <Title order={4}>Assets</Title>
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
        {/* Left: asset list with search + filters */}
        <Box
          style={{
            width: 280,
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
              placeholder="Search assets..."
              leftSection={<IconSearch size={12} />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
            />
          </Box>

          {/* Kind filter chips */}
          <Group gap={4} px="xs" pb={2}>
            <Chip.Group value={kindFilter ?? 'all'} onChange={(v) => setKindFilter(v === 'all' ? null : (v as string))}>
              <Chip size="xs" value="all" variant="light">All</Chip>
              <Chip size="xs" value="table" variant="light"><IconTable size={10} style={{ marginRight: 2 }} />Tables</Chip>
              <Chip size="xs" value="file" variant="light"><IconFile size={10} style={{ marginRight: 2 }} />Files</Chip>
              <Chip size="xs" value="value" variant="light"><IconHash size={10} style={{ marginRight: 2 }} />Values</Chip>
            </Chip.Group>
          </Group>

          {/* Source filter chips */}
          <Group gap={4} px="xs" pb={6}>
            <Chip.Group value={sourceFilter ?? 'all'} onChange={(v) => setSourceFilter(v === 'all' ? null : (v as string))}>
              <Chip size="xs" value="all" variant="light">All</Chip>
              <Chip size="xs" value="upload" variant="light">Upload</Chip>
              <Chip size="xs" value="pipeline" variant="light" color="violet">Pipeline</Chip>
              <Chip size="xs" value="google_sheets" variant="light" color="teal">Sheets</Chip>
            </Chip.Group>
          </Group>

          <ScrollArea style={{ flex: 1 }} type="auto">
            <Stack gap={2} px="xs" pb="xs">
              {loading && <Text size="xs" c="dimmed">Loading...</Text>}
              {!loading && assets.length === 0 && (
                <Text size="xs" c="dimmed" p="xs">
                  No assets yet. Upload a CSV, import from Google Sheets, or publish from a pipeline.
                </Text>
              )}
              {assets.map((a) => (
                <Group
                  key={a.id}
                  gap={4}
                  wrap="nowrap"
                  style={{
                    padding: '6px 8px',
                    borderRadius: 4,
                    cursor: 'pointer',
                    background: selectedId === a.id ? 'var(--mantine-color-violet-0)' : undefined,
                  }}
                >
                  <UnstyledButton
                    style={{ flex: 1, overflow: 'hidden' }}
                    onClick={() => setSelectedId(a.id)}
                  >
                    <Group gap={4} wrap="nowrap">
                      <KindIcon kind={a.kind} size={12} />
                      <Text size="xs" fw={500} truncate>{a.name}</Text>
                    </Group>
                    <Group gap={4} mt={2}>
                      {a.kind === 'table' && a.row_count != null && (
                        <Badge size="xs" variant="light">{a.row_count} rows</Badge>
                      )}
                      {a.source === 'pipeline' && (
                        <Badge size="xs" variant="light" color="violet">Pipeline</Badge>
                      )}
                      {a.source === 'google_sheets' && (
                        <Badge size="xs" variant="light" color="teal">Sheets</Badge>
                      )}
                      {a.version > 1 && (
                        <Badge size="xs" variant="light" color="gray">v{a.version}</Badge>
                      )}
                    </Group>
                    {a.slug && (
                      <Text size="xs" c="dimmed" ff="monospace" style={{ fontSize: 9 }} mt={1} truncate>
                        {a.slug}
                      </Text>
                    )}
                  </UnstyledButton>
                  {a.source === 'google_sheets' && googleClientId && (
                    <RefreshSheetButton tableId={a.id} onRefreshed={refresh} />
                  )}
                  <Tooltip label="Delete">
                    <ActionIcon size="xs" variant="subtle" color="red" onClick={() => handleDelete(a.id, a.name)}>
                      <IconTrash size={12} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              ))}
            </Stack>
          </ScrollArea>
        </Box>

        {/* Right: asset detail viewer */}
        <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {!selectedAsset && (
            <Box p="xl" style={{ display: 'grid', placeItems: 'center', flex: 1 }}>
              <Text c="dimmed">Select an asset to view its contents</Text>
            </Box>
          )}
          {selectedAsset && (
            <>
              {/* Asset header with metadata */}
              <Stack gap={4} px="md" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-gray-2)', flexShrink: 0 }}>
                <Group gap="sm" justify="space-between">
                  <Group gap="sm">
                    <KindIcon kind={selectedAsset.kind} size={16} />
                    <EditableName value={selectedAsset.name} onSave={handleRename} />
                    <Badge size="xs" variant="light" color="gray">{kindLabel(selectedAsset.kind)}</Badge>
                    {selectedAsset.kind === 'table' && selectedAsset.row_count != null && (
                      <Badge size="xs" variant="light">{selectedAsset.row_count} rows</Badge>
                    )}
                    {selectedAsset.version > 1 && (
                      <Badge size="xs" variant="light" color="blue">v{selectedAsset.version}</Badge>
                    )}
                    <StalenessIndicator updatedAt={selectedAsset.updated_at} />
                  </Group>
                  <Group gap={4}>
                    {selectedAsset.kind === 'table' && (
                      <Button
                        size="compact-xs"
                        variant="light"
                        color="gray"
                        leftSection={<IconDownload size={12} />}
                        component="a"
                        href={apiAssetDataUrl(selectedAsset.id, 'csv')}
                        download
                      >
                        CSV
                      </Button>
                    )}
                    <Button
                      size="compact-xs"
                      variant="light"
                      color="gray"
                      leftSection={<IconDownload size={12} />}
                      component="a"
                      href={apiAssetDataUrl(selectedAsset.id, 'json')}
                      download
                    >
                      JSON
                    </Button>
                  </Group>
                </Group>

                {/* Slug + API URL */}
                <SlugDisplay slug={selectedAsset.slug} />

                {/* Tags */}
                <Group gap={4}>
                  <TagsEditor tags={selectedAsset.tags ?? []} onSave={handleUpdateTags} />
                </Group>

                {/* Provenance */}
                <Group gap={8} style={{ fontSize: '0.72rem', color: '#888' }}>
                  <span>Source: {sourceLabel(selectedAsset.source)}</span>
                  {selectedAsset.lineage && (
                    <Badge size="xs" variant="dot" color="violet">
                      Pipeline: {selectedAsset.lineage.pipeline_id.slice(0, 8)}
                    </Badge>
                  )}
                  <span>Created: {new Date(selectedAsset.created_at).toLocaleDateString()}</span>
                </Group>

                {/* Description */}
                <Textarea
                  size="xs"
                  placeholder="Add a description..."
                  value={selectedAsset.description ?? ''}
                  onChange={(e) => {
                    setSelectedAsset((prev) => prev ? { ...prev, description: e.currentTarget.value } : prev);
                  }}
                  onBlur={(e) => handleUpdateDescription(e.currentTarget.value)}
                  autosize
                  minRows={1}
                  maxRows={3}
                  styles={{ input: { fontSize: '0.78rem', color: '#555' } }}
                />

                {/* Version history */}
                <VersionList versions={versions} />
              </Stack>

              {/* Content area — kind-specific */}
              {selectedAsset.kind === 'table' && selectedAsset.columns && (
                <>
                  {/* Column stats strip */}
                  {selectedAsset.column_stats && Object.keys(selectedAsset.column_stats).length > 0 && (
                    <Box px="md" py={4} style={{ borderBottom: '1px solid var(--mantine-color-gray-1)', background: '#fafbfc' }}>
                      <Group gap={16} wrap="wrap">
                        {selectedAsset.columns.map((col) => {
                          const stats = selectedAsset.column_stats?.[col.key];
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
                          {selectedAsset.columns.map((col) => (
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
                        {(selectedAsset.rows ?? []).map((row, rowIdx) => (
                          <Table.Tr key={rowIdx}>
                            <Table.Td style={{ textAlign: 'center', color: '#999', fontSize: '0.72rem' }}>{rowIdx + 1}</Table.Td>
                            {row.map((cell, colIdx) => (
                              <Table.Td
                                key={colIdx}
                                style={{
                                  textAlign: selectedAsset.columns![colIdx]?.type === 'number' ? 'right' : 'left',
                                  fontVariantNumeric: selectedAsset.columns![colIdx]?.type === 'number' ? 'tabular-nums' : undefined,
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

              {/* File content viewer */}
              {selectedAsset.kind === 'file' && (
                <ScrollArea style={{ flex: 1 }} type="auto">
                  <Box px="md" py="sm">
                    <pre style={{
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      margin: 0,
                      padding: 12,
                      background: '#f8f9fa',
                      borderRadius: 6,
                      border: '1px solid #e9ecef',
                    }}>
                      {selectedAsset.content_text ?? '(empty)'}
                    </pre>
                  </Box>
                </ScrollArea>
              )}

              {/* Value viewer */}
              {selectedAsset.kind === 'value' && (
                <ScrollArea style={{ flex: 1 }} type="auto">
                  <Box px="md" py="sm">
                    <pre style={{
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      margin: 0,
                      padding: 12,
                      background: '#f8f9fa',
                      borderRadius: 6,
                      border: '1px solid #e9ecef',
                    }}>
                      {selectedAsset.value != null ? JSON.stringify(selectedAsset.value, null, 2) : '(empty)'}
                    </pre>
                  </Box>
                </ScrollArea>
              )}
            </>
          )}
        </Box>
      </div>
    </Box>
  );
}
