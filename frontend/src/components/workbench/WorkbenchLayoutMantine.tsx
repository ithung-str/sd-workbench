import { useState } from 'react';
import { AppShell, Button, Group, Select, Text, Title, ActionIcon, Menu, ScrollArea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconMenu2, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { ModelCanvas } from '../canvas/ModelCanvas';
import { PalettePanel } from '../palette/PalettePanelMantine';
import { InspectorPanel } from '../inspector/InspectorPanelMantine';
import { ResultsDock } from '../results/ResultsDockMantine';
import { ImportExportControls } from '../io/ImportExportControls';
import { useUIStore } from '../../state/uiStore';
import { modelPresets, type ModelPresetKey } from '../../lib/sampleModels';
import { useEditorStore } from '../../state/editorStore';
import { navigateTo } from '../../lib/navigation';

const defaultLogoUrl = new URL('../../../icons/logo.c8183304f1fb39b2784238e3b10258dd.svg', import.meta.url).href;
const WORKBENCH_HEADER_HEIGHT = 60;

export function WorkbenchLayout() {
  const [leftOpened, { open: openLeft, close: closeLeft }] = useDisclosure(true);
  const [rightOpened, { open: openRight, close: closeRight }] = useDisclosure(true);
  const [menuOpened, setMenuOpened] = useState(false);

  const model = useEditorStore((s) => s.model);
  const loadModel = useEditorStore((s) => s.loadModel);
  const logoUrl = (import.meta.env.VITE_SC_LOGO_URL as string | undefined) || defaultLogoUrl;
  const bottomTrayExpanded = useUIStore((s) => s.bottomTrayExpanded);
  const bottomTrayHeight = useUIStore((s) => s.bottomTrayHeight);

  const presetOptions: Array<{ key: ModelPresetKey; label: string }> = [
    { key: 'blank', label: 'Unsaved diagram' },
    { key: 'teacup', label: 'Teacup Cooling' },
    { key: 'bathtub', label: 'Bathtub Inventory' },
    { key: 'population', label: 'Simple Population' },
    { key: 'supplyChain', label: 'Supply Chain' },
  ];

  const selectedNative = presetOptions.find((option) => model.name === modelPresets[option.key].name)?.key ?? 'blank';

  return (
    <AppShell
      header={{ height: WORKBENCH_HEADER_HEIGHT }}
      footer={{ height: bottomTrayExpanded ? bottomTrayHeight : 68 }}
      navbar={{ width: 360, breakpoint: 'sm', collapsed: { mobile: !leftOpened, desktop: !leftOpened } }}
      aside={{ width: 340, breakpoint: 'md', collapsed: { mobile: !rightOpened, desktop: !rightOpened } }}
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

          <Group gap="xs" style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Select
              aria-label="Model picker"
              value={selectedNative}
              onChange={(value) => {
                if (!value) return;
                loadModel(modelPresets[value as ModelPresetKey]);
              }}
              data={presetOptions.map((opt) => ({ value: opt.key, label: opt.label }))}
              w={300}
              size="sm"
            />

            <Button variant="filled" color="deep-purple" size="sm">
              + New Diagram
            </Button>
            <Button variant="light" color="deepPurple" size="sm" onClick={() => navigateTo('/formulas')}>
              Formulas
            </Button>
            <Button variant="light" color="deepPurple" size="sm" onClick={() => navigateTo('/dashboard')}>
              Dashboard
            </Button>
            <Button variant="light" color="deepPurple" size="sm" onClick={() => navigateTo('/scenarios')}>
              Scenarios
            </Button>

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
        p={0}
        style={{
          ['--workbench-header-height' as string]: `${WORKBENCH_HEADER_HEIGHT}px`,
          background: '#ffffff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
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
      </AppShell.Main>

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
    </AppShell>
  );
}
