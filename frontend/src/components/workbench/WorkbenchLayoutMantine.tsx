import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Group,
  SegmentedControl,
  Select,
  Text,
  Title,
  Tooltip,
  ActionIcon,
  Menu,
  ScrollArea,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconMenu2,
  IconChevronLeft,
  IconChevronRight,
  IconPlus,
  IconPlayerPlay,
  IconMessageCircle,
  IconAlertTriangle,
  IconCheck,
  IconDeviceFloppy,
  IconSearch as IconInspector,
} from '@tabler/icons-react';
import { ModelCanvas } from '../canvas/ModelCanvas';
import { InspectorPanel } from '../inspector/InspectorPanelMantine';
import { FormulaPage } from '../formulas/FormulaPage';
import { DashboardPage } from '../dashboard/DashboardPage';
import { ScenarioPage } from '../scenarios/ScenarioPage';
import { SensitivityPage } from '../sensitivity/SensitivityPage';
import { OptimisationPage } from '../optimisation/OptimisationPage';
import { DataPage } from '../data/DataPage';
import { AnalysisPage } from '../analysis/AnalysisPage';
import { AnalysisInspectorPanel } from '../analysis/AnalysisInspectorPanel';
import { AIChatSidebar } from './AIChatSidebar';
import { ImportExportControls } from '../io/ImportExportControls';
import { IconStrip } from './IconStrip';
import { FlyoutPanel } from './FlyoutPanel';
import { BottomNavBar } from './BottomNavBar';
import { SimulationPanel } from './SimulationPanel';
import { ValidationList } from '../validation/ValidationList';
import { modelPresets, type ModelPresetKey } from '../../lib/sampleModels';
import { listSavedModels, loadModelFromStorage, setActiveModelId } from '../../lib/modelStorage';
import { specEntries, specGroups, loadSpecContent } from '../../lib/specCatalog';
import { useEditorStore, type RightSidebarMode } from '../../state/editorStore';

const defaultLogoUrl = new URL('../../../icons/logo.c8183304f1fb39b2784238e3b10258dd.svg', import.meta.url).href;

export function WorkbenchLayout() {
  const [rightOpened, { open: openRight, close: closeRight }] = useDisclosure(true);
  const [menuOpened, setMenuOpened] = useState(false);

  const model = useEditorStore((s) => s.model);
  const loadModel = useEditorStore((s) => s.loadModel);
  const startNewModel = useEditorStore((s) => s.startNewModel);
  const isApplyingAi = useEditorStore((s) => s.isApplyingAi);
  const activeTab = useEditorStore((s) => s.activeTab);
  const rightSidebarMode = useEditorStore((s) => s.rightSidebarMode);
  const setRightSidebarMode = useEditorStore((s) => s.setRightSidebarMode);
  const validation = useEditorStore((s) => s.validation);
  const localIssues = useEditorStore((s) => s.localIssues);
  const runValidate = useEditorStore((s) => s.runValidate);
  const isValidating = useEditorStore((s) => s.isValidating);
  const issueCount = localIssues.length + validation.errors.length + validation.warnings.length;
  const logoUrl = (import.meta.env.VITE_SC_LOGO_URL as string | undefined) || defaultLogoUrl;

  const isCanvas = activeTab === 'canvas';
  const isAnalysis = activeTab === 'analysis';

  // When leaving a tab, switch away from tab-specific sidebar modes
  useEffect(() => {
    if (!isCanvas && (rightSidebarMode === 'inspector' || rightSidebarMode === 'simulation')) {
      setRightSidebarMode('chat');
    }
    if (!isAnalysis && rightSidebarMode === 'analysis-inspector') {
      setRightSidebarMode('chat');
    }
  }, [isCanvas, isAnalysis, rightSidebarMode, setRightSidebarMode]);

  const presetOptions: Array<{ key: ModelPresetKey; label: string }> = [
    { key: 'blank', label: 'Unsaved diagram' },
    { key: 'teacup', label: 'Teacup Cooling' },
    { key: 'bathtub', label: 'Bathtub Inventory' },
    { key: 'population', label: 'Population' },
    { key: 'supplyChain', label: 'Supply Chain' },
  ];

  const savedModels = listSavedModels();

  const selectedNative = presetOptions.find((option) => model.name === modelPresets[option.key].name)?.key ?? 'blank';
  // Determine current picker value: saved model, preset, or blank
  const savedMatch = savedModels.find((s) => s.id === model.id);
  const pickerValue = savedMatch ? `saved:${savedMatch.id}` : selectedNative;

  const savedGroup = savedModels.length > 0
    ? [{ group: 'My Models', items: savedModels.map((s) => ({ value: `saved:${s.id}`, label: s.name || s.id })) }]
    : [];

  const pickerData = [
    ...savedGroup,
    { group: 'Presets', items: presetOptions.map((opt) => ({ value: opt.key, label: opt.label })) },
    ...specGroups().map((group) => ({
      group: `Spec: ${group}`,
      items: specEntries
        .filter((e) => e.group === group)
        .map((e) => ({ value: `spec:${e.id}`, label: `${e.chapter}.${e.id.split('_')[1]} ${e.title}` })),
    })),
  ];

  const handlePickerChange = (value: string | null) => {
    if (!value) return;
    if (value.startsWith('saved:')) {
      const id = value.replace('saved:', '');
      const saved = loadModelFromStorage(id);
      if (saved) {
        loadModel(saved);
        setActiveModelId(id);
      }
    } else if (value.startsWith('spec:')) {
      const specId = value.replace('spec:', '');
      const entry = specEntries.find((e) => e.id === specId);
      if (!entry) return;
      const content = loadSpecContent(entry);
      if (!content) return;
      const store = useEditorStore.getState();
      store.setRightSidebarMode('chat');
      openRight();
      store.setAiCommand(`Build a complete SD model from this specification:\n\n${content}`);
      void store.runAiCommand();
    } else {
      loadModel(modelPresets[value as ModelPresetKey]);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', overflow: 'hidden' }}>
      {/* Header (48px) */}
      <header
        style={{
          height: 48,
          display: 'flex',
          alignItems: 'center',
          padding: '0 12px',
          borderBottom: '1px solid #e7e7ee',
          background: '#f7f7fa',
          flexShrink: 0,
          gap: 12,
        }}
      >
        {/* Left: Logo */}
        <Group gap="xs" style={{ flexShrink: 0 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="Structural Collective" style={{ height: 28 }} />
          ) : (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                background: '#EDE7F6',
                border: '1px solid #D1C4E9',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: '0.7rem',
                color: '#5E35B1',
              }}
            >
              SC
            </div>
          )}
          <div>
            <Title order={5} size="0.85rem" style={{ color: '#3D1F6F', margin: 0, lineHeight: 1.2 }}>
              Structural Collective
            </Title>
            <Text size="10px" c="dimmed" style={{ lineHeight: 1.2 }}>
              System Dynamics Workbench
            </Text>
          </div>
        </Group>

        {/* Center: Model name + picker */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 8 }}>
          <input
            value={model.name}
            onChange={(e) => {
              useEditorStore.setState((s) => ({
                model: { ...s.model, name: e.target.value },
              }));
            }}
            placeholder="Untitled model"
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: '0.85rem',
              fontWeight: 600,
              color: '#3D1F6F',
              width: 180,
              textAlign: 'right',
              outline: 'none',
              padding: '2px 4px',
              borderRadius: 4,
            }}
            onFocus={(e) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.boxShadow = '0 0 0 1px #D1C4E9'; }}
            onBlur={(e) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}
          />
          <Text size="xs" c="dimmed">|</Text>
          <Select
            aria-label="Model picker"
            value={pickerValue}
            onChange={handlePickerChange}
            data={pickerData}
            w={240}
            size="xs"
            searchable
            maxDropdownHeight={400}
            placeholder="Load preset..."
          />
        </div>

        {/* Right: New button + Menu */}
        <Group gap="xs" style={{ flexShrink: 0 }}>
          <Tooltip label="Save model to file">
            <ActionIcon
              variant="subtle"
              size="lg"
              color="gray"
              onClick={() => {
                const blob = new Blob([JSON.stringify(model, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${model.name || model.id}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              aria-label="Save model"
            >
              <IconDeviceFloppy size={18} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Start a new blank model">
            <Button
              size="compact-xs"
              variant="light"
              color="violet"
              leftSection={<IconPlus size={14} />}
              onClick={() => {
                startNewModel();
                setRightSidebarMode('chat');
                openRight();
              }}
              disabled={isApplyingAi}
            >
              New
            </Button>
          </Tooltip>

          <Menu opened={menuOpened} onChange={setMenuOpened}>
            <Menu.Target>
              <ActionIcon variant="subtle" size="lg">
                <IconMenu2 size={20} />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown>
              <ImportExportControls mode="menu" onActionComplete={() => setMenuOpened(false)} />
            </Menu.Dropdown>
          </Menu>
        </Group>
      </header>

      {/* Middle row: icon strip + flyout + main + right sidebar */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* Left icon strip + flyout: canvas only */}
        {isCanvas && <IconStrip />}
        {isCanvas && <FlyoutPanel />}

        {/* Main content area (flex: 1) */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            position: 'relative',
            overflow: (isCanvas || isAnalysis) ? 'hidden' : 'auto',
          }}
        >
          {activeTab === 'canvas' && <ModelCanvas />}
          {activeTab === 'formulas' && <FormulaPage />}
          {activeTab === 'dashboard' && <DashboardPage />}
          {activeTab === 'scenarios' && <ScenarioPage />}
          {activeTab === 'sensitivity' && <SensitivityPage />}
          {activeTab === 'optimisation' && <OptimisationPage />}
          {activeTab === 'data' && <DataPage />}
          {activeTab === 'analysis' && <AnalysisPage />}
        </div>

        {/* Right sidebar */}
        {rightOpened && (
          <div
            style={{
              width: 400,
              minWidth: 0,
              borderLeft: '1px solid #e7e7ee',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              overflow: 'hidden',
              background: '#ffffff',
            }}
          >
            <div className="sidebar-panel-header">
              <SegmentedControl
                size="xs"
                value={rightSidebarMode}
                onChange={(v) => setRightSidebarMode(v as RightSidebarMode)}
                data={isCanvas ? [
                  { value: 'inspector', label: 'Inspector' },
                  { value: 'chat', label: 'AI Chat' },
                  { value: 'simulation', label: 'Simulate' },
                  {
                    value: 'validation',
                    label: issueCount > 0
                      ? `Issues (${issueCount})`
                      : 'Issues',
                  },
                ] : isAnalysis ? [
                  { value: 'analysis-inspector', label: 'Inspector' },
                  { value: 'chat', label: 'AI Chat' },
                  {
                    value: 'validation',
                    label: issueCount > 0
                      ? `Issues (${issueCount})`
                      : 'Issues',
                  },
                ] : [
                  { value: 'chat', label: 'AI Chat' },
                  {
                    value: 'validation',
                    label: issueCount > 0
                      ? `Issues (${issueCount})`
                      : 'Issues',
                  },
                ]}
                styles={{ root: { flex: 1 } }}
              />
              <ActionIcon
                size="sm"
                variant="subtle"
                color="gray"
                onClick={closeRight}
                data-testid="right-collapse"
                aria-label="Collapse right sidebar"
                title="Collapse right sidebar"
              >
                <IconChevronRight size={16} />
              </ActionIcon>
            </div>
            {rightSidebarMode === 'inspector' && isCanvas && (
              <ScrollArea
                style={{ flex: 1 }}
                type="auto"
                offsetScrollbars
                scrollbarSize={8}
                styles={{ viewport: { overflowX: 'hidden' } }}
              >
                <div className="sidebar-panel-body sidebar-panel-body-right">
                  <InspectorPanel />
                </div>
              </ScrollArea>
            )}
            {rightSidebarMode === 'analysis-inspector' && isAnalysis && (
              <AnalysisInspectorPanel />
            )}
            {rightSidebarMode === 'chat' && <AIChatSidebar />}
            {rightSidebarMode === 'simulation' && isCanvas && <SimulationPanel />}
            {rightSidebarMode === 'validation' && (
              <ScrollArea
                style={{ flex: 1 }}
                type="auto"
                offsetScrollbars
                scrollbarSize={8}
                styles={{ viewport: { overflowX: 'hidden' } }}
              >
                <div className="sidebar-panel-body sidebar-panel-body-right">
                  <Button
                    leftSection={<IconCheck size={14} />}
                    onClick={() => void runValidate()}
                    disabled={isValidating}
                    variant="light"
                    size="xs"
                    fullWidth
                    mb="sm"
                  >
                    {isValidating ? 'Validating...' : 'Validate'}
                  </Button>
                  <ValidationList />
                </div>
              </ScrollArea>
            )}
          </div>
        )}
        {!rightOpened && (
          <div className="sidebar-collapsed-strip">
            {isCanvas && (
              <Tooltip label="Run Simulation" position="left" withArrow>
                <ActionIcon
                  size="lg"
                  variant="subtle"
                  color="violet"
                  className="sidebar-collapsed-btn"
                  onClick={() => {
                    setRightSidebarMode('simulation');
                    openRight();
                    void useEditorStore.getState().runSimulate();
                  }}
                  aria-label="Run Simulation"
                >
                  <IconPlayerPlay size={18} />
                </ActionIcon>
              </Tooltip>
            )}
            {isCanvas && (
              <Tooltip label="Inspector" position="left" withArrow>
                <ActionIcon
                  size="lg"
                  variant="subtle"
                  className="sidebar-collapsed-btn"
                  onClick={() => {
                    setRightSidebarMode('inspector');
                    openRight();
                  }}
                  aria-label="Inspector"
                >
                  <IconInspector size={18} />
                </ActionIcon>
              </Tooltip>
            )}
            {isAnalysis && (
              <Tooltip label="Inspector" position="left" withArrow>
                <ActionIcon
                  size="lg"
                  variant="subtle"
                  className="sidebar-collapsed-btn"
                  onClick={() => {
                    setRightSidebarMode('analysis-inspector');
                    openRight();
                  }}
                  aria-label="Analysis Inspector"
                >
                  <IconInspector size={18} />
                </ActionIcon>
              </Tooltip>
            )}
            <Tooltip label="AI Chat" position="left" withArrow>
              <ActionIcon
                size="lg"
                variant="subtle"
                className="sidebar-collapsed-btn"
                onClick={() => {
                  setRightSidebarMode('chat');
                  openRight();
                }}
                aria-label="AI Chat"
              >
                <IconMessageCircle size={18} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={`Issues${issueCount > 0 ? ` (${issueCount})` : ''}`} position="left" withArrow>
              <ActionIcon
                size="lg"
                variant="subtle"
                className="sidebar-collapsed-btn"
                color={issueCount > 0 ? 'red' : 'gray'}
                onClick={() => {
                  setRightSidebarMode('validation');
                  openRight();
                }}
                aria-label="Issues"
              >
                <IconAlertTriangle size={18} />
              </ActionIcon>
            </Tooltip>
            <div style={{ flex: 1 }} />
            <Tooltip label="Expand sidebar" position="left" withArrow>
              <ActionIcon
                size="lg"
                variant="subtle"
                className="sidebar-collapsed-btn"
                data-testid="right-expand"
                onClick={openRight}
                aria-label="Expand right sidebar"
              >
                <IconChevronLeft size={16} />
              </ActionIcon>
            </Tooltip>
          </div>
        )}
      </div>

      {/* Bottom nav bar (32px) */}
      <BottomNavBar />
    </div>
  );
}
