import { Divider, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { IconCode, IconDatabase, IconBoxMultiple, IconMarkdown, IconSql, IconTableFilled, IconChartBar, IconChartLine, IconReportAnalytics, IconPuzzle } from '@tabler/icons-react';
import type { AnalysisComponent, AnalysisNodeType } from '../../../types/model';

type PaletteItem = {
  type: AnalysisNodeType;
  label: string;
  color: string;
  icon: typeof IconDatabase;
  outputMode?: string;
};

type Props = {
  components: AnalysisComponent[];
  onAddNode: (type: AnalysisNodeType, code?: string, outputMode?: string) => void;
};

const SOURCE_AND_CODE: PaletteItem[] = [
  { type: 'data_source', label: 'Data Source', color: '#0b7285', icon: IconDatabase },
  { type: 'code', label: 'Code', color: '#862e9c', icon: IconCode },
  { type: 'sql', label: 'SQL', color: '#1971c2', icon: IconSql },
  { type: 'note', label: 'Note', color: '#e67700', icon: IconMarkdown },
  { type: 'group', label: 'Group', color: '#4263eb', icon: IconBoxMultiple },
];

const OUTPUT_TYPES: PaletteItem[] = [
  { type: 'output', label: 'Table', color: '#e67700', icon: IconTableFilled, outputMode: 'table' },
  { type: 'output', label: 'Bar Chart', color: '#e67700', icon: IconChartBar, outputMode: 'bar' },
  { type: 'output', label: 'Line Chart', color: '#e67700', icon: IconChartLine, outputMode: 'line' },
  { type: 'output', label: 'Stats', color: '#e67700', icon: IconReportAnalytics, outputMode: 'stats' },
];

const tileStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  height: 68,
  borderRadius: 6,
  background: 'var(--mantine-color-gray-0)',
  cursor: 'grab',
  transition: 'background 120ms ease',
};

function DraggableTile({ item, onAddNode }: { item: PaletteItem; onAddNode: Props['onAddNode'] }) {
  const { type, label, color, icon: Icon, outputMode } = item;
  return (
    <UnstyledButton
      style={tileStyle}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('application/analysis-node-type', type);
        if (outputMode) e.dataTransfer.setData('application/analysis-output-mode', outputMode);
        e.dataTransfer.effectAllowed = 'copy';
      }}
      onClick={() => onAddNode(type, undefined, outputMode)}
    >
      <Icon size={22} color={color} stroke={1.8} />
      <Text size="xs" mt={4} c="dimmed" fw={500}>{label}</Text>
    </UnstyledButton>
  );
}

export function AnalysisNodesPalette({ components, onAddNode }: Props) {
  return (
    <Stack gap={12}>
      <SimpleGrid cols={2} spacing={8}>
        {SOURCE_AND_CODE.map((item) => (
          <DraggableTile key={item.label} item={item} onAddNode={onAddNode} />
        ))}
      </SimpleGrid>

      <Divider label="Outputs" labelPosition="center" />

      <SimpleGrid cols={2} spacing={8}>
        {OUTPUT_TYPES.map((item) => (
          <DraggableTile key={item.label} item={item} onAddNode={onAddNode} />
        ))}
      </SimpleGrid>

      {components.length > 0 && (
        <>
          <Divider label="Components" labelPosition="center" />
          <Stack gap={4}>
            {components.map((comp) => (
              <UnstyledButton
                key={comp.id}
                style={{
                  padding: '6px 8px',
                  borderRadius: 6,
                  background: 'var(--mantine-color-gray-0)',
                  cursor: 'grab',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('application/analysis-node-type', 'code');
                  e.dataTransfer.setData('application/analysis-node-code', comp.code);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => onAddNode('code', comp.code)}
              >
                <IconPuzzle size={14} color="#862e9c" />
                <Text size="xs" truncate fw={500}>{comp.name}</Text>
              </UnstyledButton>
            ))}
          </Stack>
        </>
      )}
    </Stack>
  );
}
