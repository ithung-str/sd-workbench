import { Badge, Group, Paper, ScrollArea, Stack, Text, UnstyledButton } from '@mantine/core';
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

export function ModelOutline() {
  const model = useEditorStore((s) => s.model);
  const selected = useEditorStore((s) => s.selected);
  const setSelected = useEditorStore((s) => s.setSelected);

  const visibleNodes = model.nodes.filter(
    (n) => n.type !== 'phantom' && n.type !== 'cloud',
  );

  const nodeLabel = (node: (typeof model.nodes)[number]): string => {
    if (node.type === 'text') return node.text;
    if (node.type === 'cloud') return 'Cloud';
    if (node.type === 'phantom') return 'Phantom';
    if (node.type === 'cld_symbol') return node.name?.trim() || `CLD ${node.symbol}`;
    return node.label;
  };

  return (
    <Stack gap={8}>
      <Group gap={6}>
        <Text size="xs" c="dimmed">
          {visibleNodes.length} element{visibleNodes.length !== 1 ? 's' : ''}
        </Text>
        <Badge size="xs" variant="light" color="gray">
          {visibleNodes.length}
        </Badge>
      </Group>

      <ScrollArea.Autosize mah="calc(100vh - 180px)">
        <Stack gap={4}>
          {visibleNodes.length === 0 ? (
            <Text size="xs" c="dimmed" ta="center" py="md">
              No elements yet
            </Text>
          ) : (
            visibleNodes.map((node) => {
              const isSelected = selected?.kind === 'node' && selected.id === node.id;
              return (
                <UnstyledButton
                  key={node.id}
                  onClick={() => setSelected({ kind: 'node', id: node.id })}
                  aria-label={`Select ${node.type} ${nodeLabel(node)}`}
                  style={{ display: 'block', width: '100%' }}
                >
                  <Paper
                    p={6}
                    withBorder
                    style={{
                      borderColor: isSelected ? 'var(--mantine-color-blue-5)' : undefined,
                      background: isSelected ? 'var(--mantine-color-blue-0)' : undefined,
                    }}
                  >
                    <Group gap={6} wrap="nowrap">
                      <Badge size="xs" color={NODE_TYPE_COLORS[node.type] ?? 'gray'}>
                        {node.type}
                      </Badge>
                      <Text size="xs" truncate>
                        {nodeLabel(node)}
                      </Text>
                    </Group>
                  </Paper>
                </UnstyledButton>
              );
            })
          )}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}
