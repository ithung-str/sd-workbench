import { useMemo } from 'react';
import { Stack, Title, Button, TextInput, Textarea, Group, Text, Paper, Alert, Checkbox, NumberInput } from '@mantine/core';
import { IconTrash, IconInfoCircle } from '@tabler/icons-react';
import { collectGlobalVariableUsage } from '../../lib/globalVariableUsage';
import { getStockFlowEquation, toIdentifier } from '../../lib/modelHelpers';
import { useEditorStore } from '../../state/editorStore';
import type { CldLoopDirection, CldSymbol, EdgeModel, LookupNode, NodeModel } from '../../types/model';
import { EquationEditor } from './EquationEditor';
import { buildContextFunctions } from './functionCatalog';
import { LookupEditor } from './LookupEditor';

function endpointLabel(node: NodeModel | undefined, fallback: string): string {
  if (!node) return fallback;
  if (node.type === 'text') return `Text (${node.id})`;
  if (node.type === 'cloud') return `Cloud (${node.id})`;
  if (node.type === 'phantom') return `Phantom (${node.id})`;
  if (node.type === 'cld_symbol') return `${node.name?.trim() || `CLD ${node.symbol}`} (${node.id})`;
  return `${node.label} (${node.name})`;
}

export function InspectorPanel() {
  const selected = useEditorStore((s) => s.selected);
  const model = useEditorStore((s) => s.model);
  const updateNode = useEditorStore((s) => s.updateNode);
  const updateGlobalVariable = useEditorStore((s) => s.updateGlobalVariable);
  const setSelected = useEditorStore((s) => s.setSelected);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const validation = useEditorStore((s) => s.validation);
  const activeSimulationMode = useEditorStore((s) => s.activeSimulationMode);
  const importedVensim = useEditorStore((s) => s.importedVensim);

  const node = useMemo<NodeModel | null>(() => {
    if (!selected || selected.kind !== 'node') return null;
    return model.nodes.find((n) => n.id === selected.id) ?? null;
  }, [selected, model.nodes]);

  const edge = useMemo<EdgeModel | null>(() => {
    if (!selected || selected.kind !== 'edge') return null;
    return model.edges.find((e) => e.id === selected.id) ?? null;
  }, [selected, model.edges]);

  const globalVariable = useMemo(() => {
    if (!selected || selected.kind !== 'global_variable') return null;
    return (model.global_variables ?? []).find((variable) => variable.id === selected.id) ?? null;
  }, [selected, model.global_variables]);

  const globalUsage = useMemo(() => collectGlobalVariableUsage(model), [model]);

  const nodeIssues = node
    ? validation.errors.filter((e) => e.node_id === node.id).concat(validation.warnings.filter((e) => e.node_id === node.id))
    : [];

  const equationVariableNames = useMemo(
    () =>
      model.nodes
        .flatMap((n) => (n.type === 'text' || n.type === 'cloud' || n.type === 'cld_symbol' || n.type === 'phantom' ? [] : [n.name]))
        .concat((model.global_variables ?? []).map((v) => v.name))
        .filter(Boolean),
    [model.nodes, model.global_variables],
  );

  const connectedVariableNames = useMemo(() => {
    if (!node) return [];
    const neighborIds = new Set<string>();
    for (const edgeRow of model.edges) {
      if (edgeRow.source === node.id) neighborIds.add(edgeRow.target);
      if (edgeRow.target === node.id) neighborIds.add(edgeRow.source);
    }
    return model.nodes
      .filter((n) => neighborIds.has(n.id) && n.id !== node.id && n.type !== 'text' && n.type !== 'cloud' && n.type !== 'cld_symbol' && n.type !== 'phantom')
      .flatMap((n) => (n.type === 'text' || n.type === 'cloud' || n.type === 'cld_symbol' || n.type === 'phantom' ? [] : [n.name]))
      .filter(Boolean);
  }, [model.edges, model.nodes, node]);

  const connectedUnits = useMemo(() => {
    if (!node || node.type === 'text' || node.type === 'cloud' || node.type === 'cld_symbol' || node.type === 'phantom') return [];
    const rows: Array<{ id: string; edgeType: 'flow_link' | 'influence'; label: string; name: string; units?: string }> = [];
    for (const edgeRow of model.edges) {
      if (edgeRow.source !== node.id && edgeRow.target !== node.id) continue;
      const otherId = edgeRow.source === node.id ? edgeRow.target : edgeRow.source;
      const other = model.nodes.find((n) => n.id === otherId);
      if (!other || other.type === 'text' || other.type === 'cloud' || other.type === 'cld_symbol' || other.type === 'phantom') continue;
      rows.push({
        id: `${edgeRow.id}-${other.id}`,
        edgeType: edgeRow.type,
        label: other.label,
        name: other.name,
        units: other.units,
      });
    }
    rows.sort((a, b) => {
      const aw = a.edgeType === 'flow_link' ? 0 : 1;
      const bw = b.edgeType === 'flow_link' ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [model.edges, model.nodes, node]);

  const availableFunctions = useMemo(
    () => buildContextFunctions(activeSimulationMode, importedVensim),
    [activeSimulationMode, importedVensim],
  );

  const stockFlowEquation = useMemo(
    () => (node?.type === 'stock' ? getStockFlowEquation(node.id, model) : null),
    [node, model],
  );

  if (!node && !edge && !globalVariable) {
    return (
      <Stack gap="md">
        <Text c="dimmed" size="sm">Select a node, global variable, or connection on the canvas to edit.</Text>
      </Stack>
    );
  }

  if (globalVariable) {
    const usage = globalUsage[globalVariable.id] ?? { stock: [], flow: [], total: 0 };
    return (
      <Stack gap="md">
        <Title order={3} size="h4">Global Variable</Title>
        <TextInput
          label="Name"
          value={globalVariable.name}
          onChange={(e) => updateGlobalVariable(globalVariable.id, { name: e.target.value })}
        />
        <TextInput
          label="Value"
          value={globalVariable.equation}
          onChange={(e) => updateGlobalVariable(globalVariable.id, { equation: e.target.value })}
        />
        <Paper p="sm" withBorder>
          <Stack gap="xs">
            <Text size="sm" fw={600} c="dimmed">Used by Stocks ({usage.stock.length})</Text>
            {usage.stock.length === 0 ? (
              <Text size="sm" c="dimmed">No stock equations currently reference this global.</Text>
            ) : (
              usage.stock.map((item) => (
                <Button key={item.id} variant="subtle" justify="flex-start" onClick={() => setSelected({ kind: 'node', id: item.id })}>
                  {item.label} ({item.name})
                </Button>
              ))
            )}
          </Stack>
        </Paper>
        <Paper p="sm" withBorder>
          <Stack gap="xs">
            <Text size="sm" fw={600} c="dimmed">Used by Flows ({usage.flow.length})</Text>
            {usage.flow.length === 0 ? (
              <Text size="sm" c="dimmed">No flow equations currently reference this global.</Text>
            ) : (
              usage.flow.map((item) => (
                <Button key={item.id} variant="subtle" justify="flex-start" onClick={() => setSelected({ kind: 'node', id: item.id })}>
                  {item.label} ({item.name})
                </Button>
              ))
            )}
          </Stack>
        </Paper>
      </Stack>
    );
  }

  if (edge) {
    const sourceNode = model.nodes.find((n) => n.id === edge.source);
    const targetNode = model.nodes.find((n) => n.id === edge.target);
    return (
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={3} size="h4">Connection</Title>
          <Button leftSection={<IconTrash size={16} />} color="red" variant="light" size="xs" onClick={deleteSelected}>
            Disconnect
          </Button>
        </Group>
        <TextInput label="Type" value={edge.type} readOnly />
        <TextInput label="Source" value={endpointLabel(sourceNode, edge.source)} readOnly />
        <TextInput label="Target" value={endpointLabel(targetNode, edge.target)} readOnly />
        <Text c="dimmed" size="sm">Click any line, then use "Disconnect" to remove only that connection.</Text>
      </Stack>
    );
  }

  if (!node) {
    return null;
  }

  if (node.type === 'text') {
    return (
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={3} size="h4">Text Annotation</Title>
          <Button leftSection={<IconTrash size={16} />} color="red" variant="light" size="xs" onClick={deleteSelected}>
            Delete
          </Button>
        </Group>
        <Textarea
          label="Text"
          value={node.text}
          onChange={(e) => updateNode(node.id, { text: e.target.value } as Partial<NodeModel>)}
          rows={5}
        />
      </Stack>
    );
  }

  if (node.type === 'cloud') {
    return (
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={3} size="h4">Cloud</Title>
          <Button leftSection={<IconTrash size={16} />} color="red" variant="light" size="xs" onClick={deleteSelected}>
            Delete
          </Button>
        </Group>
        <Alert icon={<IconInfoCircle size={16} />} color="blue" variant="light">
          Cloud nodes represent external sources or sinks for flows.
        </Alert>
      </Stack>
    );
  }

  if (node.type === 'phantom') {
    return null;
  }

  if (node.type === 'cld_symbol') {
    const cldChoices: Array<{ symbol: CldSymbol; label: string }> = [
      { symbol: '+', label: '+' },
      { symbol: '-', label: '-' },
      { symbol: '||', label: '||' },
      { symbol: 'R', label: 'R' },
      { symbol: 'B', label: 'B' },
    ];
    const directionChoices: Array<{ direction: CldLoopDirection; label: string }> = [
      { direction: 'clockwise', label: '↻ Clockwise' },
      { direction: 'counterclockwise', label: '↺ Counterclockwise' },
    ];
    const activeDirection = node.loop_direction ?? (node.symbol === 'B' ? 'counterclockwise' : 'clockwise');
    return (
      <Stack gap="md">
        <Group justify="space-between">
          <Title order={3} size="h4">CLD Symbol</Title>
          <Button leftSection={<IconTrash size={16} />} color="red" variant="light" size="xs" onClick={deleteSelected}>
            Delete
          </Button>
        </Group>
        <Text size="sm" c="dimmed">
          CLD symbols are annotation-only and excluded from simulation variables.
        </Text>
        <TextInput
          label="Name"
          placeholder="Optional symbol name"
          value={node.name ?? ''}
          onChange={(e) => updateNode(node.id, { name: e.target.value || undefined } as Partial<NodeModel>)}
        />
        <Group gap="xs">
          {cldChoices.map(({ symbol, label }) => (
            <Button
              key={symbol}
              size="xs"
              variant={node.symbol === symbol ? 'filled' : 'light'}
              onClick={() => updateNode(node.id, { symbol } as Partial<NodeModel>)}
            >
              {label}
            </Button>
          ))}
        </Group>
        {(node.symbol === 'R' || node.symbol === 'B') && (
          <Group gap="xs">
            {directionChoices.map(({ direction, label }) => (
              <Button
                key={direction}
                size="xs"
                variant={activeDirection === direction ? 'filled' : 'light'}
                onClick={() => updateNode(node.id, { loop_direction: direction } as Partial<NodeModel>)}
              >
                {label}
              </Button>
            ))}
          </Group>
        )}
      </Stack>
    );
  }

  return (
    <Stack gap="xs">
      <Group justify="space-between">
        <Title order={3} size="h4">Selected Node</Title>
        <Button leftSection={<IconTrash size={16} />} color="red" variant="light" size="xs" onClick={deleteSelected}>
          Delete
        </Button>
      </Group>

      <TextInput
        label="Name (identifier)"
        description="Used in equations. Letters, digits, underscores only."
        size="xs"
        value={node.name}
        onChange={(e) => updateNode(node.id, { name: toIdentifier(e.target.value) })}
      />

      <TextInput
        label="Label (display)"
        size="xs"
        value={node.label}
        onChange={(e) => {
          const label = e.target.value;
          const patch: Partial<NodeModel> = { label };
          // Auto-sync name if it matches the old label's identifier form
          if (node.name === toIdentifier(node.label)) {
            patch.name = toIdentifier(label);
          }
          updateNode(node.id, patch);
        }}
      />

      <TextInput
        label="Units"
        size="xs"
        value={node.units ?? ''}
        onChange={(e) => updateNode(node.id, { units: e.target.value || undefined })}
      />

      {connectedUnits.length > 0 && (
        <Group gap={4} align="center" wrap="wrap">
          <Text size="xs" c="dimmed" fw={600}>Connected:</Text>
          {connectedUnits.map((row) => (
            <Text key={row.id} size="xs" c={row.units ? undefined : 'dimmed'} style={{ background: '#f4f3f8', borderRadius: 4, padding: '1px 6px' }}>
              {row.label}{row.units ? ` (${row.units})` : ''}
            </Text>
          ))}
          {!node.units && connectedUnits.find((r) => r.units) && (
            <Button
              size="compact-xs"
              variant="subtle"
              onClick={() => updateNode(node.id, { units: connectedUnits.find((r) => r.units)?.units } as Partial<NodeModel>)}
            >
              Use unit
            </Button>
          )}
        </Group>
      )}

      {node.type === 'stock' && (
        <>
          {stockFlowEquation && (
            <div>
              <Text size="xs" fw={600} c="dimmed">d(Stock)/dt</Text>
              <Text size="xs" ff="monospace" style={{ background: '#f4f3f8', borderRadius: 4, padding: '4px 8px' }}>{stockFlowEquation}</Text>
            </div>
          )}
          <TextInput
            label="Initial Value"
            size="xs"
            value={String(node.initial_value)}
            onChange={(e) => {
              const v = e.target.value;
              const parsed = Number(v);
              updateNode(node.id, { initial_value: Number.isFinite(parsed) && v.trim() !== '' ? parsed : v } as Partial<NodeModel>);
            }}
          />
          <Group grow>
            <NumberInput
              label="Min Value"
              size="xs"
              placeholder="No min"
              value={node.min_value ?? ''}
              onChange={(value) => updateNode(node.id, { min_value: value === '' ? undefined : Number(value) } as Partial<NodeModel>)}
            />
            <NumberInput
              label="Max Value"
              size="xs"
              placeholder="No max"
              value={node.max_value ?? ''}
              onChange={(value) => updateNode(node.id, { max_value: value === '' ? undefined : Number(value) } as Partial<NodeModel>)}
            />
          </Group>
          <Group gap="md">
            <Checkbox
              label="Non-negative"
              checked={!!node.non_negative}
              onChange={(e) => updateNode(node.id, { non_negative: e.currentTarget.checked || undefined } as Partial<NodeModel>)}
              size="xs"
            />
            <Checkbox
              label="Show sparkline on canvas"
              checked={!!node.show_graph}
              onChange={(e) => updateNode(node.id, { show_graph: e.currentTarget.checked } as Partial<NodeModel>)}
              size="xs"
            />
          </Group>
        </>
      )}

      {node.type !== 'lookup' && node.type !== 'stock' && (
        <EquationEditor
          value={node.equation}
          onChange={(equation) => updateNode(node.id, { equation })}
          variableNames={equationVariableNames}
          connectedVariableNames={connectedVariableNames}
          availableFunctions={availableFunctions}
        />
      )}

      {node.type === 'stock' && !stockFlowEquation && (
        <EquationEditor
          value={node.equation}
          onChange={(equation) => updateNode(node.id, { equation })}
          variableNames={equationVariableNames}
          connectedVariableNames={connectedVariableNames}
          availableFunctions={availableFunctions}
        />
      )}

      {node.type === 'lookup' && (
        <LookupEditor node={node as LookupNode} onChange={(patch) => updateNode(node.id, patch)} />
      )}

      {node.type === 'flow' && (
        <>
          <Group grow>
            <NumberInput
              label="Min Value"
              size="xs"
              placeholder="No min"
              value={node.min_value ?? ''}
              onChange={(value) => updateNode(node.id, { min_value: value === '' ? undefined : Number(value) } as Partial<NodeModel>)}
            />
            <NumberInput
              label="Max Value"
              size="xs"
              placeholder="No max"
              value={node.max_value ?? ''}
              onChange={(value) => updateNode(node.id, { max_value: value === '' ? undefined : Number(value) } as Partial<NodeModel>)}
            />
          </Group>
          <Checkbox
            label="Non-negative"
            checked={!!node.non_negative}
            onChange={(e) => updateNode(node.id, { non_negative: e.currentTarget.checked || undefined } as Partial<NodeModel>)}
            size="xs"
          />
        </>
      )}

      {nodeIssues.length > 0 && (
        <Stack gap="xs">
          {nodeIssues.map((issue, idx) => (
            <Alert key={`${issue.code}-${idx}`} color={issue.severity === 'error' ? 'red' : 'orange'} variant="light">
              <Text size="sm" fw={600}>{issue.code}:</Text>
              <Text size="sm">{issue.message}</Text>
            </Alert>
          ))}
        </Stack>
      )}
    </Stack>
  );
}
