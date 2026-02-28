import { Button, Stack, Title, SimpleGrid, Badge, Group, TextInput, Textarea, Paper, ScrollArea, Alert, Text, Code, Accordion, Switch } from '@mantine/core';
import { IconAlertCircle, IconPlus, IconList, IconSettings, IconSparkles } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import { useUIStore } from '../../state/uiStore';

export function PalettePanel() {
  const addNode = useEditorStore((s) => s.addNode);
  const addGlobalVariable = useEditorStore((s) => s.addGlobalVariable);
  const updateGlobalVariable = useEditorStore((s) => s.updateGlobalVariable);
  const deleteGlobalVariable = useEditorStore((s) => s.deleteGlobalVariable);
  const model = useEditorStore((s) => s.model);
  const activeSimulationMode = useEditorStore((s) => s.activeSimulationMode);
  const importedVensim = useEditorStore((s) => s.importedVensim);
  const aiCommand = useEditorStore((s) => s.aiCommand);
  const setAiCommand = useEditorStore((s) => s.setAiCommand);
  const runAiCommand = useEditorStore((s) => s.runAiCommand);
  const isApplyingAi = useEditorStore((s) => s.isApplyingAi);

  const showFunctionInternals = useUIStore((s) => s.showFunctionInternals);
  const showMinimap = useUIStore((s) => s.showMinimap);
  const toggleFunctionInternals = useUIStore((s) => s.toggleFunctionInternals);
  const toggleMinimap = useUIStore((s) => s.toggleMinimap);

  const getNodeColor = (type: string) => {
    switch (type) {
      case 'stock': return 'blue';
      case 'flow': return 'violet';
      case 'aux': return 'green';
      case 'lookup': return 'orange';
      case 'text': return 'gray';
      case 'cloud': return 'cyan';
      default: return 'gray';
    }
  };

  return (
    <Stack gap="lg">
      <div>
        <Title order={3} size="h4" mb="xs">Workspace</Title>
        <Text size="xs" c="dimmed">Configure your modeling environment</Text>
      </div>

      <Accordion defaultValue={['view-settings', 'elements', 'model-outline']} multiple variant="separated">
        <Accordion.Item value="ai-command">
          <Accordion.Control>
            <Group gap="xs">
              <IconSparkles size={18} />
              <Text fw={600}>AI Canvas Command</Text>
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
                {isApplyingAi ? 'Applying…' : 'Apply with AI'}
              </Button>
              {activeSimulationMode === 'vensim' ? (
                <Text size="xs" c="dimmed">AI canvas edits are available in native JSON mode.</Text>
              ) : null}
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* View Settings Section */}
        <Accordion.Item value="view-settings">
          <Accordion.Control>
            <Group gap="xs">
              <IconSettings size={18} />
              <Text fw={600}>View Settings</Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <Stack gap="sm">
              <Group justify="space-between" wrap="nowrap">
                <div style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>Show function arguments</Text>
                  <Text size="xs" c="dimmed">Display function internals in node labels</Text>
                </div>
                <Switch
                  checked={showFunctionInternals}
                  onChange={toggleFunctionInternals}
                  size="md"
                  color="deepPurple"
                />
              </Group>
              <Group justify="space-between" wrap="nowrap">
                <div style={{ flex: 1 }}>
                  <Text size="sm" fw={500}>Show minimap</Text>
                  <Text size="xs" c="dimmed">Display navigation minimap</Text>
                </div>
                <Switch
                  checked={showMinimap}
                  onChange={toggleMinimap}
                  size="md"
                  color="deepPurple"
                />
              </Group>
            </Stack>
          </Accordion.Panel>
        </Accordion.Item>

        {/* Add Elements Section */}
        <Accordion.Item value="elements">
          <Accordion.Control>
            <Group gap="xs">
              <IconPlus size={18} />
              <Text fw={600}>Add Elements</Text>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            {activeSimulationMode === 'vensim' ? (
              <Alert icon={<IconAlertCircle size={16} />} color="violet" variant="light">
                Imported Vensim mode (read-only for now)
              </Alert>
            ) : (
              <SimpleGrid cols={2} spacing="xs">
                <Button
                  variant="light"
                  color="blue"
                  size="sm"
                  onClick={() => addNode('stock')}
                  styles={{ root: { fontWeight: 500 } }}
                >
                  + Stock
                </Button>
                <Button
                  variant="light"
                  color="deepPurple"
                  size="sm"
                  onClick={() => addNode('flow')}
                  styles={{ root: { fontWeight: 500 } }}
                >
                  + Flow
                </Button>
                <Button
                  variant="light"
                  color="green"
                  size="sm"
                  onClick={() => addNode('aux')}
                  styles={{ root: { fontWeight: 500 } }}
                >
                  + Aux
                </Button>
                <Button
                  variant="light"
                  color="orange"
                  size="sm"
                  onClick={() => addNode('lookup')}
                  styles={{ root: { fontWeight: 500 } }}
                >
                  + Lookup
                </Button>
                <Button
                  variant="light"
                  color="gray"
                  size="sm"
                  onClick={() => addNode('text')}
                  styles={{ root: { fontWeight: 500 } }}
                >
                  + Text
                </Button>
              </SimpleGrid>
            )}
          </Accordion.Panel>
        </Accordion.Item>

        {/* Model Outline Section */}
        <Accordion.Item value="model-outline">
          <Accordion.Control>
            <Group gap="xs">
              <IconList size={18} />
              <Text fw={600}>Model Outline</Text>
              <Badge size="sm" variant="light" color="gray">{model.nodes.length}</Badge>
            </Group>
          </Accordion.Control>
          <Accordion.Panel>
            <ScrollArea h={200}>
              <Stack gap="xs">
                {model.nodes.length === 0 ? (
                  <Text size="sm" c="dimmed" ta="center" py="md">No elements yet</Text>
                ) : (
                  model.nodes.map((node) => (
                    <Paper key={node.id} p="xs" withBorder>
                      <Group gap="xs">
                        <Badge size="sm" color={getNodeColor(node.type)}>
                          {node.type}
                        </Badge>
                        <Text size="sm">
                          {node.type === 'text' ? node.text : node.type === 'cloud' ? 'Cloud' : node.label}
                        </Text>
                      </Group>
                    </Paper>
                  ))
                )}
              </Stack>
            </ScrollArea>
          </Accordion.Panel>
        </Accordion.Item>

        {/* Global Variables Section */}
        {activeSimulationMode !== 'vensim' && (
          <Accordion.Item value="global-vars">
            <Accordion.Control>
              <Group gap="xs">
                <IconSettings size={18} />
                <Text fw={600}>Global Variables</Text>
                <Badge size="sm" variant="light" color="blue">{(model.global_variables ?? []).length}</Badge>
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
                  <Stack gap="sm">
                    {(model.global_variables ?? []).map((variable) => (
                      <Paper key={variable.id} p="sm" withBorder>
                        <Stack gap="xs">
                          <Group justify="space-between">
                            <Badge size="sm" color="blue">global</Badge>
                            <Button variant="light" color="red" size="xs" onClick={() => deleteGlobalVariable(variable.id)}>
                              Delete
                            </Button>
                          </Group>
                          <TextInput
                            label="Name"
                            value={variable.name}
                            onChange={(e) => updateGlobalVariable(variable.id, { name: e.target.value })}
                            size="xs"
                          />
                          <TextInput
                            label="Equation"
                            value={variable.equation}
                            onChange={(e) => updateGlobalVariable(variable.id, { equation: e.target.value })}
                            size="xs"
                          />
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </ScrollArea>
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        )}

        {/* Vensim Compatibility Section */}
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
                  <Text size="sm"><strong>Tier:</strong> {importedVensim.capabilities.tier}</Text>
                  <Text size="sm"><strong>Unsupported:</strong> {importedVensim.capabilities.unsupported.length || 0}</Text>
                  <Text size="sm"><strong>Partial:</strong> {importedVensim.capabilities.partial.length || 0}</Text>
                  {importedVensim.model_view.time_settings && (
                    <Text size="sm">
                      <strong>Time:</strong>{' '}
                      {[
                        importedVensim.model_view.time_settings.initial_time != null ? `start=${importedVensim.model_view.time_settings.initial_time}` : null,
                        importedVensim.model_view.time_settings.final_time != null ? `stop=${importedVensim.model_view.time_settings.final_time}` : null,
                        importedVensim.model_view.time_settings.time_step != null ? `dt=${importedVensim.model_view.time_settings.time_step}` : null,
                        importedVensim.model_view.time_settings.saveper != null ? `saveper=${importedVensim.model_view.time_settings.saveper}` : null,
                      ].filter(Boolean).join(', ')}
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

        {/* Vensim Variables Section */}
        {activeSimulationMode === 'vensim' && importedVensim && (
          <Accordion.Item value="vensim-vars">
            <Accordion.Control>
              <Group gap="xs">
                <IconList size={18} />
                <Text fw={600}>Vensim Variables</Text>
                <Badge size="sm" variant="light" color="gray">{importedVensim.model_view.variables.length}</Badge>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <ScrollArea h={300}>
                <Stack gap="xs">
                  {importedVensim.model_view.variables.slice(0, 40).map((v) => (
                    <Paper key={v.name} p="xs" withBorder>
                      <Group gap="xs" mb={v.equation ? 4 : 0}>
                        <Badge size="sm" color="green">{v.kind ?? 'var'}</Badge>
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
      </Accordion>
    </Stack>
  );
}
