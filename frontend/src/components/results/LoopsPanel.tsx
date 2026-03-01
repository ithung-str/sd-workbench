import { Badge, Button, Group, Paper, Stack, Text, Tooltip } from '@mantine/core';
import { IconRefresh } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import type { DetectedLoop, LinkPolarity } from '../../lib/loopDetection';

function polarityBadge(p: LinkPolarity) {
  if (p === '+') return <Badge size="xs" color="blue" variant="light">+</Badge>;
  if (p === '-') return <Badge size="xs" color="red" variant="light">&minus;</Badge>;
  return <Badge size="xs" color="gray" variant="light">?</Badge>;
}

function loopTypeBadge(type: DetectedLoop['type']) {
  if (type === 'R') return <Badge color="blue" variant="filled" size="sm">R</Badge>;
  if (type === 'B') return <Badge color="orange" variant="filled" size="sm">B</Badge>;
  return <Badge color="gray" variant="filled" size="sm">?</Badge>;
}

function LoopCard({ loop }: { loop: DetectedLoop }) {
  const highlightedLoopId = useEditorStore((s) => s.highlightedLoopId);
  const setHighlightedLoop = useEditorStore((s) => s.setHighlightedLoop);
  const isHighlighted = highlightedLoopId === loop.id;

  return (
    <Paper
      withBorder
      p="xs"
      radius="sm"
      style={{
        cursor: 'pointer',
        outline: isHighlighted ? '2px solid var(--mantine-color-violet-5)' : undefined,
        background: isHighlighted ? 'var(--mantine-color-violet-0)' : undefined,
      }}
      onClick={() => setHighlightedLoop(isHighlighted ? null : loop.id)}
    >
      <Group justify="space-between" mb={4}>
        <Group gap={6}>
          {loopTypeBadge(loop.type)}
          <Text size="sm" fw={600}>
            {loop.type === 'R' ? 'Reinforcing' : loop.type === 'B' ? 'Balancing' : 'Unknown'} Loop
          </Text>
        </Group>
        <Text size="xs" c="dimmed">{loop.nodeNames.length} variables</Text>
      </Group>

      <Group gap={4} wrap="wrap">
        {loop.links.map((link, i) => (
          <Group key={i} gap={2} wrap="nowrap">
            <Text size="xs" ff="monospace">{link.sourceName}</Text>
            {polarityBadge(link.polarity)}
            <Text size="xs" c="dimmed">&rarr;</Text>
          </Group>
        ))}
        <Text size="xs" ff="monospace" c="dimmed">
          ({loop.nodeNames[0]})
        </Text>
      </Group>
    </Paper>
  );
}

export function LoopsPanel() {
  const detectedLoops = useEditorStore((s) => s.detectedLoops);
  const refreshLoops = useEditorStore((s) => s.refreshLoops);

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Text size="sm" fw={500}>
          Feedback Loops
        </Text>
        <Button
          size="xs"
          variant="light"
          leftSection={<IconRefresh size={14} />}
          onClick={refreshLoops}
        >
          Detect Loops
        </Button>
      </Group>

      {detectedLoops.length === 0 ? (
        <Text size="sm" c="dimmed">
          Click "Detect Loops" to analyze the model for feedback loops.
        </Text>
      ) : (
        <>
          <Group gap="xs">
            <Badge color="blue" variant="light" size="sm">
              {detectedLoops.filter((l) => l.type === 'R').length} Reinforcing
            </Badge>
            <Badge color="orange" variant="light" size="sm">
              {detectedLoops.filter((l) => l.type === 'B').length} Balancing
            </Badge>
            {detectedLoops.some((l) => l.type === '?') && (
              <Badge color="gray" variant="light" size="sm">
                {detectedLoops.filter((l) => l.type === '?').length} Unknown
              </Badge>
            )}
          </Group>
          <Text size="xs" c="dimmed">
            Click a loop to highlight it on the canvas.
          </Text>
          <Stack gap="xs">
            {detectedLoops.map((loop) => (
              <LoopCard key={loop.id} loop={loop} />
            ))}
          </Stack>
        </>
      )}
    </Stack>
  );
}
