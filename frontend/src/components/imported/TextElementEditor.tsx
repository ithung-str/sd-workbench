import { Stack, TextInput, Textarea, Title } from '@mantine/core';
import { useEditorStore } from '../../state/editorStore';
import type { NodeModel } from '../../types/model';

export function TextElementEditor() {
  const model = useEditorStore((s) => s.model);
  const selected = useEditorStore((s) => s.selected);
  const updateNode = useEditorStore((s) => s.updateNode);

  if (!selected || selected.kind !== 'node') return null;
  const node = model.nodes.find((n) => n.id === selected.id);
  if (!node || node.type !== 'text') return null;

  return (
    <Stack gap="xs">
      <Title order={5}>Text Element</Title>
      <Textarea label="Text" value={node.text} minRows={3} onChange={(e) => updateNode(node.id, { text: e.target.value } as Partial<NodeModel>)} />
      <TextInput
        label="Title"
        value={node.annotation?.title ?? ''}
        onChange={(e) => updateNode(node.id, { annotation: { ...(node.annotation ?? {}), title: e.target.value } } as Partial<NodeModel>)}
      />
      <TextInput
        label="Alignment"
        value={node.style?.text_align ?? ''}
        onChange={(e) => updateNode(node.id, { style: { ...(node.style ?? {}), text_align: e.target.value || undefined } } as Partial<NodeModel>)}
      />
    </Stack>
  );
}
