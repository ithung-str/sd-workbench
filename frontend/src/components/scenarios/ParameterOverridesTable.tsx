import {
  ActionIcon,
  Group,
  NumberInput,
  Select,
  Stack,
  Table,
  Text,
  Tooltip,
} from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';

export type VariableOption = {
  value: string;
  label: string;
  group: string;
  baseValue: string;
};

type ParameterOverridesTableProps = {
  params: Record<string, number | string>;
  variableOptions: VariableOption[];
  onUpdateParam: (key: string, value: number) => void;
  onRemoveParam: (key: string) => void;
  onAddParam: (key: string) => void;
};

function numericValue(value: number | string | undefined): number | '' {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : '';
  }
  return '';
}

export function ParameterOverridesTable({
  params,
  variableOptions,
  onUpdateParam,
  onRemoveParam,
  onAddParam,
}: ParameterOverridesTableProps) {
  const paramEntries = Object.entries(params);
  const existingNames = new Set(paramEntries.map(([k]) => k));

  // Build lookup for base values and labels
  const optionsByName = new Map(variableOptions.map((o) => [o.value, o]));

  // Build grouped data for Select, filtering out already-added params
  const selectData = (() => {
    const groups: Record<string, Array<{ value: string; label: string }>> = {};
    for (const opt of variableOptions) {
      if (existingNames.has(opt.value)) continue;
      if (!groups[opt.group]) groups[opt.group] = [];
      groups[opt.group].push({ value: opt.value, label: opt.label });
    }
    return Object.entries(groups).map(([group, items]) => ({ group, items }));
  })();

  return (
    <Stack gap="xs">
      <Text fw={600} size="sm">
        Parameter Overrides
      </Text>

      {paramEntries.length > 0 && (
        <Table striped withTableBorder>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>Variable</Table.Th>
              <Table.Th w={100}>Base</Table.Th>
              <Table.Th w={140}>Override</Table.Th>
              <Table.Th w={40} />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {paramEntries.map(([key, value]) => {
              const opt = optionsByName.get(key);
              return (
                <Table.Tr key={key}>
                  <Table.Td>
                    <Text size="sm" fw={500}>
                      {opt?.label ?? key}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Tooltip label={opt?.baseValue ?? 'unknown'} multiline w={280}>
                      <Text size="xs" c="dimmed" truncate style={{ maxWidth: 100 }}>
                        {opt?.baseValue ?? '—'}
                      </Text>
                    </Tooltip>
                  </Table.Td>
                  <Table.Td>
                    <NumberInput
                      size="xs"
                      value={numericValue(value)}
                      onChange={(next) =>
                        onUpdateParam(key, next === '' ? 0 : Number(next))
                      }
                      style={{ maxWidth: 140 }}
                    />
                  </Table.Td>
                  <Table.Td>
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      color="red"
                      onClick={() => onRemoveParam(key)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      )}

      {paramEntries.length === 0 && (
        <Text size="sm" c="dimmed">
          No parameter overrides yet.
        </Text>
      )}

      <Group>
        <Select
          placeholder="Add parameter override..."
          searchable
          data={selectData}
          onChange={(value) => value && onAddParam(value)}
          value={null}
          clearable
          size="xs"
          style={{ flex: 1 }}
          nothingFoundMessage="No variables available"
        />
      </Group>
    </Stack>
  );
}
