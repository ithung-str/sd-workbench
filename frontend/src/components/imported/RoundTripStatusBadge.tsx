import { Badge, Group, Text } from '@mantine/core';
import { useEditorStore } from '../../state/editorStore';

export function RoundTripStatusBadge() {
  const model = useEditorStore((s) => s.model);
  const warnings = useEditorStore((s) => s.roundtripWarnings);
  const fragments = model.metadata?.imported?.roundtrip?.unmapped_fragments?.length ?? 0;

  const status = warnings.length === 0 && fragments === 0 ? 'lossless' : 'partial';

  return (
    <Group gap={8}>
      <Badge color={status === 'lossless' ? 'green' : 'yellow'}>{status === 'lossless' ? 'Round-trip: Lossless' : 'Round-trip: Partial'}</Badge>
      {(warnings.length > 0 || fragments > 0) && (
        <Text size="xs" c="dimmed">
          {warnings.length} warning(s), {fragments} unmapped fragment(s)
        </Text>
      )}
    </Group>
  );
}
