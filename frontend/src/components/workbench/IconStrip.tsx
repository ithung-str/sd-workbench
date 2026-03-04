import { ActionIcon, Stack, Tooltip } from '@mantine/core';
import {
  IconPlus,
  IconListDetails,
  IconVariable,
  IconSettings,
  IconTable,
} from '@tabler/icons-react';
import { useUIStore, type FlyoutPanel } from '../../state/uiStore';
import '../../styles/icon-strip.css';

const ICONS: Array<{ panel: NonNullable<FlyoutPanel>; icon: typeof IconPlus; label: string }> = [
  { panel: 'components', icon: IconPlus, label: 'Components' },
  { panel: 'outline', icon: IconListDetails, label: 'Model Outline' },
  { panel: 'variables', icon: IconVariable, label: 'Global Variables' },
  { panel: 'settings', icon: IconSettings, label: 'Settings' },
  { panel: 'data', icon: IconTable, label: 'Data Tables' },
];

export function IconStrip() {
  const activeFlyout = useUIStore((s) => s.activeFlyout);
  const toggleFlyout = useUIStore((s) => s.toggleFlyout);

  return (
    <div className="icon-strip">
      <Stack gap={2} align="center" py={8}>
        {ICONS.map(({ panel, icon: Icon, label }) => (
          <Tooltip key={panel} label={label} position="right" withArrow>
            <ActionIcon
              size="lg"
              variant="subtle"
              className={`icon-strip-btn ${activeFlyout === panel ? 'icon-strip-btn-active' : ''}`}
              onClick={() => toggleFlyout(panel)}
              aria-label={label}
            >
              <Icon size={20} />
            </ActionIcon>
          </Tooltip>
        ))}
      </Stack>
    </div>
  );
}
