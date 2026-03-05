import { ActionIcon, Stack, Tooltip } from '@mantine/core';
import { IconPlus, IconTable, IconNotebook } from '@tabler/icons-react';
import '../../styles/icon-strip.css';

export type AnalysisFlyout = 'nodes' | 'data' | 'notebook' | null;

type Props = {
  activeFlyout: AnalysisFlyout;
  onToggle: (panel: NonNullable<AnalysisFlyout>) => void;
};

const ICONS: Array<{ panel: NonNullable<AnalysisFlyout>; icon: typeof IconPlus; label: string }> = [
  { panel: 'nodes', icon: IconPlus, label: 'Nodes' },
  { panel: 'data', icon: IconTable, label: 'Data' },
  { panel: 'notebook', icon: IconNotebook, label: 'Import Notebook' },
];

export function AnalysisIconStrip({ activeFlyout, onToggle }: Props) {
  return (
    <div className="icon-strip">
      <Stack gap={2} align="center" py={8}>
        {ICONS.map(({ panel, icon: Icon, label }) => (
          <Tooltip key={panel} label={label} position="right" withArrow>
            <ActionIcon
              size="lg"
              variant="subtle"
              className={`icon-strip-btn ${activeFlyout === panel ? 'icon-strip-btn-active' : ''}`}
              onClick={() => onToggle(panel)}
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
