import { ActionIcon, ScrollArea, Text } from '@mantine/core';
import { IconX } from '@tabler/icons-react';
import type { AnalysisFlyout } from './AnalysisIconStrip';
import type { AnalysisComponent, AnalysisNodeType } from '../../types/model';
import { AnalysisNodesPalette } from './flyouts/AnalysisNodesPalette';
import { AnalysisDataFlyout } from './flyouts/AnalysisDataFlyout';
import '../../styles/flyout-panel.css';

const PANEL_TITLES: Record<NonNullable<AnalysisFlyout>, string> = {
  nodes: 'Add Node',
  data: 'Data Tables',
};

type Props = {
  activeFlyout: AnalysisFlyout;
  onClose: () => void;
  components: AnalysisComponent[];
  onAddNode: (type: AnalysisNodeType, code?: string, outputMode?: string) => void;
  onSelectTable: (tableId: string, tableName: string) => void;
};

export function AnalysisFlyoutPanel({ activeFlyout, onClose, components, onAddNode, onSelectTable }: Props) {
  if (!activeFlyout) return null;

  return (
    <div className="flyout-panel">
      <div className="flyout-panel-header">
        <Text size="sm" fw={600}>{PANEL_TITLES[activeFlyout]}</Text>
        <ActionIcon size="sm" variant="subtle" color="gray" onClick={onClose}>
          <IconX size={14} />
        </ActionIcon>
      </div>
      <ScrollArea className="flyout-panel-scroll">
        <div className="flyout-panel-body">
          {activeFlyout === 'nodes' && <AnalysisNodesPalette components={components} onAddNode={onAddNode} />}
          {activeFlyout === 'data' && <AnalysisDataFlyout onSelectTable={onSelectTable} />}
        </div>
      </ScrollArea>
    </div>
  );
}
