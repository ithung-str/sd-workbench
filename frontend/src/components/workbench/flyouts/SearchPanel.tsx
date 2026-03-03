import { useState } from 'react';
import { Stack, Text, TextInput, UnstyledButton, Badge, Group } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useEditorStore } from '../../../state/editorStore';

const NODE_TYPE_COLORS: Record<string, string> = {
  stock: 'blue',
  flow: 'violet',
  aux: 'green',
  lookup: 'orange',
  phantom: 'gray',
  text: 'cyan',
  cloud: 'cyan',
  cld_symbol: 'indigo',
};

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const model = useEditorStore((s) => s.model);
  const setSelected = useEditorStore((s) => s.setSelected);

  const results = query.trim()
    ? model.nodes
        .filter((n) => {
          const name = 'name' in n ? (n as { name?: string }).name : undefined;
          return name != null && name.toLowerCase().includes(query.toLowerCase());
        })
        .slice(0, 20)
    : [];

  return (
    <Stack gap={8}>
      <TextInput
        placeholder="Search nodes..."
        size="xs"
        leftSection={<IconSearch size={14} />}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      {results.map((node) => (
        <UnstyledButton
          key={node.id}
          onClick={() => setSelected({ kind: 'node', id: node.id })}
          style={{ padding: '4px 8px', borderRadius: 4 }}
        >
          <Group gap={6}>
            <Badge size="xs" variant="light" color={NODE_TYPE_COLORS[node.type] ?? 'gray'}>
              {node.type}
            </Badge>
            <Text size="xs">{'name' in node ? (node as { name?: string }).name ?? node.id : node.id}</Text>
          </Group>
        </UnstyledButton>
      ))}
      {query.trim() && results.length === 0 && (
        <Text size="xs" c="dimmed" ta="center">
          No results found
        </Text>
      )}
    </Stack>
  );
}
