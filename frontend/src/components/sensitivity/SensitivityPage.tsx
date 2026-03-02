import { useMemo } from 'react';
import { Alert, Box, Button, Group, Title } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import { SensitivityListPanel } from './SensitivityListPanel';
import { SensitivityEditorPanel } from './SensitivityEditorPanel';
import { SensitivityResultsPanel } from './SensitivityResultsPanel';

export function SensitivityPage() {
  const model = useEditorStore((s) => s.model);
  const sensitivityConfigs = useEditorStore((s) => s.sensitivityConfigs);
  const activeSensitivityConfigId = useEditorStore((s) => s.activeSensitivityConfigId);
  const setActiveSensitivityConfig = useEditorStore((s) => s.setActiveSensitivityConfig);
  const createSensitivityConfig = useEditorStore((s) => s.createSensitivityConfig);
  const duplicateSensitivityConfig = useEditorStore((s) => s.duplicateSensitivityConfig);
  const updateSensitivityConfig = useEditorStore((s) => s.updateSensitivityConfig);
  const deleteSensitivityConfig = useEditorStore((s) => s.deleteSensitivityConfig);
  const runActiveSensitivity = useEditorStore((s) => s.runActiveSensitivity);
  const isRunningSensitivity = useEditorStore((s) => s.isRunningSensitivity);
  const oatResults = useEditorStore((s) => s.oatResults);
  const monteCarloResults = useEditorStore((s) => s.monteCarloResults);

  const activeConfig = useMemo(
    () => sensitivityConfigs.find((c) => c.id === activeSensitivityConfigId) ?? sensitivityConfigs[0],
    [sensitivityConfigs, activeSensitivityConfigId],
  );

  const handleUpdate = useMemo(
    () => (patch: Parameters<typeof updateSensitivityConfig>[1]) => {
      if (activeConfig) updateSensitivityConfig(activeConfig.id, patch);
    },
    [activeConfig, updateSensitivityConfig],
  );

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Sticky header */}
      <Group
        justify="space-between"
        px="md"
        py="xs"
        style={{
          borderBottom: '1px solid var(--mantine-color-gray-3)',
          flexShrink: 0,
        }}
      >
        <Title order={4}>Sensitivity Analysis</Title>
        <Button
          leftSection={<IconPlayerPlay size={16} />}
          onClick={() => void runActiveSensitivity()}
          loading={isRunningSensitivity}
          disabled={!activeConfig || activeConfig.parameters.length === 0}
        >
          Run Analysis
        </Button>
      </Group>

      {/* 3-panel body */}
      <Box style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left sidebar */}
        <Box
          style={{
            width: 260,
            flexShrink: 0,
            borderRight: '1px solid var(--mantine-color-gray-3)',
            overflow: 'auto',
          }}
        >
          <SensitivityListPanel
            configs={sensitivityConfigs}
            activeConfigId={activeSensitivityConfigId}
            onSelect={setActiveSensitivityConfig}
            onCreate={createSensitivityConfig}
            onDuplicate={duplicateSensitivityConfig}
            onDelete={deleteSensitivityConfig}
          />
        </Box>

        {/* Center editor */}
        <Box
          style={{
            flex: 1,
            minWidth: 0,
            overflow: 'auto',
            padding: 16,
          }}
        >
          {activeConfig ? (
            <SensitivityEditorPanel
              config={activeConfig}
              model={model}
              onUpdate={handleUpdate}
            />
          ) : (
            <Alert color="blue" variant="light">
              Create an analysis configuration to get started.
            </Alert>
          )}
        </Box>

        {/* Right results */}
        <Box
          style={{
            width: 420,
            flexShrink: 0,
            borderLeft: '1px solid var(--mantine-color-gray-3)',
            overflow: 'auto',
          }}
        >
          <SensitivityResultsPanel
            config={activeConfig}
            oatResults={oatResults}
            monteCarloResults={monteCarloResults}
            isRunning={isRunningSensitivity}
          />
        </Box>
      </Box>
    </Box>
  );
}
