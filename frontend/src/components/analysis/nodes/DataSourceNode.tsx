import { useEffect, useMemo, useState } from 'react';
import { Handle, Position, type NodeProps } from 'reactflow';
import { Box, Select, Text } from '@mantine/core';
import { IconDatabase } from '@tabler/icons-react';
import { listDataTables } from '../../../lib/dataTableStorage';
import type { DataTableMeta } from '../../../types/dataTable';

type DataSourceData = {
  data_table_id?: string;
  onUpdate: (patch: Record<string, unknown>) => void;
  result?: { ok: boolean; shape?: number[] };
};

export function DataSourceNode({ data }: NodeProps<DataSourceData>) {
  const [tables, setTables] = useState<DataTableMeta[]>([]);

  useEffect(() => {
    listDataTables().then(setTables).catch(() => setTables([]));
  }, []);

  const options = useMemo(
    () => tables.map((t) => ({ value: t.id, label: `${t.name} (${t.rowCount} rows)` })),
    [tables],
  );

  const selected = tables.find((t) => t.id === data.data_table_id);

  return (
    <Box
      style={{
        background: '#fff',
        border: '1px solid #dee2e6',
        borderRadius: 8,
        padding: 12,
        minWidth: 200,
      }}
    >
      <Box style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <IconDatabase size={14} color="#0b7285" />
        <Text size="xs" fw={600} c="cyan.8">Data Source</Text>
        {data.result && (
          <Box style={{ marginLeft: 'auto', width: 8, height: 8, borderRadius: '50%', background: data.result.ok ? '#2f9e44' : '#e03131' }} />
        )}
      </Box>
      <Select
        size="xs"
        value={data.data_table_id ?? null}
        onChange={(value) => data.onUpdate({ data_table_id: value ?? '' })}
        data={options}
        placeholder="Select table"
      />
      {selected && (
        <Text size="xs" c="dimmed" mt={4}>{selected.columns.length} columns</Text>
      )}
      <Handle type="source" position={Position.Right} />
    </Box>
  );
}
