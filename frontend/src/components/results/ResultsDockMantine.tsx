import { useEffect, useRef } from 'react';
import { Tabs, Stack, Group, NumberInput, Button, MultiSelect, Alert, Paper, Text, Badge, Code, ScrollArea, Box } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconPlayerPlay, IconCheck, IconChevronUp, IconChevronDown, IconFileDownload, IconInfoCircle } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import { useUIStore } from '../../state/uiStore';
import { ResultsChart } from './ResultsChart';
import { ResultsTable } from './ResultsTable';
import { ValidationList } from '../validation/ValidationList';
import { buildMfaYamlDocument, mfaYamlString } from '../../lib/mfaExport';

export function ResultsDock() {
  const bottomTrayExpanded = useUIStore((s) => s.bottomTrayExpanded);
  const toggleBottomTray = useUIStore((s) => s.toggleBottomTray);
  const bottomTrayHeight = useUIStore((s) => s.bottomTrayHeight);
  const setBottomTrayHeight = useUIStore((s) => s.setBottomTrayHeight);
  const selectedMfaTimestamp = useUIStore((s) => s.selectedMfaTimestamp);
  const activeDockTab = useEditorStore((s) => s.activeDockTab);
  const setActiveDockTab = useEditorStore((s) => s.setActiveDockTab);
  const model = useEditorStore((s) => s.model);
  const simConfig = useEditorStore((s) => s.simConfig);
  const setSimConfig = useEditorStore((s) => s.setSimConfig);
  const activeSimulationMode = useEditorStore((s) => s.activeSimulationMode);
  const importedVensim = useEditorStore((s) => s.importedVensim);
  const vensimSelectedOutputs = useEditorStore((s) => s.vensimSelectedOutputs);
  const setVensimSelectedOutputs = useEditorStore((s) => s.setVensimSelectedOutputs);
  const runValidate = useEditorStore((s) => s.runValidate);
  const runSimulate = useEditorStore((s) => s.runSimulate);
  const isValidating = useEditorStore((s) => s.isValidating);
  const isSimulating = useEditorStore((s) => s.isSimulating);
  const validation = useEditorStore((s) => s.validation);
  const localIssues = useEditorStore((s) => s.localIssues);
  const results = useEditorStore((s) => s.results);
  const apiError = useEditorStore((s) => s.apiError);

  const hasErrors =
    activeSimulationMode === 'vensim'
      ? false
      : localIssues.some((i) => i.severity === 'error') || validation.errors.length > 0;
  const resizing = useRef(false);

  const hasFlowNodes = model.nodes.some((n) => n.type === 'flow');

  const onExportMfaYaml = () => {
    if (!results) {
      notifications.show({
        title: 'No Simulation Results',
        message: 'Run a simulation first to export an MFA time slice.',
        color: 'yellow',
        icon: <IconInfoCircle size={18} />,
      });
      return;
    }

    console.log('Exporting MFA - Model:', model.name);
    console.log('Has flow nodes:', hasFlowNodes);
    console.log('All nodes:', model.nodes.map(n => ({ id: n.id, type: n.type })));
    console.log('All edges:', model.edges);
    console.log('Flow nodes details:', model.nodes.filter(n => n.type === 'flow'));

    const doc = buildMfaYamlDocument(model, results, selectedMfaTimestamp ?? undefined);

    console.log('Generated MFA doc:', doc);
    console.log('MFA links:', doc.links);
    console.log('MFA nodes:', doc.nodes);

    if (doc.links.length === 0) {
      notifications.show({
        title: 'No Flow Connections Found',
        message: 'MFA export requires Flow nodes connected to Stock nodes. Try the "Bathtub Inventory" model or add flows to your model.',
        color: 'orange',
        icon: <IconInfoCircle size={18} />,
        autoClose: 5000,
      });
      return;
    }
    const yaml = mfaYamlString(doc);
    const blob = new Blob([yaml], { type: 'application/x-yaml' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${model.id || 'model'}-mfa.yaml`;
    a.click();
    URL.revokeObjectURL(url);
    notifications.show({
      title: 'MFA Export Successful',
      message: `Exported ${doc.links.length} flow connection(s) at t=${selectedMfaTimestamp ?? 'latest'}`,
      color: 'green',
      icon: <IconCheck size={18} />,
    });
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!resizing.current) return;
      const nextHeight = window.innerHeight - e.clientY;
      setBottomTrayHeight(nextHeight);
    };
    const onUp = () => {
      resizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [setBottomTrayHeight]);

  return (
    <Stack gap={0} h="100%" style={{ overflow: 'hidden', background: 'transparent' }}>
      {bottomTrayExpanded && (
        <Box
          onMouseDown={() => {
            resizing.current = true;
            document.body.style.cursor = 'ns-resize';
            document.body.style.userSelect = 'none';
          }}
          title={`Drag to resize tray (current: ${bottomTrayHeight}px)`}
          style={{
            height: 16,
            marginTop: 0,
            marginBottom: 4,
            cursor: 'ns-resize',
            display: 'grid',
            placeItems: 'center',
            background: 'transparent',
          }}
        >
          <Box
            style={{
              width: 40,
              height: 4,
              borderRadius: 999,
              background: '#c5c9d4',
              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
            }}
          />
        </Box>
      )}
      <Group justify="space-between" align="center" style={{ padding: '8px 8px', background: 'transparent', position: 'relative' }}>
        <Text fw={700} size="sm">Validation & Simulation</Text>
        <Group gap="xs">
          {!bottomTrayExpanded && (
            <Box
              style={{
                width: 40,
                height: 4,
                borderRadius: 999,
                background: '#c5c9d4',
                boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
              }}
            />
          )}
          <Button
            variant="subtle"
            size="xs"
            leftSection={bottomTrayExpanded ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />}
            onClick={toggleBottomTray}
          >
            {bottomTrayExpanded ? 'Fold tray' : 'Open tray'}
          </Button>
        </Group>
      </Group>

      {!bottomTrayExpanded ? null : (
        <Box style={{ overflowY: 'auto', minHeight: 0, paddingBottom: 4 }}>
      <Group justify="flex-end" align="flex-end" wrap="nowrap">
        <NumberInput
          label="Start"
          value={simConfig.start}
          onChange={(val) => setSimConfig({ start: Number(val) })}
          size="xs"
          style={{ width: 88, flex: '0 0 auto' }}
        />
        <NumberInput
          label="Stop"
          value={simConfig.stop}
          onChange={(val) => setSimConfig({ stop: Number(val) })}
          size="xs"
          style={{ width: 88, flex: '0 0 auto' }}
        />
        <NumberInput
          label="dt"
          value={simConfig.dt}
          onChange={(val) => setSimConfig({ dt: Number(val) })}
          step={0.1}
          size="xs"
          style={{ width: 88, flex: '0 0 auto' }}
        />
        <Button
          leftSection={<IconCheck size={16} />}
          onClick={() => void runValidate()}
          disabled={isValidating || activeSimulationMode === 'vensim'}
          variant="light"
          size="sm"
          style={{ flex: '0 0 auto' }}
        >
          {isValidating ? 'Validating…' : 'Validate'}
        </Button>
        <Button
          leftSection={<IconPlayerPlay size={16} />}
          onClick={() => void runSimulate()}
          disabled={isSimulating || hasErrors}
          variant="filled"
          color="violet"
          size="sm"
          style={{ flex: '0 0 auto' }}
        >
          {isSimulating ? 'Running…' : 'Run Simulation'}
        </Button>
      </Group>

      {activeSimulationMode === 'vensim' && importedVensim && (
        <MultiSelect
          label="Outputs"
          placeholder="Select outputs"
          data={importedVensim.model_view.variables.map((v) => ({ value: v.name, label: v.name }))}
          value={vensimSelectedOutputs}
          onChange={setVensimSelectedOutputs}
          searchable
          size="xs"
        />
      )}

      {apiError && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="filled">
          {apiError}
        </Alert>
      )}

      {activeSimulationMode === 'vensim' && importedVensim && (
        <Paper p="sm" withBorder>
          <Text size="sm" fw={600} mb="xs">Detected Functions</Text>
          <ScrollArea h={150}>
            <Stack gap="xs">
              {importedVensim.model_view.variables
                .filter((v) => /\b(step|ramp|pulse|delay\d*|smooth\d*)\b/i.test(v.equation ?? ''))
                .slice(0, 12)
                .map((v) => (
                  <Paper key={v.name} p="xs" withBorder>
                    <Group gap="xs">
                      <Badge size="sm" color="violet">{v.name}</Badge>
                      <Code style={{ fontSize: '0.7rem' }}>{v.equation}</Code>
                    </Group>
                  </Paper>
                ))}
            </Stack>
          </ScrollArea>
        </Paper>
      )}

      <Tabs value={activeDockTab} onChange={(value) => setActiveDockTab(value as typeof activeDockTab)}>
        <Tabs.List>
          <Tabs.Tab value="validation">Validation</Tabs.Tab>
          <Tabs.Tab value="chart">Chart</Tabs.Tab>
          <Tabs.Tab value="table">Table</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="validation" pt="md">
          <ValidationList />
        </Tabs.Panel>

        <Tabs.Panel value="chart" pt="md">
          <Stack gap="md">
            <ResultsChart results={results} />
            {selectedMfaTimestamp !== null && results && hasFlowNodes && (
              <Group justify="flex-end">
                <Button
                  leftSection={<IconFileDownload size={16} />}
                  onClick={onExportMfaYaml}
                  variant="light"
                  color="violet"
                  size="sm"
                >
                  Export MFA YAML (t={selectedMfaTimestamp})
                </Button>
              </Group>
            )}
            {selectedMfaTimestamp !== null && results && !hasFlowNodes && (
              <Paper p="xs" withBorder style={{ borderColor: '#e0e0e0', backgroundColor: '#fafafa' }}>
                <Text size="xs" c="dimmed" ta="center">
                  MFA export requires Flow nodes. Try the "Bathtub Inventory" model.
                </Text>
              </Paper>
            )}
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="table" pt="md">
          <ResultsTable results={results} />
        </Tabs.Panel>
      </Tabs>
        </Box>
      )}
    </Stack>
  );
}
