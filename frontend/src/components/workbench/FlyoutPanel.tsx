import { ScrollArea, Text, ActionIcon } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import { useUIStore, type FlyoutPanel as FlyoutPanelType } from '../../state/uiStore';
import { ComponentsPalette } from './flyouts/ComponentsPalette';
import { ModelOutline } from './flyouts/ModelOutline';
import { GlobalVariables } from './flyouts/GlobalVariables';
import { SettingsPanel } from './flyouts/SettingsPanel';
import { SearchPanel } from './flyouts/SearchPanel';
import '../../styles/flyout-panel.css';

const PANEL_TITLES: Record<NonNullable<FlyoutPanelType>, string> = {
  components: 'Components',
  outline: 'Model Outline',
  variables: 'Global Variables',
  settings: 'Settings',
  search: 'Search',
};

export function FlyoutPanel() {
  const activeFlyout = useUIStore((s) => s.activeFlyout);
  const setActiveFlyout = useUIStore((s) => s.setActiveFlyout);

  if (!activeFlyout) return null;

  return (
    <div className="flyout-panel">
      <div className="flyout-panel-header">
        <Text size="sm" fw={600}>{PANEL_TITLES[activeFlyout]}</Text>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={() => setActiveFlyout(null)}>
          <IconX size={14} />
        </ActionIcon>
      </div>
      <ScrollArea className="flyout-panel-scroll">
        <div className="flyout-panel-body">
          {activeFlyout === 'components' && <ComponentsPalette />}
          {activeFlyout === 'outline' && <ModelOutline />}
          {activeFlyout === 'variables' && <GlobalVariables />}
          {activeFlyout === 'settings' && <SettingsPanel />}
          {activeFlyout === 'search' && <SearchPanel />}
        </div>
      </ScrollArea>
    </div>
  );
}
