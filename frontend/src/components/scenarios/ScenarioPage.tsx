import { useMemo } from 'react';
import { Alert, Box, Button, Group, Title } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import { ScenarioListPanel } from './ScenarioListPanel';
import { ScenarioEditorPanel } from './ScenarioEditorPanel';
import { ScenarioResultsPanel } from './ScenarioResultsPanel';

export function ScenarioPage() {
  const model = useEditorStore((s) => s.model);
  const scenarios = useEditorStore((s) => s.scenarios);
  const activeScenarioId = useEditorStore((s) => s.activeScenarioId);
  const setActiveScenario = useEditorStore((s) => s.setActiveScenario);
  const createScenario = useEditorStore((s) => s.createScenario);
  const duplicateScenario = useEditorStore((s) => s.duplicateScenario);
  const updateScenario = useEditorStore((s) => s.updateScenario);
  const deleteScenario = useEditorStore((s) => s.deleteScenario);
  const runScenarioBatch = useEditorStore((s) => s.runScenarioBatch);
  const isRunningBatch = useEditorStore((s) => s.isRunningBatch);
  const compareResults = useEditorStore((s) => s.compareResults);

  const activeScenario = useMemo(
    () => scenarios.find((s) => s.id === activeScenarioId) ?? scenarios[0],
    [scenarios, activeScenarioId],
  );

  const handleUpdate = useMemo(
    () => (patch: Parameters<typeof updateScenario>[1]) => {
      if (activeScenario) updateScenario(activeScenario.id, patch);
    },
    [activeScenario, updateScenario],
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
        <Title order={4}>Scenario Builder</Title>
        <Button
          leftSection={<IconPlayerPlay size={16} />}
          onClick={() => void runScenarioBatch()}
          loading={isRunningBatch}
        >
          Run Scenarios
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
          <ScenarioListPanel
            scenarios={scenarios}
            activeScenarioId={activeScenarioId}
            onSelect={setActiveScenario}
            onCreate={createScenario}
            onDuplicate={duplicateScenario}
            onDelete={deleteScenario}
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
          {activeScenario ? (
            <ScenarioEditorPanel
              scenario={activeScenario}
              model={model}
              onUpdate={handleUpdate}
            />
          ) : (
            <Alert color="blue" variant="light">
              Create a scenario to get started.
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
          <ScenarioResultsPanel
            compareResults={compareResults}
            scenarios={scenarios}
            isRunningBatch={isRunningBatch}
          />
        </Box>
      </Box>
    </Box>
  );
}
