import type { ReactNode } from 'react';
import { Group, Text, UnstyledButton } from '@mantine/core';
import {
  IconLayoutDashboard,
  IconMath,
  IconArtboard,
  IconGitCompare,
  IconChartDots3,
  IconTarget,
  IconTable,
} from '@tabler/icons-react';
import { useEditorStore, type WorkbenchTab } from '../../state/editorStore';
import '../../styles/bottom-nav.css';

const TABS: Array<{
  value: WorkbenchTab;
  label: string;
  icon: ReactNode;
  activeColor: string;
}> = [
  { value: 'canvas', label: 'Canvas', icon: <IconArtboard size={14} />, activeColor: '#4263eb' },
  { value: 'formulas', label: 'Formulas', icon: <IconMath size={14} />, activeColor: '#2b8a3e' },
  { value: 'dashboard', label: 'Dashboard', icon: <IconLayoutDashboard size={14} />, activeColor: '#e67700' },
  { value: 'scenarios', label: 'Scenarios', icon: <IconGitCompare size={14} />, activeColor: '#1971c2' },
  { value: 'sensitivity', label: 'Sensitivity', icon: <IconChartDots3 size={14} />, activeColor: '#c2255c' },
  { value: 'optimisation', label: 'Optimise', icon: <IconTarget size={14} />, activeColor: '#5c2d91' },
  { value: 'data', label: 'Data', icon: <IconTable size={14} />, activeColor: '#0b7285' },
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
      <div className="bottom-nav-tabs">
        {TABS.map(({ value, label, icon, activeColor }) => {
          const isActive = activeTab === value;
          return (
            <button
              key={value}
              type="button"
              className={`bottom-nav-tab ${isActive ? 'bottom-nav-tab-active' : ''}`}
              style={isActive ? { background: activeColor, color: '#fff' } : undefined}
              onClick={() => setActiveTab(value)}
            >
              <span className="bottom-nav-tab-icon">{icon}</span>
              <span className="bottom-nav-tab-label">{label}</span>
            </button>
          );
        })}
      </div>
      <Group gap="sm" className="bottom-nav-status">
        <Text size="xs" c="dimmed">{nodeCount} nodes</Text>
        {errorCount > 0 && (
          <Text size="xs" c="red">{errorCount} errors</Text>
        )}
      </Group>
    </div>
  );
}
