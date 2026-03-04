import { SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import {
  IconBox,
  IconArrowRight,
  IconVariable,
  IconChartLine,
  IconLetterT,
  IconTopologyRing,
} from '@tabler/icons-react';
import { useEditorStore } from '../../../state/editorStore';

const COMPONENT_TYPES = [
  { type: 'stock' as const, label: 'Stock', color: '#1c7ed6', icon: IconBox },
  { type: 'flow' as const, label: 'Flow', color: '#845ef7', icon: IconArrowRight },
  { type: 'aux' as const, label: 'Variable', color: '#37b24d', icon: IconVariable },
  { type: 'lookup' as const, label: 'Look-up', color: '#f76707', icon: IconChartLine },
  { type: 'text' as const, label: 'Text', color: '#868e96', icon: IconLetterT },
] as const;

export function ComponentsPalette() {
  const addNode = useEditorStore((s) => s.addNode);
  const addCldSymbol = useEditorStore((s) => s.addCldSymbol);

  const buttonStyle = {
    display: 'flex' as const,
    flexDirection: 'column' as const,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    height: 68,
    borderRadius: 6,
    background: 'var(--mantine-color-gray-0)',
    transition: 'background 120ms ease',
  };

  const handleEnter = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLButtonElement).style.background = 'var(--mantine-color-gray-1)';
  };
  const handleLeave = (e: React.MouseEvent) => {
    (e.currentTarget as HTMLButtonElement).style.background = 'var(--mantine-color-gray-0)';
  };

  return (
    <Stack gap={8}>
      <SimpleGrid cols={2} spacing={8}>
        {COMPONENT_TYPES.map(({ type, label, color, icon: Icon }) => (
          <UnstyledButton
            key={type}
            onClick={() => addNode(type)}
            style={buttonStyle}
            onMouseEnter={handleEnter}
            onMouseLeave={handleLeave}
          >
            <Icon size={22} color={color} stroke={1.8} />
            <Text size="xs" mt={4} c="dimmed" fw={500}>
              {label}
            </Text>
          </UnstyledButton>
        ))}
        <UnstyledButton
          onClick={() => addCldSymbol('R')}
          style={buttonStyle}
          onMouseEnter={handleEnter}
          onMouseLeave={handleLeave}
        >
          <IconTopologyRing size={22} color="#4c6ef5" stroke={1.8} />
          <Text size="xs" mt={4} c="dimmed" fw={500}>
            CLD
          </Text>
        </UnstyledButton>
      </SimpleGrid>
    </Stack>
  );
}
