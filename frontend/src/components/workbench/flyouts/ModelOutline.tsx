import { useState } from 'react';
import { Badge, Button, Divider, Group, ScrollArea, Stack, Text, TextInput, Tooltip, UnstyledButton } from '@mantine/core';
import { IconRefresh, IconSearch } from '@tabler/icons-react';
import { useEditorStore } from '../../../state/editorStore';
import type { DetectedLoop } from '../../../lib/loopDetection';

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

function LoopRow({ loop }: { loop: DetectedLoop }) {
  const highlightedLoopId = useEditorStore((s) => s.highlightedLoopId);
  const setHighlightedLoop = useEditorStore((s) => s.setHighlightedLoop);
  const isHighlighted = highlightedLoopId === loop.id;

  const typeColor = loop.type === 'R' ? 'blue' : loop.type === 'B' ? 'orange' : 'gray';
  const typeLabel = loop.type === 'R' ? 'Reinforcing' : loop.type === 'B' ? 'Balancing' : 'Unknown';
  const path = loop.nodeNames.join(' → ') + ' → ' + loop.nodeNames[0];

  return (
    <UnstyledButton
      onClick={() => setHighlightedLoop(isHighlighted ? null : loop.id)}
      style={{
        display: 'block',
        width: '100%',
        padding: '5px 8px',
        borderRadius: 4,
        background: isHighlighted ? 'var(--mantine-color-violet-0)' : 'transparent',
        transition: 'background 80ms ease',
      }}
      className="flyout-list-item"
    >
      <Group gap={6} wrap="nowrap">
        <Badge size="xs" variant="filled" color={typeColor}>
          {loop.type}
        </Badge>
        <Tooltip label={path} multiline maw={280} withArrow>
          <Text size="xs" truncate>
            {typeLabel}: {loop.nodeNames.join(' → ')}
          </Text>
        </Tooltip>
      </Group>
    </UnstyledButton>
  );
}

export function ModelOutline() {
  const model = useEditorStore((s) => s.model);
  const selected = useEditorStore((s) => s.selected);
  const setSelected = useEditorStore((s) => s.setSelected);
  const detectedLoops = useEditorStore((s) => s.detectedLoops);
  const refreshLoops = useEditorStore((s) => s.refreshLoops);
  const [searchQuery, setSearchQuery] = useState('');

  const allVisible = model.nodes.filter(
    (n) => n.type !== 'phantom' && n.type !== 'cloud',
  );

  const visibleNodes = searchQuery.trim()
    ? allVisible.filter((n) => {
        const name = 'name' in n ? (n as { name?: string }).name : undefined;
        const label = 'label' in n ? (n as { label?: string }).label : undefined;
        const q = searchQuery.toLowerCase();
        return (name?.toLowerCase().includes(q)) || (label?.toLowerCase().includes(q));
      })
    : allVisible;

  const nodeLabel = (node: (typeof model.nodes)[number]): string => {
    if (node.type === 'text') return node.text;
    if (node.type === 'cloud') return 'Cloud';
    if (node.type === 'phantom') return 'Phantom';
    if (node.type === 'cld_symbol') return node.name?.trim() || `CLD ${node.symbol}`;
    return node.label;
  };

  const reinforcing = detectedLoops.filter((l) => l.type === 'R').length;
  const balancing = detectedLoops.filter((l) => l.type === 'B').length;

  return (
    <Stack gap={4}>
      <TextInput
        placeholder="Search nodes..."
        size="xs"
        leftSection={<IconSearch size={14} />}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      <Text size="xs" c="dimmed">
        {visibleNodes.length} element{visibleNodes.length !== 1 ? 's' : ''}{searchQuery.trim() ? ` matching "${searchQuery}"` : ''}
      </Text>

      <ScrollArea.Autosize mah="calc(100vh - 180px)">
        <Stack gap={1}>
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
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '5px 8px',
                    borderRadius: 4,
                    background: isSelected ? 'var(--mantine-color-blue-0)' : 'transparent',
                    transition: 'background 80ms ease',
                  }}
                  className="flyout-list-item"
                >
                  <Group gap={6} wrap="nowrap">
                    <Badge size="xs" variant="light" color={NODE_TYPE_COLORS[node.type] ?? 'gray'}>
                      {node.type}
                    </Badge>
                    <Text size="xs" truncate>
                      {nodeLabel(node)}
                    </Text>
                  </Group>
                </UnstyledButton>
              );
            })
          )}
        </Stack>

        <Divider my="sm" />

        <Stack gap={4}>
          <Group justify="space-between">
            <Text size="xs" fw={600}>Loops</Text>
            <Button
              size="compact-xs"
              variant="subtle"
              leftSection={<IconRefresh size={12} />}
              onClick={refreshLoops}
            >
              Detect
            </Button>
          </Group>

          {detectedLoops.length === 0 ? (
            <Text size="xs" c="dimmed">
              Click Detect to find feedback loops.
            </Text>
          ) : (
            <>
              <Group gap={6}>
                {reinforcing > 0 && (
                  <Badge size="xs" variant="light" color="blue">
                    {reinforcing} R
                  </Badge>
                )}
                {balancing > 0 && (
                  <Badge size="xs" variant="light" color="orange">
                    {balancing} B
                  </Badge>
                )}
              </Group>
              <Stack gap={1}>
                {detectedLoops.map((loop) => (
                  <LoopRow key={loop.id} loop={loop} />
                ))}
              </Stack>
            </>
          )}
        </Stack>
      </ScrollArea.Autosize>
    </Stack>
  );
}
