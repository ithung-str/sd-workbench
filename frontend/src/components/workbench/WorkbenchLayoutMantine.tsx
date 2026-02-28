import { useState } from 'react';
import { AppShell, Button, Group, Select, Text, Title, ActionIcon, Menu, ScrollArea } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconSettings, IconMenu2, IconMap, IconEye, IconEyeOff, IconChevronLeft, IconChevronRight } from '@tabler/icons-react';
import { ModelCanvas } from '../canvas/ModelCanvas';
import { PalettePanel } from '../palette/PalettePanelMantine';
import { InspectorPanel } from '../inspector/InspectorPanelMantine';
import { ResultsDock } from '../results/ResultsDockMantine';
import { ImportExportControls } from '../io/ImportExportControls';
import { useUIStore } from '../../state/uiStore';
import { modelPresets, type ModelPresetKey } from '../../lib/sampleModels';
import { useEditorStore } from '../../state/editorStore';

export function WorkbenchLayout() {
  const [leftOpened, { toggle: toggleLeft }] = useDisclosure(true);
  const [rightOpened, { toggle: toggleRight }] = useDisclosure(true);
  const [menuOpened, setMenuOpened] = useState(false);

  const model = useEditorStore((s) => s.model);
  const loadModel = useEditorStore((s) => s.loadModel);
  const activeSimulationMode = useEditorStore((s) => s.activeSimulationMode);
  const importedVensim = useEditorStore((s) => s.importedVensim);
  const logoUrl = import.meta.env.VITE_SC_LOGO_URL as string | undefined;
  const bottomTrayExpanded = useUIStore((s) => s.bottomTrayExpanded);
  const bottomTrayHeight = useUIStore((s) => s.bottomTrayHeight);

  const presetOptions: Array<{ key: ModelPresetKey; label: string }> = [
    { key: 'blank', label: 'Unsaved diagram' },
    { key: 'teacup', label: 'Teacup Cooling' },
    { key: 'bathtub', label: 'Bathtub Inventory' },
    { key: 'population', label: 'Simple Population' },
    { key: 'supplyChain', label: 'Supply Chain' },
  ];

  const selectedPreset =
    presetOptions.find((option) => model.name === modelPresets[option.key].name)?.key ?? 'blank';

  return (
    <AppShell
      header={{ height: 60 }}
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
              <div style={{
                width: 30,
                height: 30,
                borderRadius: 8,
                background: '#EDE7F6',
                border: '1px solid #D1C4E9',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 700,
                fontSize: '0.75rem',
                color: '#5E35B1'
              }}>SC</div>
            )}
            <div>
              <Title order={4} size="h5" style={{ color: '#5E35B1', margin: 0 }}>Structural Collective</Title>
              <Text size="xs" c="dimmed">System Dynamics Workbench</Text>
            </div>
          </Group>

          <Group gap="xs" style={{ flex: 1, justifyContent: 'flex-end' }}>
            <Select
              value={selectedPreset}
              onChange={(value) => loadModel(modelPresets[value as ModelPresetKey])}
              data={presetOptions.map(opt => ({ value: opt.key, label: opt.label }))}
              w={200}
              size="sm"
            />

            <Button variant="filled" color="deep-purple" size="sm">+ New Diagram</Button>

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

      <AppShell.Navbar p="md">
        <ScrollArea h="calc(100vh - 60px)">
          <PalettePanel />
        </ScrollArea>
      </AppShell.Navbar>

      <AppShell.Main
        p={0}
        style={{
          background: '#ffffff',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <ModelCanvas />

        <ActionIcon
          onClick={toggleLeft}
          variant={leftOpened ? 'filled' : 'light'}
          color="deep-purple"
          size="lg"
          title={leftOpened ? 'Hide left panel' : 'Show left panel'}
          style={{
            position: 'absolute',
            top: 14,
            left: 8,
            zIndex: 1000,
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.12)',
          }}
        >
          <IconChevronLeft size={20} />
        </ActionIcon>
        <ActionIcon
          onClick={toggleRight}
          variant={rightOpened ? 'filled' : 'light'}
          color="deep-purple"
          size="lg"
          title={rightOpened ? 'Hide right panel' : 'Show right panel'}
          style={{
            position: 'absolute',
            top: 14,
            right: 8,
            zIndex: 1000,
            boxShadow: '0 1px 4px rgba(0, 0, 0, 0.12)',
          }}
        >
          <IconChevronRight size={20} />
        </ActionIcon>
      </AppShell.Main>

      <AppShell.Aside p="md">
        <ScrollArea h="calc(100vh - 60px)">
          <InspectorPanel />
        </ScrollArea>
      </AppShell.Aside>

      <AppShell.Footer
        p="xs"
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
