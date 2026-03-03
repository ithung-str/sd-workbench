import { useMemo } from 'react';
import {
  Accordion,
  ColorInput,
  Group,
  NumberInput,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import type { ModelDocument, ScenarioDefinition, StockNode } from '../../types/model';
import { ParameterOverridesTable, type VariableOption } from './ParameterOverridesTable';

type ScenarioEditorPanelProps = {
  scenario: ScenarioDefinition;
  model: ModelDocument;
  onUpdate: (patch: Partial<ScenarioDefinition>) => void;
};

function numericValue(value: number | string | undefined): number | '' {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : '';
  }
  return '';
}

function nodeGroupLabel(type: string): string {
  switch (type) {
    case 'stock': return 'Stocks';
    case 'flow': return 'Flows';
    case 'aux': return 'Auxiliaries';
    case 'lookup': return 'Lookups';
    default: return 'Other';
  }
}

export function ScenarioEditorPanel({ scenario, model, onUpdate }: ScenarioEditorPanelProps) {
  const variableOptions: VariableOption[] = useMemo(() => {
    return model.nodes
      .filter(
        (n) =>
          n.type !== 'text' &&
          n.type !== 'cloud' &&
          n.type !== 'cld_symbol' &&
          n.type !== 'phantom',
      )
      .map((n) => {
        const group = nodeGroupLabel(n.type);
        let baseValue: string;
        if (n.type === 'stock') {
          baseValue = String((n as StockNode).initial_value);
        } else if ('equation' in n) {
          baseValue = (n as { equation: string }).equation || '(no equation)';
        } else {
          baseValue = '—';
        }
        return {
          value: n.name,
          label: `${n.label} (${n.name})`,
          group,
          baseValue,
        };
      });
  }, [model.nodes]);

  const simConfig = scenario.overrides?.sim_config ?? {};

  const handleSimConfigChange = (field: string, value: number | '' | string) => {
    onUpdate({
      overrides: {
        sim_config: {
          ...simConfig,
          [field]: value === '' ? undefined : Number(value),
        },
      },
    });
  };

  const handleAddParam = (key: string) => {
    onUpdate({
      overrides: {
        params: {
          ...(scenario.overrides?.params ?? {}),
          [key]: 0,
        },
      },
    });
  };

  const handleUpdateParam = (key: string, value: number) => {
    onUpdate({
      overrides: {
        params: {
          ...(scenario.overrides?.params ?? {}),
          [key]: value,
        },
      },
    });
  };

  const handleRemoveParam = (key: string) => {
    const params = { ...(scenario.overrides?.params ?? {}) };
    delete params[key];
    onUpdate({ overrides: { params } });
  };

  return (
    <Stack gap="md">
      <Group justify="space-between" align="center">
        <Title order={5}>{scenario.name}</Title>
      </Group>

      <Group grow align="flex-end">
        <TextInput
          label="Name"
          size="sm"
          value={scenario.name}
          onChange={(e) => onUpdate({ name: e.currentTarget.value })}
        />
        <Select
          label="Status"
          size="sm"
          value={scenario.status ?? 'policy'}
          data={[
            { value: 'baseline', label: 'Baseline' },
            { value: 'policy', label: 'Policy' },
            { value: 'draft', label: 'Draft' },
            { value: 'archived', label: 'Archived' },
          ]}
          onChange={(value) =>
            value &&
            onUpdate({
              status: value as 'baseline' | 'policy' | 'draft' | 'archived',
            })
          }
        />
        <ColorInput
          label="Color"
          size="sm"
          value={scenario.color ?? '#d46a00'}
          onChange={(value) => onUpdate({ color: value })}
          format="hex"
          swatches={['#1b6ca8', '#d46a00', '#2f7d32', '#8a2be2', '#d32f2f', '#00838f']}
        />
      </Group>

      <TextInput
        label="Description"
        size="sm"
        value={scenario.description ?? ''}
        onChange={(e) =>
          onUpdate({ description: e.currentTarget.value || undefined })
        }
        placeholder="Optional description..."
      />

      <ParameterOverridesTable
        params={scenario.overrides?.params ?? {}}
        variableOptions={variableOptions}
        onUpdateParam={handleUpdateParam}
        onRemoveParam={handleRemoveParam}
        onAddParam={handleAddParam}
      />

      <Accordion variant="default" chevronPosition="right">
        <Accordion.Item value="sim-config">
          <Accordion.Control>
            <Text size="sm" fw={500}>
              Simulation Config Overrides
            </Text>
          </Accordion.Control>
          <Accordion.Panel>
            <Group grow>
              <NumberInput
                label="Start"
                size="sm"
                value={numericValue(simConfig.start)}
                onChange={(v) => handleSimConfigChange('start', v)}
                placeholder="Default"
              />
              <NumberInput
                label="Stop"
                size="sm"
                value={numericValue(simConfig.stop)}
                onChange={(v) => handleSimConfigChange('stop', v)}
                placeholder="Default"
              />
              <NumberInput
                label="dt"
                size="sm"
                value={numericValue(simConfig.dt)}
                onChange={(v) => handleSimConfigChange('dt', v)}
                placeholder="Default"
              />
              <NumberInput
                label="Return Step"
                size="sm"
                value={numericValue(simConfig.return_step)}
                onChange={(v) => handleSimConfigChange('return_step', v)}
                placeholder="Default"
              />
            </Group>
          </Accordion.Panel>
        </Accordion.Item>
      </Accordion>
    </Stack>
  );
}
