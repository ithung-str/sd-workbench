import { useState } from 'react';
import {
  ColorInput,
  Divider,
  Group,
  SegmentedControl,
  Stack,
  Switch,
  Text,
} from '@mantine/core';
import { useEditorStore } from '../../../state/editorStore';
import { useUIStore } from '../../../state/uiStore';

const STYLE_NODE_TYPES = ['stock', 'flow', 'aux', 'lookup'] as const;

export function SettingsPanel() {
  const updateDefaultStyle = useEditorStore((s) => s.updateDefaultStyle);
  const defaultStyles = useEditorStore((s) => s.model.metadata?.default_styles);

  const showFunctionInternals = useUIStore((s) => s.showFunctionInternals);
  const showMinimap = useUIStore((s) => s.showMinimap);
  const showXmlModel = useUIStore((s) => s.showXmlModel);
  const curvedEdges = useUIStore((s) => s.curvedEdges);
  const toggleFunctionInternals = useUIStore((s) => s.toggleFunctionInternals);
  const toggleMinimap = useUIStore((s) => s.toggleMinimap);
  const toggleXmlModel = useUIStore((s) => s.toggleXmlModel);
  const toggleCurvedEdges = useUIStore((s) => s.toggleCurvedEdges);

  const [styleTab, setStyleTab] = useState<string>('stock');
  const currentStyleType = styleTab as (typeof STYLE_NODE_TYPES)[number];
  const currentStyles = defaultStyles?.[currentStyleType];

  return (
    <Stack gap="sm">
      {/* ── Default Styles ── */}
      <Text size="xs" fw={600} tt="uppercase" c="dimmed">
        Default Styles
      </Text>
      <SegmentedControl
        value={styleTab}
        onChange={setStyleTab}
        size="xs"
        fullWidth
        data={STYLE_NODE_TYPES.map((t) => ({
          value: t,
          label: t.charAt(0).toUpperCase() + t.slice(1),
        }))}
      />
      <Stack gap={6}>
        <ColorInput
          label="Fill"
          size="xs"
          placeholder="Default"
          value={currentStyles?.fill ?? ''}
          onChange={(value) =>
            updateDefaultStyle(currentStyleType, { fill: value || undefined })
          }
        />
        <ColorInput
          label="Stroke"
          size="xs"
          placeholder="Default"
          value={currentStyles?.stroke ?? ''}
          onChange={(value) =>
            updateDefaultStyle(currentStyleType, { stroke: value || undefined })
          }
        />
        <ColorInput
          label="Text"
          size="xs"
          placeholder="Default"
          value={currentStyles?.text_color ?? ''}
          onChange={(value) =>
            updateDefaultStyle(currentStyleType, { text_color: value || undefined })
          }
        />
      </Stack>

      <Divider />

      {/* ── View Options ── */}
      <Text size="xs" fw={600} tt="uppercase" c="dimmed">
        View Options
      </Text>
      <Stack gap={8}>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs">Show function arguments</Text>
          <Switch
            checked={showFunctionInternals}
            onChange={toggleFunctionInternals}
            size="xs"
            color="deepPurple"
          />
        </Group>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs">Show minimap</Text>
          <Switch
            checked={showMinimap}
            onChange={toggleMinimap}
            size="xs"
            color="deepPurple"
          />
        </Group>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs">Show XML model</Text>
          <Switch
            checked={showXmlModel}
            onChange={toggleXmlModel}
            size="xs"
            color="deepPurple"
          />
        </Group>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs">Curved influence arrows</Text>
          <Switch
            checked={curvedEdges}
            onChange={toggleCurvedEdges}
            size="xs"
            color="deepPurple"
          />
        </Group>
      </Stack>
    </Stack>
  );
}
