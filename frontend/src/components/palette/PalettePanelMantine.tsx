import { useMemo, useState, type KeyboardEvent } from 'react';
import {
  ActionIcon,
  Accordion,
  Badge,
  Button,
  Code,
  Group,
  Paper,
  ScrollArea,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  UnstyledButton,
} from '@mantine/core';
import {
  IconAdjustments,
  IconAlertCircle,
  IconCheck,
  IconCode,
  IconFlask,
  IconPaint,
  IconPencil,
  IconPlus,
  IconSettings,
  IconSparkles,
  IconTrash,
  IconX,
} from '@tabler/icons-react';
import { ColorInput } from '@mantine/core';
import { collectGlobalVariableUsage } from '../../lib/globalVariableUsage';
import { useEditorStore } from '../../state/editorStore';
import { useUIStore } from '../../state/uiStore';
import { ScenarioStudio } from '../scenarios/ScenarioStudioMantine';

type PalettePanelProps = {
  onSelectOutlineNode?: () => void;
};

export function PalettePanel({ onSelectOutlineNode }: PalettePanelProps) {
  const addGlobalVariable = useEditorStore((s) => s.addGlobalVariable);
  const updateGlobalVariable = useEditorStore((s) => s.updateGlobalVariable);
  const deleteGlobalVariable = useEditorStore((s) => s.deleteGlobalVariable);
  const model = useEditorStore((s) => s.model);
  const selected = useEditorStore((s) => s.selected);
  const setSelected = useEditorStore((s) => s.setSelected);
  const activeSimulationMode = useEditorStore((s) => s.activeSimulationMode);
  const importedVensim = useEditorStore((s) => s.importedVensim);
  const updateDefaultStyle = useEditorStore((s) => s.updateDefaultStyle);
  const defaultStyles = model.metadata?.default_styles;
  const aiCommand = useEditorStore((s) => s.aiCommand);
  const setAiCommand = useEditorStore((s) => s.setAiCommand);
  const runAiCommand = useEditorStore((s) => s.runAiCommand);
  const isApplyingAi = useEditorStore((s) => s.isApplyingAi);
  const [editingGlobalId, setEditingGlobalId] = useState<string | null>(null);
  const [editingGlobalValue, setEditingGlobalValue] = useState('');

  const showFunctionInternals = useUIStore((s) => s.showFunctionInternals);
  const showMinimap = useUIStore((s) => s.showMinimap);
  const showXmlModel = useUIStore((s) => s.showXmlModel);
  const toggleFunctionInternals = useUIStore((s) => s.toggleFunctionInternals);
  const toggleMinimap = useUIStore((s) => s.toggleMinimap);
  const toggleXmlModel = useUIStore((s) => s.toggleXmlModel);
  const globalUsage = useMemo(() => collectGlobalVariableUsage(model), [model]);

  const getNodeColor = (type: string) => {
    switch (type) {
      case 'stock':
        return 'blue';
      case 'flow':
        return 'violet';
      case 'aux':
        return 'green';
      case 'lookup':
        return 'orange';
      case 'text':
        return 'gray';
      case 'cloud':
        return 'cyan';
      case 'cld_symbol':
        return 'indigo';
      default:
        return 'gray';
    }
  };

  const startGlobalValueEdit = (id: string, value: string) => {
    setEditingGlobalId(id);
    setEditingGlobalValue(value);
  };

  const commitGlobalValueEdit = (id: string) => {
    updateGlobalVariable(id, { equation: editingGlobalValue });
    setEditingGlobalId(null);
  };

  const nodeOutlineLabel = (node: (typeof model.nodes)[number]): string => {
    if (node.type === 'text') return node.text;
    if (node.type === 'cloud') return 'Cloud';
    if (node.type === 'phantom') return 'Phantom';
    if (node.type === 'cld_symbol') return node.name?.trim() || `CLD ${node.symbol}`;
    return node.label;
  };

  return (
    <div style={{ width: '100%', maxWidth: '100%', overflowX: 'hidden' }}>
      <Stack gap="md">
      <Accordion
        className="settings-accordion"
        defaultValue={[]}
        multiple
        variant="default"
        chevronPosition="right"
      >
        <Accordion.Item value="view-settings">
          <Accordion.Control>
            <Group gap={8} wrap="nowrap">
              <IconAdjustments size={16} />
              <Text size="sm" fw={500}>Diagram Settings</Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Group justify="space-between" wrap="nowrap">
                <div style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>
                    Show function arguments
                  </Text>
                  <Text size="xs" c="dimmed">
                    Display function internals in node labels
                  </Text>
                </div>
                <Switch checked={showFunctionInternals} onChange={toggleFunctionInternals} size="md" color="deepPurple" />
              </Group>
              <Group justify="space-between" wrap="nowrap">
                <div style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>
                    Show minimap
                  </Text>
                  <Text size="xs" c="dimmed">
                    Display navigation minimap
                  </Text>
                </div>
                <Switch checked={showMinimap} onChange={toggleMinimap} size="md" color="deepPurple" />
              </Group>
              <Group justify="space-between" wrap="nowrap">
                <div style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>
                    Show XML model
                  </Text>
                  <Text size="xs" c="dimmed">
                    Display XML representation on canvas
                  </Text>
                </div>
                <Switch checked={showXmlModel} onChange={toggleXmlModel} size="md" color="deepPurple" />
              </Group>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="global-styles">
          <Accordion.Control>
            <Group gap={8} wrap="nowrap">
              <IconPaint size={16} />
              <Text size="sm" fw={500}>Global Styles</Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="md">
              {(['stock', 'flow', 'aux', 'lookup'] as const).map((nodeType) => (
                <Paper key={nodeType} withBorder p="xs">
                  <Text size="sm" fw={600} mb={6} tt="capitalize">{nodeType}</Text>
                  <Stack gap="xs">
                    <ColorInput
                      label="Fill"
                      size="xs"
                      placeholder="Default"
                      value={defaultStyles?.[nodeType]?.fill ?? ''}
                      onChange={(value) => updateDefaultStyle(nodeType, { fill: value || undefined })}
                    />
                    <ColorInput
                      label="Stroke"
                      size="xs"
                      placeholder="Default"
                      value={defaultStyles?.[nodeType]?.stroke ?? ''}
                      onChange={(value) => updateDefaultStyle(nodeType, { stroke: value || undefined })}
                    />
                    <ColorInput
                      label="Text Color"
                      size="xs"
                      placeholder="Default"
                      value={defaultStyles?.[nodeType]?.text_color ?? ''}
                      onChange={(value) => updateDefaultStyle(nodeType, { text_color: value || undefined })}
                    />
                  </Stack>
                </Paper>
              ))}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="scenarios">
          <Accordion.Control>
            <Group gap={8} wrap="nowrap">
              <IconSettings size={16} />
              <Text size="sm" fw={500}>Scenarios</Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <ScenarioStudio showHeading={false} />
          </Accordion.Panel>
        </Accordion.Item>

        <Accordion.Item value="model-outline">
          <Accordion.Control>
            <Group gap={8} wrap="nowrap">
              <IconFlask size={16} />
              <Text size="sm" fw={500}>Model</Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <ScrollArea h={200}>
              <Stack gap="xs">
                {model.nodes.length === 0 ? (
                  <Text size="sm" c="dimmed" ta="center" py="md">
                    No elements yet
                  </Text>
                ) : (
                  model.nodes.map((node) => {
                    const isSelected = selected?.kind === 'node' && selected.id === node.id;
                    return (
                      <UnstyledButton
                        key={node.id}
                        onClick={() => {
                          setSelected({ kind: 'node', id: node.id });
                          onSelectOutlineNode?.();
                        }}
                        aria-label={`Select ${node.type} ${
                          nodeOutlineLabel(node)
                        }`}
                        style={{ display: 'block', width: '100%' }}
                      >
                        <Paper
                          p="xs"
                          withBorder
                          style={{
                            borderColor: isSelected ? 'var(--mantine-color-blue-5)' : undefined,
                            background: isSelected ? 'var(--mantine-color-blue-0)' : undefined,
                          }}
                        >
                          <Group gap="xs">
                            <Badge size="sm" color={getNodeColor(node.type)}>
                              {node.type}
                            </Badge>
                            <Text size="sm">
                              {nodeOutlineLabel(node)}
                            </Text>
                          </Group>
                        </Paper>
                      </UnstyledButton>
                    );
                  })
                )}
              </Stack>
            </ScrollArea>
          </Accordion.Panel>
        </Accordion.Item>

        {activeSimulationMode !== 'vensim' && (
          <Accordion.Item value="global-vars">
            <Accordion.Control>
              <Group gap={8} wrap="nowrap">
                <IconCode size={16} />
                <Text size="sm" fw={500}>Globals</Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Stack gap="sm">
                <Button
                  variant="light"
                  color="deepPurple"
                  size="xs"
                  fullWidth
                  leftSection={<IconPlus size={14} />}
                  onClick={addGlobalVariable}
                >
                  Add Global Variable
                </Button>
                <ScrollArea h={250}>
                  <Stack gap={6}>
                    {(model.global_variables ?? []).map((variable) => (
                      <Paper
                        key={variable.id}
                        p={6}
                        withBorder
                        style={{
                          borderColor:
                            selected?.kind === 'global_variable' && selected.id === variable.id
                              ? 'var(--mantine-color-blue-5)'
                              : undefined,
                          background:
                            selected?.kind === 'global_variable' && selected.id === variable.id
                              ? 'var(--mantine-color-blue-0)'
                              : undefined,
                        }}
                      >
                        <Group justify="space-between" align="center" wrap="nowrap" gap={6}>
                          <UnstyledButton
                            onClick={() => {
                              setSelected({ kind: 'global_variable', id: variable.id });
                              onSelectOutlineNode?.();
                            }}
                            style={{ display: 'block', flex: 1, minWidth: 0 }}
                          >
                            <Group gap={6} wrap="nowrap">
                              <Badge size="xs" color="blue">
                                global
                              </Badge>
                              <div style={{ minWidth: 0 }}>
                                <Text size="sm" fw={600} truncate>
                                  {variable.name}
                                </Text>
                                <Text size="xs" c="dimmed">
                                  {globalUsage[variable.id]?.total ?? 0} uses
                                </Text>
                              </div>
                            </Group>
                          </UnstyledButton>
                          {editingGlobalId === variable.id ? (
                            <>
                              <TextInput
                                value={editingGlobalValue}
                                onChange={(e) => setEditingGlobalValue(e.target.value)}
                                size="xs"
                                w={120}
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                                  if (e.key === 'Enter') {
                                    e.preventDefault();
                                    commitGlobalValueEdit(variable.id);
                                  }
                                  if (e.key === 'Escape') {
                                    e.preventDefault();
                                    setEditingGlobalId(null);
                                  }
                                }}
                                onBlur={() => commitGlobalValueEdit(variable.id)}
                                autoFocus
                              />
                              <ActionIcon
                                size="sm"
                                color="green"
                                variant="subtle"
                                onMouseDown={(e) => e.preventDefault()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  commitGlobalValueEdit(variable.id);
                                }}
                                title="Save value"
                              >
                                <IconCheck size={14} />
                              </ActionIcon>
                              <ActionIcon
                                size="sm"
                                color="gray"
                                variant="subtle"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingGlobalId(null);
                                }}
                                title="Cancel edit"
                              >
                                <IconX size={14} />
                              </ActionIcon>
                            </>
                          ) : (
                            <>
                              <UnstyledButton
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startGlobalValueEdit(variable.id, variable.equation);
                                }}
                                title="Edit value"
                              >
                                <Code style={{ fontSize: '0.7rem' }}>{variable.equation}</Code>
                              </UnstyledButton>
                              <ActionIcon
                                size="sm"
                                color="gray"
                                variant="subtle"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  startGlobalValueEdit(variable.id, variable.equation);
                                }}
                                title="Edit value"
                              >
                                <IconPencil size={14} />
                              </ActionIcon>
                            </>
                          )}
                          <ActionIcon
                            size="sm"
                            color="red"
                            variant="subtle"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteGlobalVariable(variable.id);
                            }}
                            title="Delete variable"
                          >
                            <IconTrash size={14} />
                          </ActionIcon>
                        </Group>
                      </Paper>
                    ))}
                  </Stack>
                </ScrollArea>
                {editingGlobalId ? (
                  <Text size="xs" c="dimmed">
                    Press Enter to save or Esc to cancel value edits.
                  </Text>
                ) : null}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {activeSimulationMode === 'vensim' && importedVensim && (
          <Accordion.Item value="vensim-compat">
            <Accordion.Control>
              <Group gap="xs">
                <IconAlertCircle size={18} />
                <Text fw={600}>Vensim Compatibility</Text>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Paper p="sm" withBorder>
                <Stack gap="xs">
                  <Text size="sm">
                    <strong>Tier:</strong> {importedVensim.capabilities.tier}
                  </Text>
                  <Text size="sm">
                    <strong>Unsupported:</strong> {importedVensim.capabilities.unsupported.length || 0}
                  </Text>
                  <Text size="sm">
                    <strong>Partial:</strong> {importedVensim.capabilities.partial.length || 0}
                  </Text>
                  {importedVensim.model_view.time_settings && (
                    <Text size="sm">
                      <strong>Time:</strong>{' '}
                      {[
                        importedVensim.model_view.time_settings.initial_time != null
                          ? `start=${importedVensim.model_view.time_settings.initial_time}`
                          : null,
                        importedVensim.model_view.time_settings.final_time != null
                          ? `stop=${importedVensim.model_view.time_settings.final_time}`
                          : null,
                        importedVensim.model_view.time_settings.time_step != null
                          ? `dt=${importedVensim.model_view.time_settings.time_step}`
                          : null,
                        importedVensim.model_view.time_settings.saveper != null
                          ? `saveper=${importedVensim.model_view.time_settings.saveper}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </Text>
                  )}
                  {importedVensim.capabilities.detected_functions.length > 0 && (
                    <Text size="sm">
                      <strong>Detected functions:</strong> {importedVensim.capabilities.detected_functions.slice(0, 8).join(', ')}
                      {importedVensim.capabilities.detected_functions.length > 8 && '…'}
                    </Text>
                  )}
                  {importedVensim.model_view.dependency_graph && (
                    <Text size="sm">
                      <strong>Graph:</strong> auto-generated dependency graph ({importedVensim.model_view.dependency_graph.edges.length} edges)
                    </Text>
                  )}
                </Stack>
              </Paper>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {activeSimulationMode === 'vensim' && importedVensim && (
          <Accordion.Item value="vensim-vars">
            <Accordion.Control>
              <Group gap="xs">
                <IconCode size={18} />
                <Text fw={600}>Vensim Variables</Text>
                <Badge size="sm" variant="light" color="gray">
                  {importedVensim.model_view.variables.length}
                </Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <ScrollArea h={300}>
                <Stack gap="xs">
                  {importedVensim.model_view.variables.slice(0, 40).map((v) => (
                    <Paper key={v.name} p="xs" withBorder>
                      <Group gap="xs" mb={v.equation ? 4 : 0}>
                        <Badge size="sm" color="green">
                          {v.kind ?? 'var'}
                        </Badge>
                        <Text size="sm">{v.name}</Text>
                      </Group>
                      {v.equation && <Code block style={{ fontSize: '0.75rem' }}>{v.equation}</Code>}
                    </Paper>
                  ))}
                </Stack>
              </ScrollArea>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        <Accordion.Item value="ai-command">
          <Accordion.Control>
            <Group gap={8} wrap="nowrap">
              <IconSparkles size={16} />
              <Text size="sm" fw={500}>AI Assistant</Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="xs">
              <Textarea
                placeholder="Ask AI to modify the canvas..."
                value={aiCommand}
                onChange={(e) => setAiCommand(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void runAiCommand();
                  }
                }}
                minRows={2}
                maxRows={5}
                size="sm"
              />
              <Button
                onClick={() => void runAiCommand()}
                disabled={isApplyingAi || !aiCommand.trim() || activeSimulationMode === 'vensim'}
                variant="light"
                color="deepPurple"
                size="sm"
              >
                {isApplyingAi ? 'Applying…' : 'Send to AI'}
              </Button>
              {activeSimulationMode === 'vensim' ? (
                <Text size="xs" c="dimmed">
                  AI canvas edits are available in native JSON mode.
                </Text>
              ) : null}
              {activeSimulationMode !== 'vensim' ? (
                <Text size="xs" c="dimmed">
                  AI will ask clarifying questions if your request is ambiguous. See the AI Chat panel in the header for conversation history.
                </Text>
              ) : null}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
      </Stack>
    </div>
  );
}
