import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  Group,
  NumberInput,
  ScrollArea,
  SegmentedControl,
  Stack,
  Text,
} from '@mantine/core';
import { IconCheck, IconPlayerPlay } from '@tabler/icons-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useEditorStore } from '../../state/editorStore';
import type { NodeModel, SimulateResponse } from '../../types/model';

const LINE_COLORS = [
  '#7c3aed',
  '#2563eb',
  '#059669',
  '#d97706',
  '#dc2626',
  '#0891b2',
  '#7c2d12',
  '#4338ca',
];

type TypeFilter = 'all' | 'stock' | 'flow' | 'aux';

/** Convert SimulateResponse series into Recharts row format. */
function toRows(results: SimulateResponse) {
  const time = results.series.time ?? [];
  return time.map((t, i) => {
    const row: Record<string, number> = { time: t };
    for (const [key, values] of Object.entries(results.series)) {
      if (key !== 'time') {
        row[key] = values[i] ?? Number.NaN;
      }
    }
    return row;
  });
}

/** Get the list of plottable variable names from the model (excludes phantom, cloud, text, cld_symbol). */
function getPlottableNodes(nodes: NodeModel[]): { name: string; type: NodeModel['type'] }[] {
  return nodes
    .filter(
      (n): n is NodeModel & { name: string } =>
        n.type !== 'phantom' &&
        n.type !== 'cloud' &&
        n.type !== 'text' &&
        n.type !== 'cld_symbol' &&
        'name' in n,
    )
    .map((n) => ({ name: n.name, type: n.type }));
}

export function SimulationPanel() {
  const simConfig = useEditorStore((s) => s.simConfig);
  const setSimConfig = useEditorStore((s) => s.setSimConfig);
  const runValidate = useEditorStore((s) => s.runValidate);
  const runSimulate = useEditorStore((s) => s.runSimulate);
  const isValidating = useEditorStore((s) => s.isValidating);
  const isSimulating = useEditorStore((s) => s.isSimulating);
  const results = useEditorStore((s) => s.results);
  const model = useEditorStore((s) => s.model);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [visibleVars, setVisibleVars] = useState<Set<string> | null>(null);

  // Get plottable nodes from the model
  const plottableNodes = useMemo(() => getPlottableNodes(model.nodes), [model.nodes]);

  // Get variable names that are actually present in the simulation results
  const resultVarNames = useMemo(() => {
    if (!results) return [];
    return Object.keys(results.series).filter((k) => k !== 'time');
  }, [results]);

  // When results arrive but visibleVars hasn't been set yet, default to showing all
  const effectiveVisible = useMemo(() => {
    if (visibleVars !== null) return visibleVars;
    return new Set(resultVarNames);
  }, [visibleVars, resultVarNames]);

  // Filtered nodes based on type filter tab
  const filteredNodes = useMemo(() => {
    if (typeFilter === 'all') return plottableNodes;
    return plottableNodes.filter((n) => n.type === typeFilter);
  }, [plottableNodes, typeFilter]);

  // Chart rows and visible keys
  const rows = useMemo(() => (results ? toRows(results) : []), [results]);

  const visibleKeys = useMemo(() => {
    return resultVarNames.filter((k) => effectiveVisible.has(k));
  }, [resultVarNames, effectiveVisible]);

  // Stable color assignment: each variable gets a color by its index in resultVarNames
  const colorMap = useMemo(() => {
    const map = new Map<string, string>();
    resultVarNames.forEach((name, i) => {
      map.set(name, LINE_COLORS[i % LINE_COLORS.length]);
    });
    return map;
  }, [resultVarNames]);

  const toggleVar = (name: string) => {
    const next = new Set(effectiveVisible);
    if (next.has(name)) {
      next.delete(name);
    } else {
      next.add(name);
    }
    setVisibleVars(next);
  };

  const selectAll = () => {
    setVisibleVars(new Set(resultVarNames));
  };

  const selectNone = () => {
    setVisibleVars(new Set());
  };

  return (
    <Stack gap={0} h="100%" style={{ overflow: 'hidden' }}>
      {/* Buttons row */}
      <Box px="xs" pt="xs" pb={4}>
        <Group gap={4} grow>
          <Button
            leftSection={<IconCheck size={14} />}
            onClick={() => void runValidate()}
            disabled={isValidating}
            variant="light"
            size="xs"
          >
            {isValidating ? 'Validating...' : 'Validate'}
          </Button>
          <Button
            leftSection={<IconPlayerPlay size={14} />}
            onClick={() => void runSimulate()}
            disabled={isSimulating}
            variant="filled"
            color="violet"
            size="xs"
          >
            {isSimulating ? 'Running...' : 'Simulate'}
          </Button>
        </Group>
      </Box>

      {/* Sim config row */}
      <Box px="xs" pb={6}>
        <Group gap={4} grow>
          <NumberInput
            label="Start"
            value={simConfig.start}
            onChange={(val) => setSimConfig({ start: Number(val) })}
            size="xs"
            styles={{ label: { fontSize: 11 } }}
          />
          <NumberInput
            label="Stop"
            value={simConfig.stop}
            onChange={(val) => setSimConfig({ stop: Number(val) })}
            size="xs"
            styles={{ label: { fontSize: 11 } }}
          />
          <NumberInput
            label="dt"
            value={simConfig.dt}
            onChange={(val) => setSimConfig({ dt: Number(val) })}
            step={0.1}
            size="xs"
            styles={{ label: { fontSize: 11 } }}
          />
        </Group>
      </Box>

      {/* Chart area */}
      <Box px="xs" style={{ minHeight: 200, flex: '1 1 200px' }}>
        {!results ? (
          <Box
            style={{
              height: '100%',
              display: 'grid',
              placeItems: 'center',
              border: '1px dashed #dee2e6',
              borderRadius: 6,
            }}
          >
            <Text size="xs" c="dimmed">
              Run a simulation to see results
            </Text>
          </Box>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="time" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} width={45} />
              <Tooltip />
              {visibleKeys.map((key) => (
                <Line
                  key={key}
                  type="monotone"
                  dataKey={key}
                  dot={false}
                  stroke={colorMap.get(key) ?? '#888'}
                  strokeWidth={1.5}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </Box>

      {/* Variable toggles section */}
      <Box style={{ flex: '0 0 auto', borderTop: '1px solid #e9ecef' }}>
        {/* Type filter tabs */}
        <Box px="xs" pt={6} pb={4}>
          <SegmentedControl
            value={typeFilter}
            onChange={(val) => setTypeFilter(val as TypeFilter)}
            data={[
              { label: 'All', value: 'all' },
              { label: 'Stocks', value: 'stock' },
              { label: 'Flows', value: 'flow' },
              { label: 'Aux', value: 'aux' },
            ]}
            size="xs"
            fullWidth
          />
        </Box>

        {/* Quick toggles */}
        {results && (
          <Group px="xs" pb={4} gap={4}>
            <Text
              size="xs"
              c="blue"
              style={{ cursor: 'pointer' }}
              onClick={selectAll}
            >
              All
            </Text>
            <Text size="xs" c="dimmed">
              |
            </Text>
            <Text
              size="xs"
              c="blue"
              style={{ cursor: 'pointer' }}
              onClick={selectNone}
            >
              None
            </Text>
          </Group>
        )}

        {/* Variable list */}
        <ScrollArea.Autosize mah={200} px="xs" pb="xs">
          <Stack gap={2}>
            {filteredNodes.map((node) => {
              const inResults = resultVarNames.includes(node.name);
              const checked = effectiveVisible.has(node.name);
              const color = colorMap.get(node.name) ?? '#888';
              return (
                <Group
                  key={node.name}
                  gap={6}
                  wrap="nowrap"
                  style={{ opacity: inResults ? 1 : 0.5 }}
                >
                  <Box
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      backgroundColor: color,
                      flexShrink: 0,
                    }}
                  />
                  <Text
                    size="xs"
                    style={{
                      flex: 1,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {node.name}
                  </Text>
                  <Checkbox
                    size="xs"
                    checked={checked}
                    disabled={!inResults}
                    onChange={() => toggleVar(node.name)}
                    styles={{ input: { cursor: 'pointer' } }}
                  />
                </Group>
              );
            })}
            {filteredNodes.length === 0 && (
              <Text size="xs" c="dimmed" ta="center" py="xs">
                No variables of this type
              </Text>
            )}
          </Stack>
        </ScrollArea.Autosize>
      </Box>
    </Stack>
  );
}
