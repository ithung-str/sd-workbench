import { useMemo } from 'react';
import {
  ActionIcon,
  ColorInput,
  Group,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import type { ModelDocument, SensitivityConfig, SensitivityParameterRange, StockNode } from '../../types/model';

type SensitivityEditorPanelProps = {
  config: SensitivityConfig;
  model: ModelDocument;
  onUpdate: (patch: Partial<SensitivityConfig>) => void;
};

function nodeGroupLabel(type: string): string {
  switch (type) {
    case 'stock': return 'Stocks';
    case 'flow': return 'Flows';
    case 'aux': return 'Auxiliaries';
    case 'lookup': return 'Lookups';
    default: return 'Other';
  }
}

export function SensitivityEditorPanel({ config, model, onUpdate }: SensitivityEditorPanelProps) {
  const variableOptions = useMemo(() => {
    return model.nodes
      .filter(
        (n) =>
          n.type !== 'text' &&
          n.type !== 'cloud' &&
          n.type !== 'cld_symbol' &&
          n.type !== 'phantom',
      )
      .map((n) => ({
        value: n.name,
        label: `${n.label} (${n.name})`,
        group: nodeGroupLabel(n.type),
      }));
  }, [model.nodes]);

  const outputOptions = useMemo(() => {
    const unique = new Set<string>();
    for (const n of model.nodes) {
      if (n.type === 'text' || n.type === 'cloud' || n.type === 'cld_symbol' || n.type === 'phantom') continue;
      unique.add(n.name);
    }
    for (const o of model.outputs) {
      unique.add(o);
    }
    return [...unique].map((v) => ({ value: v, label: v }));
  }, [model.nodes, model.outputs]);

  const parameterNames = new Set(config.parameters.map((p) => p.name));
  const addParamOptions = variableOptions.filter((o) => !parameterNames.has(o.value));

  // Build grouped data for Select
  const addParamSelectData = (() => {
    const groups: Record<string, Array<{ value: string; label: string }>> = {};
    for (const opt of addParamOptions) {
      if (!groups[opt.group]) groups[opt.group] = [];
      groups[opt.group].push({ value: opt.value, label: opt.label });
    }
    return Object.entries(groups).map(([group, items]) => ({ group, items }));
  })();

  const handleAddParam = (name: string) => {
    const node = model.nodes.find((n) => 'name' in n && n.name === name);
    let baseValue = 0;
    if (node && node.type === 'stock') {
      const iv = (node as StockNode).initial_value ?? 0;
      baseValue = typeof iv === 'string' ? Number(iv) || 0 : iv;
    } else if (node && 'equation' in node) {
      const parsed = Number((node as { equation: string }).equation);
      if (Number.isFinite(parsed)) baseValue = parsed;
    }
    const low = baseValue * 0.5;
    const high = baseValue === 0 ? 1 : baseValue * 1.5;
    const newParam: SensitivityParameterRange = { name, low, high, steps: 5 };
    onUpdate({ parameters: [...config.parameters, newParam] });
  };

  const handleUpdateParam = (index: number, patch: Partial<SensitivityParameterRange>) => {
    const updated = config.parameters.map((p, i) =>
      i === index ? { ...p, ...patch } : p,
    );
    onUpdate({ parameters: updated });
  };

  const handleRemoveParam = (index: number) => {
    onUpdate({ parameters: config.parameters.filter((_, i) => i !== index) });
  };

  return (
    <Stack gap="md">
      <Title order={5}>{config.name}</Title>

      <Group grow align="flex-end">
        <TextInput
          label="Name"
          size="sm"
          value={config.name}
          onChange={(e) => onUpdate({ name: e.currentTarget.value })}
        />
        <ColorInput
          label="Color"
          size="sm"
          value={config.color ?? '#1b6ca8'}
          onChange={(value) => onUpdate({ color: value })}
          format="hex"
          swatches={['#1b6ca8', '#d46a00', '#2f7d32', '#8a2be2', '#d32f2f', '#00838f']}
        />
      </Group>

      <TextInput
        label="Description"
        size="sm"
        value={config.description ?? ''}
        onChange={(e) => onUpdate({ description: e.currentTarget.value || undefined })}
        placeholder="Optional description..."
      />

      <Group grow align="flex-end">
        <Select
          label="Output Variable"
          size="sm"
          value={config.output}
          onChange={(value) => value && onUpdate({ output: value })}
          data={outputOptions}
          searchable
        />
        <Select
          label="Metric"
          size="sm"
          value={config.metric}
          onChange={(value) =>
            value && onUpdate({ metric: value as SensitivityConfig['metric'] })
          }
          data={[
            { value: 'final', label: 'Final value' },
            { value: 'max', label: 'Maximum' },
            { value: 'min', label: 'Minimum' },
            { value: 'mean', label: 'Mean' },
          ]}
        />
      </Group>

      <div>
        <Text fw={500} size="sm" mb={4}>Analysis Type</Text>
        <SegmentedControl
          size="sm"
          value={config.type}
          onChange={(value) => onUpdate({ type: value as 'oat' | 'monte-carlo' })}
          data={[
            { label: 'OAT (Tornado)', value: 'oat' },
            { label: 'Monte Carlo', value: 'monte-carlo' },
          ]}
        />
      </div>

      {config.type === 'monte-carlo' && (
        <Group grow>
          <NumberInput
            label="Runs"
            size="sm"
            value={config.runs ?? 100}
            min={2}
            onChange={(v) => onUpdate({ runs: Math.max(2, Number(v) || 100) })}
          />
          <NumberInput
            label="Seed"
            size="sm"
            value={config.seed ?? 42}
            onChange={(v) => onUpdate({ seed: Number(v) || 42 })}
          />
        </Group>
      )}

      <Stack gap="xs">
        <Text fw={600} size="sm">Parameters</Text>

        {config.parameters.length > 0 && (
          <Table striped withTableBorder>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>Variable</Table.Th>
                <Table.Th w={90}>Low</Table.Th>
                <Table.Th w={90}>High</Table.Th>
                <Table.Th w={70}>Steps</Table.Th>
                <Table.Th w={40} />
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {config.parameters.map((param, index) => (
                <Table.Tr key={param.name}>
                  <Table.Td>
                    <Text size="sm" fw={500}>{param.name}</Text>
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      value={param.low}
                      onChange={(v) => handleUpdateParam(index, { low: Number(v) || 0 })}
                      style={{ maxWidth: 90 }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      value={param.high}
                      onChange={(v) => handleUpdateParam(index, { high: Number(v) || 0 })}
                      style={{ maxWidth: 90 }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      value={param.steps}
                      min={2}
                      onChange={(v) => handleUpdateParam(index, { steps: Math.max(2, Number(v) || 5) })}
                      style={{ maxWidth: 70 }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      onClick={() => handleRemoveParam(index)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        )}

        {config.parameters.length === 0 && (
          <Text size="sm" c="dimmed">No parameters added yet.</Text>
        )}

        <Select
          placeholder="Add parameter..."
          searchable
          data={addParamSelectData}
          onChange={(value) => value && handleAddParam(value)}
          value={null}
          clearable
          size="xs"
          nothingFoundMessage="No variables available"
        />
      </Stack>
    </Stack>
  );
}
