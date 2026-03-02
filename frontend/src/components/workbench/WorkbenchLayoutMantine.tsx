import { useState } from 'react';
import { AppShell, Group, Select, Tabs, Text, Title, ActionIcon, Menu, ScrollArea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconMenu2, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { ModelCanvas } from '../canvas/ModelCanvas';
import { PalettePanel } from '../palette/PalettePanelMantine';
import { InspectorPanel } from '../inspector/InspectorPanelMantine';
import { ResultsDock } from '../results/ResultsDockMantine';
import { FormulaPage } from '../formulas/FormulaPage';
import { DashboardPage } from '../dashboard/DashboardPage';
import { ScenarioPage } from '../scenarios/ScenarioPage';
import { ImportExportControls } from '../io/ImportExportControls';
import { useUIStore } from '../../state/uiStore';
import { modelPresets, type ModelPresetKey } from '../../lib/sampleModels';
import { useEditorStore, type WorkbenchTab } from '../../state/editorStore';

const defaultLogoUrl = new URL('../../../icons/logo.c8183304f1fb39b2784238e3b10258dd.svg', import.meta.url).href;
const WORKBENCH_HEADER_HEIGHT = 60;

export function WorkbenchLayout() {
  const [leftOpened, { open: openLeft, close: closeLeft }] = useDisclosure(true);
  const [rightOpened, { open: openRight, close: closeRight }] = useDisclosure(true);
  const [menuOpened, setMenuOpened] = useState(false);

  const model = useEditorStore((s) => s.model);
  const loadModel = useEditorStore((s) => s.loadModel);
  const activeTab = useEditorStore((s) => s.activeTab);
  const setActiveTab = useEditorStore((s) => s.setActiveTab);
  const logoUrl = (import.meta.env.VITE_SC_LOGO_URL as string | undefined) || defaultLogoUrl;
  const bottomTrayExpanded = useUIStore((s) => s.bottomTrayExpanded);
  const bottomTrayHeight = useUIStore((s) => s.bottomTrayHeight);

  const isCanvas = activeTab === 'canvas';

  const presetOptions: Array<{ key: ModelPresetKey; label: string }> = [
    { key: 'blank', label: 'Unsaved diagram' },
    { key: 'teacup', label: 'Teacup Cooling' },
    { key: 'bathtub', label: 'Bathtub Inventory' },
    { key: 'population', label: 'Population' },
    { key: 'supplyChain', label: 'Supply Chain' },
  ];

  const selectedNative = presetOptions.find((option) => model.name === modelPresets[option.key].name)?.key ?? 'blank';

  return (
    <AppShell
      header={{ height: WORKBENCH_HEADER_HEIGHT }}
      footer={{ height: isCanvas ? (bottomTrayExpanded ? bottomTrayHeight : 68) : 0 }}
      navbar={{ width: 360, breakpoint: 'sm', collapsed: { mobile: !isCanvas || !leftOpened, desktop: !isCanvas || !leftOpened } }}
      aside={{ width: 340, breakpoint: 'md', collapsed: { mobile: !isCanvas || !rightOpened, desktop: !isCanvas || !rightOpened } }}
      padding="0"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            {logoUrl ? (
              <img src={logoUrl} alt="Structural Collective" style={{ height: 34 }} />
            ) : (
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 8,
                  background: '#EDE7F6',
                  border: '1px solid #D1C4E9',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 700,
                  fontSize: '0.75rem',
                  color: '#5E35B1',
                }}
              >
                SC
              </div>
            )}
            <div>
              <Title order={4} size="h5" style={{ color: '#3D1F6F', margin: 0 }}>
                Structural Collective
              </Title>
              <Text size="xs" c="dimmed">
                System Dynamics Workbench
              </Text>
            </div>
          </Group>

          <Group gap="sm" style={{ flex: 1, justifyContent: 'center' }}>
            <Select
              aria-label="Model picker"
              value={selectedNative}
              onChange={(value) => {
                if (!value) return;
                loadModel(modelPresets[value as ModelPresetKey]);
              }}
              data={presetOptions.map((opt) => ({ value: opt.key, label: opt.label }))}
              w={220}
              size="xs"
            />
          </Group>

          <Group gap="xs">
            <Tabs
              value={activeTab}
              onChange={(v) => v && setActiveTab(v as WorkbenchTab)}
              variant="default"
              color="violet"
              styles={{
                root: { alignSelf: 'stretch', display: 'flex', alignItems: 'stretch' },
                list: { borderBottom: 'none', flexWrap: 'nowrap', gap: 0 },
                tab: {
                  fontWeight: 500,
                  fontSize: '0.85rem',
                  paddingLeft: 12,
                  paddingRight: 12,
                },
              }}
            >
              <Tabs.List>
                <Tabs.Tab value="canvas">Canvas</Tabs.Tab>
                <Tabs.Tab value="formulas">Formulas</Tabs.Tab>
                <Tabs.Tab value="dashboard">Dashboard</Tabs.Tab>
                <Tabs.Tab value="scenarios">Scenarios</Tabs.Tab>
              </Tabs.List>
            </Tabs>

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
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p={0}>
        <div className="sidebar-panel">
          <div className="sidebar-panel-header sidebar-panel-header-settings">
            <Text size="sm" fw={700} className="sidebar-panel-title">
              Settings
            </Text>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              data-testid="left-collapse"
              aria-label="Collapse left sidebar"
              title="Collapse left sidebar"
              onClick={closeLeft}
            >
              <IconChevronLeft size={16} />
            </ActionIcon>
          </div>
          <ScrollArea className="sidebar-panel-scroll">
            <div className="sidebar-panel-body sidebar-panel-body-settings">
              <PalettePanel onSelectOutlineNode={openRight} />
            </div>
          </ScrollArea>
        </div>
      </AppShell.Navbar>

      <AppShell.Aside p={0}>
        <div className="sidebar-panel">
          <div className="sidebar-panel-header">
            <Text size="sm" fw={700} className="sidebar-panel-title">
              Inspector
            </Text>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="gray"
              data-testid="right-collapse"
              aria-label="Collapse right sidebar"
              title="Collapse right sidebar"
              onClick={closeRight}
            >
              <IconChevronRight size={16} />
            </ActionIcon>
          </div>
          <ScrollArea className="sidebar-panel-scroll">
            <div className="sidebar-panel-body sidebar-panel-body-right">
              <InspectorPanel />
            </div>
          </ScrollArea>
        </div>
      </AppShell.Aside>

      <AppShell.Main
        className="workbench-main"
        style={{
          ['--workbench-header-height' as string]: `${WORKBENCH_HEADER_HEIGHT}px`,
          background: '#ffffff',
          position: 'relative',
          overflow: isCanvas ? 'hidden' : 'auto',
        }}
      >
        {activeTab === 'canvas' && (
          <>
            <ModelCanvas />

            {!leftOpened && (
              <ActionIcon
                className="sidebar-reopen-tab sidebar-reopen-tab-left"
                variant="filled"
                color="deepPurple"
                size="lg"
                data-testid="left-expand"
                aria-label="Expand left sidebar"
                title="Expand left sidebar"
                onClick={openLeft}
              >
                <IconChevronRight size={18} />
              </ActionIcon>
            )}

            {!rightOpened && (
              <ActionIcon
                className="sidebar-reopen-tab sidebar-reopen-tab-right"
                variant="filled"
                color="deepPurple"
                size="lg"
                data-testid="right-expand"
                aria-label="Expand right sidebar"
                title="Expand right sidebar"
                onClick={openRight}
              >
                <IconChevronLeft size={18} />
              </ActionIcon>
            )}
          </>
        )}

        {activeTab === 'formulas' && <FormulaPage />}
        {activeTab === 'dashboard' && <DashboardPage />}
        {activeTab === 'scenarios' && <ScenarioPage />}
      </AppShell.Main>

      {isCanvas && (
        <AppShell.Footer
          p={0}
          style={{
            background: '#ffffff',
            borderTop: '1px solid #e7e7ee',
            overflow: 'hidden',
            transition: 'height 180ms ease',
          }}
        >
          <ResultsDock />
        </AppShell.Footer>
      )}
    </AppShell>
  );
}
