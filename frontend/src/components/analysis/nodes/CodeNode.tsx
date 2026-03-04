import { useCallback, useState } from 'react';
import { Handle, Position, type NodeProps, NodeResizer } from 'reactflow';
import { ActionIcon, Box, Text, TextInput, Table, ScrollArea, Tooltip } from '@mantine/core';
import { IconCode, IconDeviceFloppy } from '@tabler/icons-react';
import Editor from '@monaco-editor/react';
import type { NodeResultResponse } from '../../../lib/api';

type CodeData = {
  code?: string;
  onUpdate: (patch: Record<string, unknown>) => void;
  onSaveComponent?: (name: string, code: string) => void;
  result?: NodeResultResponse;
  selected?: boolean;
};

export function CodeNode({ data }: NodeProps<CodeData>) {
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);

  const handleCodeChange = useCallback(
    (value: string | undefined) => {
      data.onUpdate({ code: value ?? '' });
    },
    [data],
  );

  const handleSave = () => {
    if (saveName.trim() && data.code && data.onSaveComponent) {
      data.onSaveComponent(saveName.trim(), data.code);
      setSaveName('');
      setShowSave(false);
    }
  };

  const result = data.result;
  const preview = result?.ok ? result.preview : null;

  return (
    <>
      <NodeResizer minWidth={280} minHeight={200} isVisible={data.selected} />
      <Box
        style={{
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: 8,
          overflow: 'hidden',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <IconCode size={14} color="#862e9c" />
          <Text size="xs" fw={600} c="violet.8">Code</Text>
          {data.onSaveComponent && (
            <Tooltip label="Save as component">
              <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setShowSave(!showSave)} style={{ marginLeft: 'auto' }}>
                <IconDeviceFloppy size={12} />
              </ActionIcon>
            </Tooltip>
          )}
          {result && (
            <Box style={{ marginLeft: data.onSaveComponent ? 0 : 'auto', width: 8, height: 8, borderRadius: '50%', background: result.ok ? '#2f9e44' : '#e03131' }} />
          )}
        </Box>

        {showSave && (
          <Box style={{ display: 'flex', gap: 4, padding: '4px 12px', borderBottom: '1px solid #f0f0f0' }}>
            <TextInput
              size="xs"
              placeholder="Component name"
              value={saveName}
              onChange={(e) => setSaveName(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              style={{ flex: 1 }}
            />
            <ActionIcon size="sm" variant="filled" color="violet" onClick={handleSave} disabled={!saveName.trim()}>
              <IconDeviceFloppy size={12} />
            </ActionIcon>
          </Box>
        )}

        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />

        <Box style={{ flex: 1, minHeight: 80 }}>
          <Editor
            height="100%"
            language="python"
            theme="vs-light"
            value={data.code ?? ''}
            onChange={handleCodeChange}
            options={{
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: 'off',
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              padding: { top: 8 },
              overviewRulerLanes: 0,
            }}
          />
        </Box>

        {result && !result.ok && (
          <Box style={{ padding: '6px 12px', background: '#fff5f5', borderTop: '1px solid #ffc9c9', maxHeight: 80, overflow: 'auto' }}>
            <Text size="xs" c="red" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{result.error}</Text>
          </Box>
        )}
        {preview && (
          <Box style={{ borderTop: '1px solid #f0f0f0', maxHeight: 120 }}>
            <Text size="xs" c="dimmed" px={12} py={2}>{result?.shape?.[0]} rows x {result?.shape?.[1]} cols</Text>
            <ScrollArea style={{ maxHeight: 100 }}>
              <Table striped highlightOnHover style={{ fontSize: 11 }}>
                <Table.Thead>
                  <Table.Tr>
                    {preview.columns.map((col) => (
                      <Table.Th key={typeof col === 'string' ? col : col.key} style={{ padding: '2px 8px' }}>
                        {typeof col === 'string' ? col : col.label}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {preview.rows.slice(0, 10).map((row, i) => (
                    <Table.Tr key={i}>
                      {(row as unknown[]).map((cell, j) => (
                        <Table.Td key={j} style={{ padding: '2px 8px' }}>{cell != null ? String(cell) : ''}</Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Box>
        )}
      </Box>
    </>
  );
}
