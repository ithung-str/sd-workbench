import { useState } from 'react';
import {
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
} from '@tabler/icons-react';
import { ModelCanvas } from '../canvas/ModelCanvas';
import { InspectorPanel } from '../inspector/InspectorPanelMantine';
import { FormulaPage } from '../formulas/FormulaPage';
import { DashboardPage } from '../dashboard/DashboardPage';
import { ScenarioPage } from '../scenarios/ScenarioPage';
import { SensitivityPage } from '../sensitivity/SensitivityPage';
import { AIChatSidebar } from './AIChatSidebar';
import { ImportExportControls } from '../io/ImportExportControls';
import { IconStrip } from './IconStrip';
import { FlyoutPanel } from './FlyoutPanel';
import { BottomNavBar } from './BottomNavBar';
import { SimulationPanel } from './SimulationPanel';
import { modelPresets, type ModelPresetKey } from '../../lib/sampleModels';
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
  const logoUrl = (import.meta.env.VITE_SC_LOGO_URL as string | undefined) || defaultLogoUrl;

  const isCanvas = activeTab === 'canvas';

  const presetOptions: Array<{ key: ModelPresetKey; label: string }> = [
    { key: 'blank', label: 'Unsaved diagram' },
    { key: 'teacup', label: 'Teacup Cooling' },
    { key: 'bathtub', label: 'Bathtub Inventory' },
    { key: 'population', label: 'Population' },
    { key: 'supplyChain', label: 'Supply Chain' },
  ];

  const selectedNative = presetOptions.find((option) => model.name === modelPresets[option.key].name)?.key ?? 'blank';

  const pickerData = [
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
    if (value.startsWith('spec:')) {
      const specId = value.replace('spec:', '');
      const entry = specEntries.find((e) => e.id === specId);
      if (!entry) return;
      const content = loadSpecContent(entry);
      if (!content) return;
      // Open AI chat sidebar and send the spec as a prompt
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

        {/* Center: Model picker */}
        <div style={{ flex: 1, display: 'flex', justifyContent: 'center' }}>
          <Select
            aria-label="Model picker"
            value={selectedNative}
            onChange={handlePickerChange}
            data={pickerData}
            w={280}
            size="xs"
            searchable
            maxDropdownHeight={400}
            placeholder="Select a model or specification..."
          />
        </div>

        {/* Right: New button + Menu */}
        <Group gap="xs" style={{ flexShrink: 0 }}>
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
        {/* Left icon strip (always visible, 44px) */}
        <IconStrip />

        {/* Flyout panel (240px, conditional, overlays canvas) */}
        <FlyoutPanel />

        {/* Main content area (flex: 1) */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minWidth: 0,
            position: 'relative',
            overflow: isCanvas ? 'hidden' : 'auto',
          }}
        >
          {activeTab === 'canvas' && <ModelCanvas />}
          {activeTab === 'formulas' && <FormulaPage />}
          {activeTab === 'dashboard' && <DashboardPage />}
          {activeTab === 'scenarios' && <ScenarioPage />}
          {activeTab === 'sensitivity' && <SensitivityPage />}
        </div>

        {/* Right sidebar (300px, collapsible) */}
        {rightOpened ? (
          <div
            style={{
              width: 300,
              borderLeft: '1px solid #e7e7ee',
              display: 'flex',
              flexDirection: 'column',
              flexShrink: 0,
              background: '#ffffff',
            }}
          >
            <div className="sidebar-panel-header">
              <SegmentedControl
                size="xs"
                value={rightSidebarMode}
                onChange={(v) => setRightSidebarMode(v as RightSidebarMode)}
                data={[
                  { value: 'inspector', label: 'Inspector' },
                  { value: 'chat', label: 'AI Chat' },
                  { value: 'simulation', label: 'Simulate' },
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
            {rightSidebarMode === 'inspector' && (
              <ScrollArea style={{ flex: 1 }}>
                <div className="sidebar-panel-body sidebar-panel-body-right">
                  <InspectorPanel />
                </div>
              </ScrollArea>
            )}
            {rightSidebarMode === 'chat' && <AIChatSidebar />}
            {rightSidebarMode === 'simulation' && <SimulationPanel />}
          </div>
        ) : (
          <ActionIcon
            className="sidebar-reopen-tab sidebar-reopen-tab-right"
            variant="filled"
            color="deepPurple"
            size="lg"
            data-testid="right-expand"
            aria-label="Expand right sidebar"
            title="Expand right sidebar"
            onClick={openRight}
            style={{ position: 'fixed', right: 0, top: '50%', zIndex: 100 }}
          >
            <IconChevronLeft size={18} />
          </ActionIcon>
        )}
      </div>

      {/* Bottom nav bar (32px) */}
      <BottomNavBar />
    </div>
  );
}
