import { useEffect, useRef } from 'react';
import { Tabs, Stack, Group, NumberInput, Button, Alert, Paper, Text, Badge, Box, Select, TextInput, Popover } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconAlertCircle, IconPlayerPlay, IconCheck, IconChevronUp, IconChevronDown, IconFileDownload, IconInfoCircle, IconSettings } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import { useUIStore } from '../../state/uiStore';
import { ResultsChart } from './ResultsChart';
import { ResultsTable } from './ResultsTable';
import { ValidationList } from '../validation/ValidationList';
import { buildMfaYamlDocument, mfaYamlString, type MfaMissingValueRule, type MfaTimeUnit } from '../../lib/mfaExport';

export function ResultsDock() {
  const bottomTrayExpanded = useUIStore((s) => s.bottomTrayExpanded);
  const toggleBottomTray = useUIStore((s) => s.toggleBottomTray);
  const expandBottomTray = useUIStore((s) => s.expandBottomTray);
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

  const hasErrors = localIssues.some((i) => i.severity === 'error') || validation.errors.length > 0;
  const resizing = useRef(false);

  const hasFlowNodes = model.nodes.some((n) => n.type === 'flow');

  // Tab indicator counts
  const validationIssueCount = validation.errors.length + validation.warnings.length + localIssues.length;
  const hasCompareRuns = (compareResults?.runs?.length ?? 0) > 0;

  // Auto-expand tray when active tab changes (e.g. after simulate/validate)
  const prevTab = useRef(activeDockTab);
  useEffect(() => {
    if (prevTab.current !== activeDockTab) {
      prevTab.current = activeDockTab;
      if (!bottomTrayExpanded) expandBottomTray();
    }
  }, [activeDockTab, bottomTrayExpanded, expandBottomTray]);

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

  const handleResizeDoubleClick = () => {
    if (!bottomTrayExpanded) {
      expandBottomTray();
      setBottomTrayHeight(420);
    } else {
      setBottomTrayHeight(bottomTrayHeight > 300 ? 230 : 420);
    }
  };

  return (
    <Stack gap={0} h="100%" style={{ overflow: 'hidden', background: 'transparent' }}>
      {/* Resize handle — always visible */}
      <Box
        className="dock-resize-handle"
        onMouseDown={() => {
          resizing.current = true;
          document.body.style.cursor = 'ns-resize';
          document.body.style.userSelect = 'none';
        }}
        onDoubleClick={handleResizeDoubleClick}
        title={`Drag to resize tray (current: ${bottomTrayHeight}px) · Double-click to toggle size`}
        style={{
          height: 20,
          marginTop: 0,
          marginBottom: 2,
          cursor: 'ns-resize',
          display: 'grid',
          placeItems: 'center',
          background: 'transparent',
        }}
      >
        <Box
          className="dock-resize-pill"
          style={{
            width: 60,
            height: 5,
            borderRadius: 999,
            background: '#c5c9d4',
            boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
          }}
        />
      </Box>

      {/* Control bar */}
      <Group
        justify="flex-start"
        align="center"
        wrap="nowrap"
        gap="xs"
        style={{
          padding: '4px 8px',
          background: 'transparent',
          position: 'relative',
        }}
      >
        {/* Sim config popover */}
        <Popover width={420} position="top-start" shadow="md">
          <Popover.Target>
            <Button
              variant="subtle"
              size="xs"
              leftSection={<IconSettings size={14} />}
              style={{ flex: '0 0 auto' }}
            >
              Time: {simConfig.start}–{simConfig.stop} dt={simConfig.dt}
            </Button>
          </Popover.Target>
          <Popover.Dropdown>
            <Stack gap="sm">
              <Group grow>
                <NumberInput
                  label="Start"
                  value={simConfig.start}
                  onChange={(val) => setSimConfig({ start: Number(val) })}
                  size="xs"
                />
                <NumberInput
                  label="Stop"
                  value={simConfig.stop}
                  onChange={(val) => setSimConfig({ stop: Number(val) })}
                  size="xs"
                />
                <NumberInput
                  label="dt"
                  value={simConfig.dt}
                  onChange={(val) => setSimConfig({ dt: Number(val) })}
                  step={0.1}
                  size="xs"
                />
              </Group>
            </Stack>
          </Popover.Dropdown>
        </Popover>

        <Button
          leftSection={<IconCheck size={16} />}
          onClick={() => void runValidate()}
          disabled={isValidating}
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
      {apiError && (
        <Alert icon={<IconAlertCircle size={16} />} color="red" variant="filled" mb="xs" mx="xs">
          {apiError}
        </Alert>
      )}

      {/* Tabs with smart indicators */}
      <Tabs value={activeDockTab} onChange={(value) => setActiveDockTab(value as typeof activeDockTab)}>
        <Tabs.List>
          <Tabs.Tab
            value="validation"
            rightSection={
              validationIssueCount > 0 ? (
                <Badge size="xs" color="red" variant="filled" circle>{validationIssueCount}</Badge>
              ) : undefined
            }
          >
            Validation
          </Tabs.Tab>
          <Tabs.Tab
            value="chart"
            rightSection={
              results ? (
                <Box style={{ width: 8, height: 8, borderRadius: '50%', background: '#40c057' }} />
              ) : undefined
            }
          >
            Chart
          </Tabs.Tab>
          <Tabs.Tab value="table">Table</Tabs.Tab>
          <Tabs.Tab
            value="compare"
            rightSection={
              <Box style={{ width: 8, height: 8, borderRadius: '50%', background: hasCompareRuns ? '#40c057' : '#dee2e6', opacity: hasCompareRuns ? 1 : 0.5 }} />
            }
          >
            Compare
          </Tabs.Tab>
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
      </Tabs>
    </Box>
      )}
    </Stack>
  );
}
