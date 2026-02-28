import { useEffect, useMemo, useRef } from 'react';
import { Tabs, Stack, Group, NumberInput, Button, MultiSelect, Alert, Paper, Text, Badge, Code, ScrollArea, Box, Select, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconPlayerPlay, IconCheck, IconChevronUp, IconChevronDown, IconFileDownload, IconInfoCircle } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import { useUIStore } from '../../state/uiStore';
import { ResultsChart } from './ResultsChart';
import { ResultsTable } from './ResultsTable';
import { ValidationList } from '../validation/ValidationList';
import { buildMfaYamlDocument, mfaYamlString, type MfaMissingValueRule, type MfaTimeUnit } from '../../lib/mfaExport';
import { SensitivityPanel } from './SensitivityPanelMantine';
import { VensimDiagnosticsPanel } from './VensimDiagnosticsPanelMantine';

export function ResultsDock() {
  const bottomTrayExpanded = useUIStore((s) => s.bottomTrayExpanded);
  const toggleBottomTray = useUIStore((s) => s.toggleBottomTray);
  const bottomTrayHeight = useUIStore((s) => s.bottomTrayHeight);
  const setBottomTrayHeight = useUIStore((s) => s.setBottomTrayHeight);
  const selectedMfaTimestamp = useUIStore((s) => s.selectedMfaTimestamp);
  const mfaTimeAnchorDate = useUIStore((s) => s.mfaTimeAnchorDate);
  const setMfaTimeAnchorDate = useUIStore((s) => s.setMfaTimeAnchorDate);
  const mfaTimeUnit = useUIStore((s) => s.mfaTimeUnit);
  const setMfaTimeUnit = useUIStore((s) => s.setMfaTimeUnit);
  const mfaMissingValueRule = useUIStore((s) => s.mfaMissingValueRule);
  const setMfaMissingValueRule = useUIStore((s) => s.setMfaMissingValueRule);
  const activeDockTab = useEditorStore((s) => s.activeDockTab);
  const setActiveDockTab = useEditorStore((s) => s.setActiveDockTab);
  const model = useEditorStore((s) => s.model);
  const simConfig = useEditorStore((s) => s.simConfig);
  const setSimConfig = useEditorStore((s) => s.setSimConfig);
  const activeSimulationMode = useEditorStore((s) => s.activeSimulationMode);
  const importedVensim = useEditorStore((s) => s.importedVensim);
  const vensimSelectedOutputs = useEditorStore((s) => s.vensimSelectedOutputs);
  const setVensimSelectedOutputs = useEditorStore((s) => s.setVensimSelectedOutputs);
  const vensimParamOverrides = useEditorStore((s) => s.vensimParamOverrides);
  const setVensimParamOverride = useEditorStore((s) => s.setVensimParamOverride);
  const runValidate = useEditorStore((s) => s.runValidate);
  const runSimulate = useEditorStore((s) => s.runSimulate);
  const runScenarioBatch = useEditorStore((s) => s.runScenarioBatch);
  const isValidating = useEditorStore((s) => s.isValidating);
  const isSimulating = useEditorStore((s) => s.isSimulating);
  const isRunningBatch = useEditorStore((s) => s.isRunningBatch);
  const validation = useEditorStore((s) => s.validation);
  const localIssues = useEditorStore((s) => s.localIssues);
  const results = useEditorStore((s) => s.results);
  const compareResults = useEditorStore((s) => s.compareResults);
  const apiError = useEditorStore((s) => s.apiError);

  const hasErrors =
    activeSimulationMode === 'vensim'
      ? false
      : localIssues.some((i) => i.severity === 'error') || validation.errors.length > 0;
  const resizing = useRef(false);

  const hasFlowNodes = model.nodes.some((n) => n.type === 'flow');
  const importedTime = importedVensim?.model_view.time_settings;

  const scalarDialCandidates = useMemo(
    () =>
      activeSimulationMode === 'vensim' && importedVensim
        ? importedVensim.model_view.variables
            .filter((v) => /^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test((v.equation ?? '').trim()))
            .slice(0, 30)
        : [],
    [activeSimulationMode, importedVensim],
  );

  const policyDialCandidates = useMemo(
    () =>
      activeSimulationMode === 'vensim' && importedVensim
        ? importedVensim.model_view.variables
            .filter((v) => /\b(GAME|SWITCH TIME)\b/i.test(v.equation ?? '') || /\bSWITCH TIME\b/i.test(v.name))
            .slice(0, 24)
        : [],
    [activeSimulationMode, importedVensim],
  );

  const onExportMfaYaml = (mode: 'full_series' | 'time_slice') => {
    if (!results) {
      notifications.show({
        title: 'No Simulation Results',
        message: 'Run a simulation first to export MFA YAML.',
        color: 'yellow',
        icon: <IconInfoCircle size={18} />,
      });
      return;
    }

    const doc = buildMfaYamlDocument(model, results, {
      requestedTime: selectedMfaTimestamp ?? undefined,
      anchorDate: mfaTimeAnchorDate,
      timeUnit: mfaTimeUnit,
      missingValueRule: mfaMissingValueRule,
      mode,
    });

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
    a.download = `${model.id || 'model'}-mfa-${mode === 'full_series' ? 'series' : 'slice'}.yaml`;
    a.click();
    URL.revokeObjectURL(url);
    notifications.show({
      title: 'MFA Export Successful',
      message:
        mode === 'full_series'
          ? `Exported ${doc.links.length} flow connection(s) as time-series YAML.`
          : `Exported ${doc.links.length} flow connection(s) at selected time as YAML.`,
      color: 'green',
      icon: <IconCheck size={18} />,
    });
  };

  const mfaTimeUnitOptions: Array<{ value: MfaTimeUnit; label: string }> = [
    { value: 'hour', label: 'Hour' },
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'quarter', label: 'Quarter' },
    { value: 'year', label: 'Year' },
  ];

  const mfaRuleOptions: Array<{ value: MfaMissingValueRule; label: string }> = [
    { value: 'carry_forward', label: 'carry_forward' },
    { value: 'fallback_scalar', label: 'fallback_scalar' },
    { value: 'exact', label: 'exact' },
  ];

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
      <Group
        justify="flex-start"
        align="flex-end"
        wrap="nowrap"
        style={{
          padding: bottomTrayExpanded ? '8px 8px' : '4px 8px',
          background: 'transparent',
          position: 'relative',
        }}
      >
        <NumberInput
          label={activeSimulationMode === 'vensim' ? 'INITIAL TIME' : 'Start'}
          value={simConfig.start}
          onChange={(val) => setSimConfig({ start: Number(val) })}
          size="xs"
          style={{ width: 100, flex: '0 0 auto' }}
        />
        <NumberInput
          label={activeSimulationMode === 'vensim' ? 'FINAL TIME' : 'Stop'}
          value={simConfig.stop}
          onChange={(val) => setSimConfig({ stop: Number(val) })}
          size="xs"
          style={{ width: 100, flex: '0 0 auto' }}
        />
        <NumberInput
          label={activeSimulationMode === 'vensim' ? 'TIME STEP' : 'dt'}
          value={simConfig.dt}
          onChange={(val) => setSimConfig({ dt: Number(val) })}
          step={0.1}
          size="xs"
          style={{ width: 100, flex: '0 0 auto' }}
        />
        {activeSimulationMode === 'vensim' ? (
          <NumberInput
            label="SAVEPER"
            value={simConfig.return_step ?? ''}
            onChange={(val) => setSimConfig({ return_step: val === '' ? undefined : Number(val) })}
            step={0.1}
            size="xs"
            style={{ width: 100, flex: '0 0 auto' }}
          />
        ) : null}
        {activeSimulationMode === 'vensim' && importedTime ? (
          <Button
            variant="subtle"
            size="xs"
            onClick={() =>
              setSimConfig({
                start: importedTime.initial_time ?? simConfig.start,
                stop: importedTime.final_time ?? simConfig.stop,
                dt: importedTime.time_step ?? simConfig.dt,
                return_step: importedTime.saveper ?? importedTime.time_step ?? simConfig.return_step,
              })
            }
            style={{ flex: '0 0 auto' }}
          >
            Reset MDL Settings
          </Button>
        ) : null}
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
          onClick={() => void runScenarioBatch()}
          disabled={isRunningBatch}
          variant="light"
          color="teal"
          size="sm"
          style={{ flex: '0 0 auto' }}
        >
          {isRunningBatch ? 'Comparing…' : 'Run Scenarios'}
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
        <Button
          variant="subtle"
          size="xs"
          leftSection={bottomTrayExpanded ? <IconChevronDown size={14} /> : <IconChevronUp size={14} />}
          onClick={toggleBottomTray}
          style={{ flex: '0 0 auto' }}
        >
          {bottomTrayExpanded ? 'Fold tray' : 'Open tray'}
        </Button>
      </Group>

      {!bottomTrayExpanded ? null : (
        <Box style={{ overflowY: 'auto', minHeight: 0, paddingBottom: 4 }}>
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

      {activeSimulationMode === 'vensim' && results?.metadata.execution_mode === 'mixed' ? (
        <Alert icon={<IconAlertCircle size={16} />} color="yellow" variant="light">
          Mixed execution mode: fallback kernels active ({(results.metadata.fallback_activations ?? []).join(', ') || 'unknown'}).
        </Alert>
      ) : null}

      {activeSimulationMode === 'vensim' && importedVensim && (
        <Stack gap="sm">
          <VensimDiagnosticsPanel
            imported={importedVensim}
            executionMode={results?.metadata.execution_mode}
            fallbackActivations={results?.metadata.fallback_activations}
          />
          <Paper p="sm" withBorder>
            <Text size="sm" fw={600} mb="xs">Detected Functions</Text>
            <ScrollArea h={150}>
              <Stack gap="xs">
                {importedVensim.model_view.variables
                  .filter((v) => /\b(step|ramp|pulse|delay\d*|smooth\d*|random|get time value|lookup)\b/i.test(v.equation ?? ''))
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
          <Paper p="sm" withBorder>
            <Text size="sm" fw={600} mb="xs">Curated Dials</Text>
            <Stack gap="xs">
              <Text size="xs" c="dimmed">Policy knobs (`GAME`, `SWITCH TIME`) and scalar constants can be overridden for simulation runs.</Text>
              {policyDialCandidates.length > 0 ? (
                <Stack gap={6}>
                  <Text size="xs" fw={600}>Policy knobs</Text>
                  {policyDialCandidates.map((v) => (
                    <Group key={`policy-${v.name}`} wrap="nowrap">
                      <Badge size="xs" color="yellow" variant="light">Policy</Badge>
                      <Text size="xs" style={{ minWidth: 180 }} lineClamp={1}>
                        {v.name}
                      </Text>
                      <NumberInput
                        size="xs"
                        step={1}
                        placeholder="override"
                        value={typeof vensimParamOverrides[v.name] === 'number' ? Number(vensimParamOverrides[v.name]) : ''}
                        onChange={(value) => setVensimParamOverride(v.name, value === '' ? undefined : Number(value))}
                        style={{ maxWidth: 120 }}
                        rightSection={<IconAlertCircle size={12} />}
                        rightSectionPointerEvents="none"
                      />
                    </Group>
                  ))}
                </Stack>
              ) : null}
              {scalarDialCandidates.length > 0 ? (
                <Stack gap={6}>
                  <Text size="xs" fw={600}>Scalar constants</Text>
                  <ScrollArea h={180}>
                    <Stack gap={6}>
                      {scalarDialCandidates.map((v) => (
                        <Group key={`scalar-${v.name}`} wrap="nowrap">
                          <Text size="xs" style={{ minWidth: 180 }} lineClamp={1}>
                            {v.name}
                          </Text>
                          <NumberInput
                            size="xs"
                            step={0.1}
                            placeholder={v.equation}
                            value={typeof vensimParamOverrides[v.name] === 'number' ? Number(vensimParamOverrides[v.name]) : ''}
                            onChange={(value) => setVensimParamOverride(v.name, value === '' ? undefined : Number(value))}
                            style={{ maxWidth: 140 }}
                          />
                        </Group>
                      ))}
                    </Stack>
                  </ScrollArea>
                </Stack>
              ) : (
                <Text size="xs" c="dimmed">No curated dials detected in imported variables.</Text>
              )}
            </Stack>
          </Paper>
        </Stack>
      )}

      <Tabs value={activeDockTab} onChange={(value) => setActiveDockTab(value as typeof activeDockTab)}>
        <Tabs.List>
          <Tabs.Tab value="validation">Validation</Tabs.Tab>
          <Tabs.Tab value="chart">Chart</Tabs.Tab>
          <Tabs.Tab value="table">Table</Tabs.Tab>
          <Tabs.Tab value="compare">Compare</Tabs.Tab>
          <Tabs.Tab value="sensitivity">Sensitivity</Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="validation" pt="md">
          <ValidationList />
        </Tabs.Panel>

        <Tabs.Panel value="chart" pt="md">
          <Stack gap="md">
            <ResultsChart results={results} />
            {results && hasFlowNodes && (
              <Stack gap="xs">
                <Group align="end" gap="xs" wrap="wrap">
                  <TextInput
                    label="Anchor date"
                    type="date"
                    placeholder="YYYY-MM-DD"
                    value={mfaTimeAnchorDate}
                    onChange={(event) => setMfaTimeAnchorDate(event.currentTarget.value)}
                    size="xs"
                    style={{ minWidth: 170 }}
                  />
                  <Select
                    label="Time unit"
                    size="xs"
                    data={mfaTimeUnitOptions}
                    value={mfaTimeUnit}
                    onChange={(value) => value && setMfaTimeUnit(value as MfaTimeUnit)}
                    style={{ minWidth: 130 }}
                  />
                  <Select
                    label="Missing value rule"
                    size="xs"
                    data={mfaRuleOptions}
                    value={mfaMissingValueRule}
                    onChange={(value) => value && setMfaMissingValueRule(value as MfaMissingValueRule)}
                    style={{ minWidth: 190 }}
                  />
                </Group>
                <Group justify="space-between" wrap="wrap">
                  <Text size="xs" c="dimmed">
                    Exports full time-series YAML. Selected chart time is included as metadata when set.
                  </Text>
                </Group>
                <Group justify="flex-end">
                <Button
                  leftSection={<IconFileDownload size={16} />}
                  onClick={() => onExportMfaYaml('full_series')}
                  variant="light"
                  color="violet"
                  size="sm"
                >
                  Export MFA YAML (Time Series)
                </Button>
                <Button
                  leftSection={<IconFileDownload size={16} />}
                  onClick={() => onExportMfaYaml('time_slice')}
                  variant="light"
                  color="blue"
                  size="sm"
                  disabled={selectedMfaTimestamp === null}
                >
                  Export MFA YAML (Selected Time Slice)
                </Button>
              </Group>
              </Stack>
            )}
            {results && !hasFlowNodes && (
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
        <Tabs.Panel value="compare" pt="md">
          <Stack gap="md">
            <ResultsChart results={null} compareRuns={compareResults?.runs ?? []} />
            <ResultsTable results={null} compareRuns={compareResults?.runs ?? []} />
          </Stack>
        </Tabs.Panel>
        <Tabs.Panel value="sensitivity" pt="md">
          <SensitivityPanel />
        </Tabs.Panel>
      </Tabs>
    </Box>
      )}
    </Stack>
  );
}
