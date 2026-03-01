import { Group, SegmentedControl, Stack, Switch, Text, Title } from '@mantine/core';
import { useEditorStore } from '../../state/editorStore';
import type { LayoutMetadata, NodeModel } from '../../types/model';

function withLayout(node: NodeModel): NodeModel & { layout?: LayoutMetadata } {
  return node as NodeModel & { layout?: LayoutMetadata };
}

export function ImportedLayersPanel() {
  const model = useEditorStore((s) => s.model);
  const selected = useEditorStore((s) => s.selected);
  const updateNode = useEditorStore((s) => s.updateNode);

  if (!selected || selected.kind !== 'node') return null;
  const node = model.nodes.find((n) => n.id === selected.id);
  if (!node) return null;

  const n = withLayout(node);
  const visible = n.layout?.visible ?? true;
  const locked = n.layout?.locked ?? false;

  return (
    <Stack gap="xs">
      <Title order={5}>Layers</Title>
      <Group justify="space-between">
        <Text size="sm">Visible</Text>
        <Switch
          checked={visible}
          onChange={(e) => updateNode(node.id, { layout: { ...(n.layout ?? {}), visible: e.currentTarget.checked } } as Partial<NodeModel>)}
        />
      </Group>
      <Group justify="space-between">
        <Text size="sm">Locked</Text>
        <Switch
          checked={locked}
          onChange={(e) => updateNode(node.id, { layout: { ...(n.layout ?? {}), locked: e.currentTarget.checked } } as Partial<NodeModel>)}
        />
      </Group>
      <SegmentedControl
        data={[
          { label: 'Back', value: '0' },
          { label: 'Middle', value: '10' },
          { label: 'Front', value: '20' },
        ]}
        value={String(n.layout?.z_index ?? 10)}
        onChange={(value) => updateNode(node.id, { layout: { ...(n.layout ?? {}), z_index: Number(value) } } as Partial<NodeModel>)}
      />
    </Stack>
  );
}
