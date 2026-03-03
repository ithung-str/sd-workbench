import { Group, Text, UnstyledButton } from '@mantine/core';
import { useEditorStore, type WorkbenchTab } from '../../state/editorStore';
import '../../styles/bottom-nav.css';

const TABS: Array<{ value: WorkbenchTab; label: string }> = [
  { value: 'canvas', label: 'Canvas' },
  { value: 'formulas', label: 'Formulas' },
  { value: 'dashboard', label: 'Dashboard' },
  { value: 'scenarios', label: 'Scenarios' },
  { value: 'sensitivity', label: 'Sensitivity' },
];

export function BottomNavBar() {
  const activeTab = useEditorStore((s) => s.activeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const model = useEditorStore((s) => s.model);
  const validation = useEditorStore((s) => s.validation);

  const nodeCount = model.nodes.length;
  const errorCount = validation.errors?.length ?? 0;

  return (
    <div className="bottom-nav">
      <Group gap={0} className="bottom-nav-tabs">
        {TABS.map(({ value, label }) => (
          <UnstyledButton
            key={value}
            className={`bottom-nav-tab ${activeTab === value ? 'bottom-nav-tab-active' : ''}`}
            onClick={() => setActiveTab(value)}
          >
            <Text size="xs" fw={activeTab === value ? 600 : 400}>
              {label}
            </Text>
          </UnstyledButton>
        ))}
      </Group>
      <Group gap="sm" className="bottom-nav-status">
        <Text size="xs" c="dimmed">{nodeCount} nodes</Text>
        {errorCount > 0 && (
          <Text size="xs" c="red">{errorCount} errors</Text>
        )}
      </Group>
    </div>
  );
}
