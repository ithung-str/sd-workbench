import { SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import {
  IconBox,
  IconArrowRight,
  IconVariable,
  IconChartLine,
  IconLetterT,
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

  return (
    <Stack gap={8}>
      <SimpleGrid cols={2} spacing={8}>
        {COMPONENT_TYPES.map(({ type, label, color, icon: Icon }) => (
          <UnstyledButton
            key={type}
            onClick={() => addNode(type)}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: 68,
              borderRadius: 6,
              border: '1px solid #e7e7ee',
              background: '#fafafa',
              transition: 'background 120ms ease',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#f0f0f5';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = '#fafafa';
            }}
          >
            <Icon size={22} color={color} stroke={1.8} />
            <Text size="xs" mt={4} c="dimmed" fw={500}>
              {label}
            </Text>
          </UnstyledButton>
        ))}
      </SimpleGrid>
    </Stack>
  );
}
