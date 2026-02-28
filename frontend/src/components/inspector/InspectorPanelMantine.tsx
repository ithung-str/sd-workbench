import { useMemo } from 'react';
import { Stack, Title, Button, TextInput, Group, Text, Paper, Badge, Textarea, Alert } from '@mantine/core';
import { IconTrash, IconInfoCircle } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import type { EdgeModel, LookupNode, NodeModel } from '../../types/model';
import { EquationEditor } from './EquationEditor';
import { LookupEditor } from './LookupEditor';

function endpointLabel(node: NodeModel | undefined, fallback: string): string {
  if (!node) return fallback;
  if (node.type === 'text') return `Text (${node.id})`;
  if (node.type === 'cloud') return `Cloud (${node.id})`;
  return `${node.label} (${node.name})`;
}

export function InspectorPanel() {
  const selected = useEditorStore((s) => s.selected);
  const model = useEditorStore((s) => s.model);
  const updateNode = useEditorStore((s) => s.updateNode);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const validation = useEditorStore((s) => s.validation);

  const node = useMemo<NodeModel | null>(() => {
    if (!selected || selected.kind !== 'node') return null;
    return model.nodes.find((n) => n.id === selected.id) ?? null;
  }, [selected, model.nodes]);

  const edge = useMemo<EdgeModel | null>(() => {
    if (!selected || selected.kind !== 'edge') return null;
    return model.edges.find((e) => e.id === selected.id) ?? null;
  }, [selected, model.edges]);

  const nodeIssues = node
    ? validation.errors.filter((e) => e.node_id === node.id).concat(validation.warnings.filter((e) => e.node_id === node.id))
    : [];

  const equationVariableNames = useMemo(
    () =>
      model.nodes
        .flatMap((n) => (n.type === 'text' || n.type === 'cloud' ? [] : [n.name]))
        .concat((model.global_variables ?? []).map((v) => v.name))
        .filter(Boolean),
    [model.nodes, model.global_variables],
  );

  const connectedVariableNames = useMemo(() => {
    if (!node) return [];
    const neighborIds = new Set<string>();
    for (const edge of model.edges) {
      if (edge.source === node.id) neighborIds.add(edge.target);
      if (edge.target === node.id) neighborIds.add(edge.source);
    }
    return model.nodes
      .filter((n) => neighborIds.has(n.id) && n.id !== node.id && n.type !== 'text' && n.type !== 'cloud')
      .flatMap((n) => (n.type === 'text' || n.type === 'cloud' ? [] : [n.name]))
      .filter(Boolean);
  }, [model.edges, model.nodes, node]);

  const connectedUnits = useMemo(() => {
    if (!node || node.type === 'text' || node.type === 'cloud') return [];
    const rows: Array<{ id: string; edgeType: 'flow_link' | 'influence'; label: string; name: string; units?: string }> = [];
    for (const edge of model.edges) {
      if (edge.source !== node.id && edge.target !== node.id) continue;
      const otherId = edge.source === node.id ? edge.target : edge.source;
      const other = model.nodes.find((n) => n.id === otherId);
      if (!other || other.type === 'text' || other.type === 'cloud') continue;
      rows.push({
        id: `${edge.id}-${other.id}`,
        edgeType: edge.type,
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

  if (!node && !edge) {
    return (
      <Stack gap="md">
        <Title order={3} size="h4">Inspector</Title>
        <Text c="dimmed" size="sm">Select a node or connection on the canvas to edit or disconnect.</Text>
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

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <Title order={3} size="h4">Inspector</Title>
        <Button leftSection={<IconTrash size={16} />} color="red" variant="light" size="xs" onClick={deleteSelected}>
          Delete
        </Button>
      </Group>

      <TextInput
        label="Name"
        value={node.name}
        onChange={(e) => updateNode(node.id, { name: e.target.value })}
      />

      <TextInput
        label="Label"
        value={node.label}
        onChange={(e) => updateNode(node.id, { label: e.target.value })}
      />

      <TextInput
        label="Units"
        value={node.units ?? ''}
        onChange={(e) => updateNode(node.id, { units: e.target.value || undefined })}
      />

      {connectedUnits.length > 0 && (
        <Paper p="sm" withBorder>
          <Stack gap="xs">
            <Group justify="space-between">
              <Text size="sm" fw={600} c="dimmed">Connected units</Text>
              {!node.units && connectedUnits.find((r) => r.units) && (
                <Button
                  size="xs"
                  variant="subtle"
                  onClick={() => updateNode(node.id, { units: connectedUnits.find((r) => r.units)?.units } as Partial<NodeModel>)}
                >
                  Use linked unit
                </Button>
              )}
            </Group>
            <Stack gap={4}>
              {connectedUnits.map((row) => (
                <Paper key={row.id} p="xs" withBorder bg={row.edgeType === 'flow_link' ? 'violet.0' : undefined}>
                  <Group justify="space-between">
                    <Text size="sm">{row.label}</Text>
                    <Text size="sm" fw={600} c={row.units ? 'dark' : 'dimmed'}>
                      {row.units || '(no units)'}
                    </Text>
                  </Group>
                </Paper>
              ))}
            </Stack>
          </Stack>
        </Paper>
      )}

      {node.type === 'stock' && (
        <TextInput
          label="Initial Value"
          value={String(node.initial_value)}
          onChange={(e) => {
            const v = e.target.value;
            const parsed = Number(v);
            updateNode(node.id, { initial_value: Number.isFinite(parsed) && v.trim() !== '' ? parsed : v } as Partial<NodeModel>);
          }}
        />
      )}

      <EquationEditor
        value={node.equation}
        onChange={(equation) => updateNode(node.id, { equation })}
        variableNames={equationVariableNames}
        connectedVariableNames={connectedVariableNames}
      />

      {node.type === 'lookup' && (
        <LookupEditor node={node as LookupNode} onChange={(patch) => updateNode(node.id, patch)} />
      )}

      {node.type === 'flow' && (
        <>
          <TextInput
            label="Source Stock ID"
            value={node.source_stock_id ?? ''}
            onChange={(e) => updateNode(node.id, { source_stock_id: e.target.value || undefined })}
          />
          <TextInput
            label="Target Stock ID"
            value={node.target_stock_id ?? ''}
            onChange={(e) => updateNode(node.id, { target_stock_id: e.target.value || undefined })}
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
