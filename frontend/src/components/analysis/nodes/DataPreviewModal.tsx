import { useCallback, useMemo, useState } from 'react';
import { ActionIcon, Badge, Box, Button, Modal, ScrollArea, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconArrowsSort, IconMaximize, IconSearch } from '@tabler/icons-react';
import { fetchNodePreview, type NodeResultResponse } from '../../../lib/api';

type ColumnInfo = { key: string; label: string; type: string };

type Props = {
  opened: boolean;
  onClose: () => void;
  result: NodeResultResponse;
  pipelineId?: string;
  nodeId?: string;
  title?: string;
};

type SortState = { col: string; dir: 'asc' | 'desc' } | null;

function cellStr(cell: unknown): string {
  if (cell == null) return '';
  return String(cell);
}

export function DataPreviewModal({ opened, onClose, result, pipelineId, nodeId, title }: Props) {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortState>(null);
  const [extraRows, setExtraRows] = useState<unknown[][]>([]);
  const [loadingMore, setLoadingMore] = useState(false);

  const preview = result.ok ? result.preview : null;
  const columns: ColumnInfo[] = useMemo(
    () =>
      (preview?.columns ?? []).map((c) =>
        typeof c === 'string'
          ? { key: c, label: c, type: 'string' }
          : { key: c.key, label: c.label, type: c.type ?? 'string' },
      ),
    [preview?.columns],
  );

  const previewRowCount = preview?.rows?.length ?? 0;
  const allRows: unknown[][] = useMemo(
    () => (preview?.rows ? [...preview.rows, ...extraRows] : []),
    [preview?.rows, extraRows],
  );
  const totalRows = result.shape?.[0] ?? 0;
  const hasMore = totalRows > previewRowCount + extraRows.length;

  // Search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return allRows;
    const q = search.toLowerCase();
    return allRows.filter((row) =>
      (row as unknown[]).some((cell) => cellStr(cell).toLowerCase().includes(q)),
    );
  }, [allRows, search]);

  // Sort
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const colIdx = columns.findIndex((c) => c.key === sort.col);
    if (colIdx < 0) return filtered;
    const isNum = columns[colIdx].type === 'number';
    return [...filtered].sort((a, b) => {
      const va = (a as unknown[])[colIdx];
      const vb = (b as unknown[])[colIdx];
      let cmp: number;
      if (isNum) {
        cmp = (Number(va) || 0) - (Number(vb) || 0);
      } else {
        cmp = cellStr(va).localeCompare(cellStr(vb));
      }
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sort, columns]);

  const handleSort = (colKey: string) => {
    setSort((prev) => {
      if (prev?.col === colKey) {
        return prev.dir === 'asc' ? { col: colKey, dir: 'desc' } : null;
      }
      return { col: colKey, dir: 'asc' };
    });
  };

  const handleLoadMore = useCallback(async () => {
    if (!pipelineId || !nodeId || loadingMore) return;
    setLoadingMore(true);
    try {
      const offset = previewRowCount + extraRows.length;
      const page = await fetchNodePreview(pipelineId, nodeId, offset, 200);
      if (page.ok && page.rows) {
        setExtraRows((prev) => [...prev, ...page.rows!]);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [pipelineId, nodeId, previewRowCount, extraRows.length, loadingMore]);

  const sortIcon = (colKey: string) => {
    if (sort?.col !== colKey) return <IconArrowsSort size={12} style={{ opacity: 0.3 }} />;
    return sort.dir === 'asc' ? <IconArrowUp size={12} /> : <IconArrowDown size={12} />;
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={title || 'Data Preview'}
      size="90%"
      styles={{
        content: { display: 'flex', flexDirection: 'column', maxHeight: '85vh' },
        body: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
      }}
    >
      {/* Toolbar */}
      <Box style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexShrink: 0 }}>
        <TextInput
          size="xs"
          placeholder="Search all columns..."
          leftSection={<IconSearch size={14} />}
          value={search}
          onChange={(e) => setSearch(e.currentTarget.value)}
          style={{ flex: 1, maxWidth: 300 }}
        />
        <Badge size="sm" variant="light" color="gray">
          {search ? `${sorted.length} / ${totalRows}` : totalRows.toLocaleString()} rows
        </Badge>
        <Badge size="sm" variant="light" color="gray">
          {columns.length} cols
        </Badge>
      </Box>

      {/* Table */}
      <ScrollArea style={{ flex: 1 }}>
        <Table striped highlightOnHover style={{ fontSize: 12 }}>
          <Table.Thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
            <Table.Tr>
              {columns.map((col) => (
                <Table.Th
                  key={col.key}
                  style={{ padding: '4px 10px', cursor: 'pointer', whiteSpace: 'nowrap', userSelect: 'none' }}
                  onClick={() => handleSort(col.key)}
                >
                  <Box style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <Text size="xs" fw={600}>{col.label}</Text>
                    {sortIcon(col.key)}
                    <Text size="xs" c="dimmed" fw={400}>({col.type})</Text>
                  </Box>
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {sorted.map((row, i) => (
              <Table.Tr key={i}>
                {(row as unknown[]).map((cell, j) => (
                  <Table.Td
                    key={j}
                    style={{
                      padding: '3px 10px',
                      maxWidth: 250,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      fontFamily: columns[j]?.type === 'number' ? 'monospace' : undefined,
                    }}
                    title={cellStr(cell)}
                  >
                    {cellStr(cell)}
                  </Table.Td>
                ))}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </ScrollArea>

      {/* Load more */}
      {hasMore && !search && (
        <Box pt={8} style={{ textAlign: 'center', flexShrink: 0 }}>
          <Button size="compact-xs" variant="subtle" loading={loadingMore} onClick={handleLoadMore}>
            Load more ({totalRows - allRows.length} remaining)
          </Button>
        </Box>
      )}
    </Modal>
  );
}

/** Compact inline preview bar — replaces full table in nodes. */
export function CompactResultBar({ result, onExpand }: { result: NodeResultResponse; onExpand: () => void }) {
  const preview = result.ok ? result.preview : null;
  if (!preview) return null;

  const cols = (preview.columns ?? []).map((c: any) => (typeof c === 'string' ? c : c.label ?? c.key));
  const colPreview = cols.slice(0, 5).join(', ') + (cols.length > 5 ? `, +${cols.length - 5}` : '');

  return (
    <Box
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 12px',
        borderTop: '1px solid #f0f0f0',
        background: '#f8f9fa',
        cursor: 'pointer',
      }}
      onClick={onExpand}
    >
      <Badge size="xs" variant="light" color="gray">
        {result.shape?.[0]?.toLocaleString()} x {result.shape?.[1]}
      </Badge>
      <Text size="xs" c="dimmed" style={{ fontFamily: 'monospace', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {colPreview}
      </Text>
      <Tooltip label="Expand table">
        <ActionIcon size="xs" variant="subtle" color="gray">
          <IconMaximize size={12} />
        </ActionIcon>
      </Tooltip>
    </Box>
  );
}
