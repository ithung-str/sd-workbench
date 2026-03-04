import { ActionIcon, Group, Menu, Tooltip } from '@mantine/core';
import { IconPlayerPlay, IconPlayerPlayFilled, IconArrowUp, IconArrowDown, IconArrowsVertical, IconChevronDown } from '@tabler/icons-react';
import type { RunScope } from '../AnalysisPage';

type Props = {
  onRunScope: (scope: RunScope) => void;
  isRunning?: boolean;
};

export function RunMenu({ onRunScope, isRunning }: Props) {
  return (
    <Group gap={0} wrap="nowrap">
      <Tooltip label="Run this + unrun upstream (⌘Enter)">
        <ActionIcon
          size="xs"
          variant="light"
          color="green"
          loading={isRunning}
          style={{ borderRadius: '4px 0 0 4px' }}
          onClick={(e: React.MouseEvent) => { e.stopPropagation(); onRunScope('smart'); }}
        >
          <IconPlayerPlay size={10} />
        </ActionIcon>
      </Tooltip>
      <Menu shadow="md" width={200} position="bottom-end">
        <Menu.Target>
          <ActionIcon
            size="xs"
            variant="light"
            color="green"
            style={{ borderRadius: '0 4px 4px 0', borderLeft: '1px solid rgba(47, 158, 68, 0.3)' }}
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <IconChevronDown size={10} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item leftSection={<IconPlayerPlayFilled size={14} />} onClick={() => onRunScope('this')}>
            Run this node only
          </Menu.Item>
          <Menu.Item leftSection={<IconPlayerPlay size={14} />} onClick={() => onRunScope('smart')}>
            Run this + unrun upstream
          </Menu.Item>
          <Menu.Item leftSection={<IconArrowUp size={14} />} onClick={() => onRunScope('upstream')}>
            Run all upstream
          </Menu.Item>
          <Menu.Item leftSection={<IconArrowDown size={14} />} onClick={() => onRunScope('downstream')}>
            Run downstream
          </Menu.Item>
          <Menu.Item leftSection={<IconArrowsVertical size={14} />} onClick={() => onRunScope('connected')}>
            Run connected chain
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
