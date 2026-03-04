import { useMemo } from 'react';
import { Box, Button, Group, Title } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import { OptimisationListPanel } from './OptimisationListPanel';
import { OptimisationEditorPanel } from './OptimisationEditorPanel';
import { OptimisationResultsPanel } from './OptimisationResultsPanel';
import type { OptimisationConfig } from '../../types/model';

export function OptimisationPage() {
  const model = useEditorStore((s) => s.model);
  const optimisationConfigs = useEditorStore((s) => s.optimisationConfigs);
  const activeOptimisationConfigId = useEditorStore((s) => s.activeOptimisationConfigId);
  const optimisationResults = useEditorStore((s) => s.optimisationResults);
  const isRunningOptimisation = useEditorStore((s) => s.isRunningOptimisation);
  const optimisationProgress = useEditorStore((s) => s.optimisationProgress);
  const apiError = useEditorStore((s) => s.apiError);

  const setActiveOptimisationConfig = useEditorStore((s) => s.setActiveOptimisationConfig);
  const createOptimisationConfig = useEditorStore((s) => s.createOptimisationConfig);
  const duplicateOptimisationConfig = useEditorStore((s) => s.duplicateOptimisationConfig);
  const updateOptimisationConfig = useEditorStore((s) => s.updateOptimisationConfig);
  const deleteOptimisationConfig = useEditorStore((s) => s.deleteOptimisationConfig);
  const runActiveOptimisation = useEditorStore((s) => s.runActiveOptimisation);

  const activeConfig = useMemo(
    () => optimisationConfigs.find((c) => c.id === activeOptimisationConfigId),
    [optimisationConfigs, activeOptimisationConfigId],
  );

  const handleUpdate = useMemo(
    () => (patch: Partial<OptimisationConfig>) => {
      if (activeOptimisationConfigId) {
        updateOptimisationConfig(activeOptimisationConfigId, patch);
      }
    },
    [activeOptimisationConfigId, updateOptimisationConfig],
  );

  const canRun =
    !!activeConfig &&
    (activeConfig.mode === 'policy' || activeConfig.parameters.length > 0);

  return (
    <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <Group
        justify="space-between"
        px="md"
        py="xs"
        style={{
          borderBottom: '1px solid var(--mantine-color-gray-3)',
          flexShrink: 0,
        }}
      >
        <Title order={4} size="1rem">
          Optimisation
        </Title>
        <Button
          size="xs"
          leftSection={<IconPlayerPlay size={14} />}
          loading={isRunningOptimisation}
          disabled={!canRun}
          onClick={runActiveOptimisation}
        >
          {isRunningOptimisation
            ? optimisationProgress
              ? `${optimisationProgress.current}/${optimisationProgress.total}`
              : 'Running...'
            : 'Run'}
        </Button>
      </Group>

      {/* 3-panel body */}
      <Box style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Left: config list */}
        <Box style={{ width: 260, flexShrink: 0, borderRight: '1px solid var(--mantine-color-gray-3)', overflow: 'auto' }}>
          <OptimisationListPanel
            configs={optimisationConfigs}
            activeConfigId={activeOptimisationConfigId}
            onSelect={setActiveOptimisationConfig}
            onCreate={createOptimisationConfig}
            onDuplicate={duplicateOptimisationConfig}
            onDelete={deleteOptimisationConfig}
          />
        </Box>

        {/* Center: editor */}
        <Box style={{ flex: 1, minWidth: 0, overflow: 'auto' }}>
          {activeConfig ? (
            <Box p="md">
              <OptimisationEditorPanel
                config={activeConfig}
                model={model}
                onUpdate={handleUpdate}
              />
            </Box>
          ) : (
            <Box
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#adb5bd',
              }}
            >
              Create a config to get started
            </Box>
          )}
        </Box>

        {/* Right: results */}
        <Box style={{ width: 420, flexShrink: 0, borderLeft: '1px solid var(--mantine-color-gray-3)', overflow: 'auto' }}>
          <OptimisationResultsPanel
            config={activeConfig}
            results={optimisationResults}
            isRunning={isRunningOptimisation}
            progress={optimisationProgress}
            apiError={apiError}
          />
        </Box>
      </Box>
    </Box>
  );
}
