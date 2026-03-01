import { Stack, TextInput, Title } from '@mantine/core';
import { useEditorStore } from '../../state/editorStore';
import type { NodeModel } from '../../types/model';

export function DisplayElementEditor() {
  const model = useEditorStore((s) => s.model);
  const selected = useEditorStore((s) => s.selected);
  const updateNode = useEditorStore((s) => s.updateNode);

  if (!selected || selected.kind !== 'node') return null;
  const node = model.nodes.find((n) => n.id === selected.id);
  if (!node || node.type !== 'text' || node.annotation?.kind !== 'display') return null;

  return (
    <Stack gap="xs">
      <Title order={5}>Display Element</Title>
      <TextInput
        label="Title"
        value={node.annotation?.title ?? ''}
        onChange={(e) =>
          updateNode(
            node.id,
            {
              annotation: { ...(node.annotation ?? {}), kind: 'display', title: e.target.value },
            } as Partial<NodeModel>,
          )
        }
      />
      <TextInput
        label="Source Variable"
        value={node.annotation?.note ?? ''}
        onChange={(e) =>
          updateNode(
            node.id,
            {
              annotation: { ...(node.annotation ?? {}), kind: 'display', note: e.target.value },
            } as Partial<NodeModel>,
          )
        }
      />
    </Stack>
  );
}
