import { ColorInput, Group, NumberInput, Stack, TextInput, Title } from '@mantine/core';
import { useEditorStore } from '../../state/editorStore';
import type { EdgeModel, NodeModel, VisualStyle } from '../../types/model';

function withStyle(node: NodeModel): NodeModel & { style?: VisualStyle } {
  return node as NodeModel & { style?: VisualStyle };
}

export function AppearanceInspector() {
  const model = useEditorStore((s) => s.model);
  const selected = useEditorStore((s) => s.selected);
  const updateNode = useEditorStore((s) => s.updateNode);
  const updateEdge = useEditorStore((s) => s.updateEdge);

  if (!selected || (selected.kind !== 'node' && selected.kind !== 'edge')) return null;

  let style: VisualStyle = {};
  let apply: (delta: Partial<VisualStyle>) => void = () => {};
  if (selected.kind === 'node') {
    const node = model.nodes.find((n) => n.id === selected.id);
    if (!node) return null;
    const n = withStyle(node);
    style = n.style ?? {};
    apply = (delta) => updateNode(node.id, { style: { ...style, ...delta } } as Partial<NodeModel>);
  } else {
    const edge = model.edges.find((e) => e.id === selected.id) as (EdgeModel & { style?: VisualStyle }) | undefined;
    if (!edge) return null;
    style = edge.style ?? {};
    apply = (delta) => updateEdge(edge.id, { style: { ...style, ...delta } } as Partial<EdgeModel>);
  }

  return (
    <Stack gap="xs">
      <Title order={5}>Appearance</Title>
      <Group grow>
        <ColorInput label="Fill" value={style.fill ?? ''} onChange={(v) => apply({ fill: v || undefined })} />
        <ColorInput label="Stroke" value={style.stroke ?? ''} onChange={(v) => apply({ stroke: v || undefined })} />
      </Group>
      <Group grow>
        <ColorInput label="Text" value={style.text_color ?? ''} onChange={(v) => apply({ text_color: v || undefined })} />
        <TextInput label="Line style" value={style.line_style ?? ''} onChange={(e) => apply({ line_style: e.target.value || undefined })} />
      </Group>
      <Group grow>
        <NumberInput label="Stroke width" value={style.stroke_width ?? ''} onChange={(v) => apply({ stroke_width: v === '' ? undefined : Number(v) })} />
        <NumberInput label="Opacity" min={0} max={1} step={0.05} value={style.opacity ?? ''} onChange={(v) => apply({ opacity: v === '' ? undefined : Number(v) })} />
      </Group>
    </Stack>
  );
}
