import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Menu,
  ScrollArea,
  Table,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCheck,
  IconChevronDown,
  IconChevronUp,
  IconLayoutDistributeHorizontal,
  IconMapPin,
  IconPlus,
  IconSelector,
  IconTrash,
} from '@tabler/icons-react';
import { getConnectedNames, getEquationVariableNames, getStockFlowEquation, toIdentifier } from '../../lib/modelHelpers';
import { useEditorStore } from '../../state/editorStore';
import { buildContextFunctions } from '../inspector/functionCatalog';
import { EquationEditor } from '../inspector/EquationEditor';
import { EquationDisplay } from './EquationDisplay';
import type { NodeModel, StockNode, ValidationIssue } from '../../types/model';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TypeFilter = 'stock' | 'flow' | 'aux' | 'lookup' | 'global';
type SortField = 'name' | 'type' | 'units';
type SortDir = 'asc' | 'desc';

type FormulaRow = {
  id: string;
  name: string;
  label: string;
  type: TypeFilter;
  equation: string;
  initialValue?: number | string;
  units: string;
  connectedVariableNames: string[];
  issues: ValidationIssue[];
  stockFlowEquation: string | null;
  geo_x?: number;
  geo_y?: number;
};

const TYPE_COLORS: Record<TypeFilter, string> = {
  stock: 'blue',
  flow: 'violet',
  aux: 'green',
  lookup: 'orange',
  global: 'gray',
};

const TYPE_DISPLAY_NAMES: Record<TypeFilter, string> = {
  stock: 'stock',
  flow: 'flow',
  aux: 'variable',
  lookup: 'lookup',
  global: 'global',
};

const ALL_TYPES: TypeFilter[] = ['stock', 'flow', 'aux', 'lookup', 'global'];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function FormulaPage() {
  // Store selectors
  const model = useEditorStore((s) => s.model);
  const validation = useEditorStore((s) => s.validation);
  const updateNode = useEditorStore((s) => s.updateNode);
  const updateGlobalVariable = useEditorStore((s) => s.updateGlobalVariable);
  const addNode = useEditorStore((s) => s.addNode);
  const addGlobalVariable = useEditorStore((s) => s.addGlobalVariable);
  const setSelected = useEditorStore((s) => s.setSelected);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const selected = useEditorStore((s) => s.selected);
  const addEdge = useEditorStore((s) => s.addEdge);
  const autoOrganize = useEditorStore((s) => s.autoOrganize);
  const activeSimulationMode = useEditorStore((s) => s.activeSimulationMode);
  const importedVensim = useEditorStore((s) => s.importedVensim);

  // Local state
  const [activeFilters, setActiveFilters] = useState<Set<TypeFilter>>(new Set(ALL_TYPES));
  const [sortField, setSortField] = useState<SortField>('type');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<'name' | 'units' | null>(null);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [fieldDraft, setFieldDraft] = useState('');

  // Refs
  const tableRef = useRef<HTMLDivElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Derived data
  const equationVariableNames = useMemo(() => getEquationVariableNames(model), [model]);

  const availableFunctions = useMemo(
    () => buildContextFunctions(activeSimulationMode, importedVensim),
    [activeSimulationMode, importedVensim],
  );

  const makeConnectHandler = useCallback(
    (nodeId: string) => (variableName: string) => {
      const sourceNode = model.nodes.find(
        (n) => n.type !== 'text' && n.type !== 'cloud' && n.type !== 'cld_symbol' && 'name' in n && n.name === variableName,
      );
      if (!sourceNode) return;
      const exists = model.edges.some(
        (e) => (e.source === sourceNode.id && e.target === nodeId) || (e.source === nodeId && e.target === sourceNode.id),
      );
      if (exists) return;
      addEdge({ id: `e_${Date.now()}`, type: 'influence', source: sourceNode.id, target: nodeId });
    },
    [model.nodes, model.edges, addEdge],
  );

  const rows = useMemo<FormulaRow[]>(() => {
    const nodeRows: FormulaRow[] = model.nodes
      .filter(
        (n): n is Extract<NodeModel, { type: 'stock' | 'flow' | 'aux' | 'lookup' }> =>
          n.type === 'stock' || n.type === 'flow' || n.type === 'aux' || n.type === 'lookup',
      )
      .map((n) => ({
        id: n.id,
        name: n.name,
        label: n.label,
        type: n.type as TypeFilter,
        equation: n.equation,
        initialValue: n.type === 'stock' ? (n as StockNode).initial_value : undefined,
        units: n.units ?? '',
        connectedVariableNames: getConnectedNames(n.id, model),
        issues: [
          ...(validation?.errors?.filter((e) => e.node_id === n.id) ?? []),
          ...(validation?.warnings?.filter((w) => w.node_id === n.id) ?? []),
        ],
        stockFlowEquation: n.type === 'stock' ? getStockFlowEquation(n.id, model) : null,
        geo_x: n.type === 'stock' ? (n as StockNode).geo_x : undefined,
        geo_y: n.type === 'stock' ? (n as StockNode).geo_y : undefined,
      }));

    const globalRows: FormulaRow[] = (model.global_variables ?? []).map((g) => ({
      id: g.id,
      name: g.name,
      label: g.name,
      type: 'global' as const,
      equation: g.equation,
      units: g.units ?? '',
      connectedVariableNames: [],
      issues: [],
      stockFlowEquation: null,
    }));

    return [...nodeRows, ...globalRows];
  }, [model, validation]);

  const filteredSortedRows = useMemo(() => {
    const filtered = rows.filter((r) => activeFilters.has(r.type));
    return filtered.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'type') {
        const ai = ALL_TYPES.indexOf(a.type);
        const bi = ALL_TYPES.indexOf(b.type);
        if (ai !== bi) return (ai - bi) * dir;
        return a.name.localeCompare(b.name) * dir;
      }
      const av = a[sortField] ?? '';
      const bv = b[sortField] ?? '';
      return av.localeCompare(bv) * dir;
    });
  }, [rows, activeFilters, sortField, sortDir]);

  // Handlers
  const toggleFilter = (type: TypeFilter) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(type)) {
        if (next.size > 1) next.delete(type);
      } else {
        next.add(type);
      }
      return next;
    });
  };

  const cycleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const handleAddPrimitive = (type: TypeFilter) => {
    if (type === 'global') {
      addGlobalVariable();
      // Global variable doesn't set `selected`, find the latest one
      const globals = useEditorStore.getState().model.global_variables ?? [];
      const last = globals[globals.length - 1];
      if (last) setEditingId(last.id);
    } else {
      addNode(type);
      const sel = useEditorStore.getState().selected;
      if (sel && sel.kind === 'node') setEditingId(sel.id);
    }
  };

  const handleDelete = (row: FormulaRow) => {
    if (row.type === 'global') {
      setSelected({ kind: 'global_variable', id: row.id });
    } else {
      setSelected({ kind: 'node', id: row.id });
    }
    // deleteSelected reads from selected, need a tick for state to propagate
    setTimeout(() => {
      useEditorStore.getState().deleteSelected();
      if (editingId === row.id) setEditingId(null);
    }, 0);
  };

  const startFieldEdit = (rowId: string, field: 'name' | 'units', currentValue: string) => {
    setEditingFieldId(rowId);
    setEditingField(field);
    setFieldDraft(currentValue);
  };

  const commitFieldEdit = (row: FormulaRow) => {
    if (!editingField) return;
    const value = fieldDraft.trim();
    if (editingField === 'name' && value) {
      if (row.type === 'global') {
        updateGlobalVariable(row.id, { name: toIdentifier(value) });
      } else {
        updateNode(row.id, { name: toIdentifier(value), label: value });
      }
    } else if (editingField === 'units') {
      if (row.type === 'global') {
        updateGlobalVariable(row.id, { units: value || undefined });
      } else {
        updateNode(row.id, { units: value || undefined });
      }
    }
    setEditingFieldId(null);
    setEditingField(null);
  };

  const cancelFieldEdit = () => {
    setEditingFieldId(null);
    setEditingField(null);
  };

  const handleImportCoordsCsv = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) return;
      // Skip header row
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',').map((c) => c.trim());
        if (cols.length < 3) continue;
        const name = cols[0];
        const geoX = parseFloat(cols[1]);
        const geoY = parseFloat(cols[2]);
        if (!name || !Number.isFinite(geoX) || !Number.isFinite(geoY)) continue;
        const node = model.nodes.find(
          (n) => n.type === 'stock' && n.name === name,
        );
        if (node) updateNode(node.id, { geo_x: geoX, geo_y: geoY } as Partial<NodeModel>);
      }
    };
    reader.readAsText(file);
  };

  // Click-outside to close equation editor
  useEffect(() => {
    if (!editingId) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      // Don't close if clicking inside suggestion list or the editing row
      if (target.closest('[data-editing-row]') || target.closest('[data-equation-suggestions]')) return;
      setEditingId(null);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [editingId]);

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return <IconSelector size={14} style={{ opacity: 0.3 }} />;
    return sortDir === 'asc' ? <IconChevronUp size={14} /> : <IconChevronDown size={14} />;
  };

  const contentBody = (
        <div className="formula-page" style={{ padding: '16px 24px', height: '100%', overflow: 'auto' }}>
          {/* Toolbar */}
          <Group justify="space-between" mb="sm">
            <Group gap={6}>
              {ALL_TYPES.map((type) => (
                <Button
                  key={type}
                  size="compact-xs"
                  variant={activeFilters.has(type) ? 'light' : 'subtle'}
                  color={activeFilters.has(type) ? TYPE_COLORS[type] : 'gray'}
                  onClick={() => toggleFilter(type)}
                  style={{ textTransform: 'capitalize' }}
                >
                  {TYPE_DISPLAY_NAMES[type]}
                </Button>
              ))}
            </Group>

            <Group gap={6}>
              <Tooltip label="Import coordinates CSV (name,geo_x,geo_y)" withArrow>
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => csvInputRef.current?.click()}>
                  <IconMapPin size={16} />
                </ActionIcon>
              </Tooltip>
              <input
                ref={csvInputRef}
                type="file"
                accept=".csv"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleImportCoordsCsv(file);
                  e.target.value = '';
                }}
              />
              <Tooltip label="Auto-organize nodes on canvas" withArrow>
                <ActionIcon variant="subtle" color="gray" size="sm" onClick={autoOrganize}>
                  <IconLayoutDistributeHorizontal size={16} />
                </ActionIcon>
              </Tooltip>
              <Menu shadow="sm" width={160}>
                <Menu.Target>
                  <ActionIcon variant="light" color="violet" size="sm">
                    <IconPlus size={16} />
                  </ActionIcon>
                </Menu.Target>
                <Menu.Dropdown>
                  {ALL_TYPES.map((type) => (
                    <Menu.Item key={type} onClick={() => handleAddPrimitive(type)}>
                      <Group gap="xs">
                        <Text size="xs" c={TYPE_COLORS[type]} fw={500} style={{ textTransform: 'capitalize' }}>{TYPE_DISPLAY_NAMES[type]}</Text>
                      </Group>
                    </Menu.Item>
                  ))}
                </Menu.Dropdown>
              </Menu>
            </Group>
          </Group>

          {/* Table */}
          <ScrollArea ref={tableRef}>
            <Table highlightOnHover verticalSpacing={6} horizontalSpacing="sm" styles={{ th: { borderBottom: '1px solid var(--mantine-color-gray-3)', fontWeight: 500, fontSize: '0.75rem', color: 'var(--mantine-color-dimmed)', textTransform: 'uppercase', letterSpacing: '0.04em' } }}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th style={{ width: 180, cursor: 'pointer', userSelect: 'none' }} onClick={() => cycleSort('name')}>
                    <Group gap={4}>Name <SortIcon field="name" /></Group>
                  </Table.Th>
                  <Table.Th style={{ width: 72, cursor: 'pointer', userSelect: 'none' }} onClick={() => cycleSort('type')}>
                    <Group gap={4}>Type <SortIcon field="type" /></Group>
                  </Table.Th>
                  <Table.Th>Equation</Table.Th>
                  <Table.Th style={{ width: 100, cursor: 'pointer', userSelect: 'none' }} onClick={() => cycleSort('units')}>
                    <Group gap={4}>Units <SortIcon field="units" /></Group>
                  </Table.Th>
                  <Table.Th style={{ width: 60 }}>X</Table.Th>
                  <Table.Th style={{ width: 60 }}>Y</Table.Th>
                  <Table.Th style={{ width: 36 }} />
                  <Table.Th style={{ width: 36 }} />
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {filteredSortedRows.length === 0 && (
                  <Table.Tr>
                    <Table.Td colSpan={8}>
                      <Text c="dimmed" ta="center" py="lg">No variables to show. Add one or adjust filters.</Text>
                    </Table.Td>
                  </Table.Tr>
                )}
                {filteredSortedRows.map((row) => (
                  <Table.Tr key={row.id} data-editing-row={editingId === row.id ? '' : undefined} style={{ borderBottom: editingId === row.id ? undefined : '1px solid var(--mantine-color-gray-1)' }}>
                    {/* Name */}
                    <Table.Td style={{ verticalAlign: 'top', paddingTop: 10 }}>
                      {editingFieldId === row.id && editingField === 'name' ? (
                        <TextInput
                          size="xs"
                          variant="unstyled"
                          value={fieldDraft}
                          onChange={(e) => setFieldDraft(e.currentTarget.value)}
                          onBlur={() => commitFieldEdit(row)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitFieldEdit(row);
                            if (e.key === 'Escape') cancelFieldEdit();
                          }}
                          autoFocus
                          styles={{ input: { fontFamily: 'monospace', fontSize: '0.82rem', borderBottom: '1px solid var(--mantine-color-blue-4)' } }}
                        />
                      ) : (
                        <Text
                          size="sm"
                          ff="monospace"
                          style={{ cursor: 'pointer' }}
                          onClick={() => startFieldEdit(row.id, 'name', row.name)}
                        >
                          {row.name || <span style={{ color: '#999' }}>(unnamed)</span>}
                        </Text>
                      )}
                    </Table.Td>

                    {/* Type */}
                    <Table.Td style={{ verticalAlign: 'top', paddingTop: 10 }}>
                      <Text size="xs" c={TYPE_COLORS[row.type]} fw={500} style={{ textTransform: 'capitalize' }}>{TYPE_DISPLAY_NAMES[row.type]}</Text>
                    </Table.Td>

                    {/* Equation */}
                    <Table.Td style={{ position: 'relative' }}>
                      {row.stockFlowEquation ? (
                        <div>
                          <Text size="xs" ff="monospace" c="dimmed" style={{ background: 'var(--mantine-color-gray-1)', padding: '4px 8px', borderRadius: 4, display: 'inline-block' }}>
                            {row.stockFlowEquation}
                          </Text>
                          {row.initialValue !== undefined && editingId === row.id && (
                            <TextInput
                              size="xs"
                              variant="filled"
                              placeholder="Initial value"
                              value={String(row.initialValue)}
                              onChange={(e) =>
                                updateNode(row.id, { initial_value: e.currentTarget.value } as Partial<StockNode>)
                              }
                              mt={4}
                              styles={{ input: { fontFamily: 'monospace', fontSize: '0.82rem' } }}
                            />
                          )}
                        </div>
                      ) : editingId === row.id ? (
                        <div data-editing-row="">
                          <EquationEditor
                            value={row.equation}
                            onChange={(eq) => {
                              if (row.type === 'global') {
                                updateGlobalVariable(row.id, { equation: eq });
                              } else {
                                updateNode(row.id, { equation: eq });
                              }
                            }}
                            variableNames={equationVariableNames}
                            connectedVariableNames={row.connectedVariableNames}
                            availableFunctions={availableFunctions}
                            onConnectVariable={row.type !== 'global' ? makeConnectHandler(row.id) : undefined}
                            showReferencedSummary={false}
                          />
                          {row.type === 'stock' && row.initialValue !== undefined && (
                            <TextInput
                              size="xs"
                              variant="filled"
                              placeholder="Initial value"
                              value={String(row.initialValue)}
                              onChange={(e) =>
                                updateNode(row.id, { initial_value: e.currentTarget.value } as Partial<StockNode>)
                              }
                              mt={4}
                              styles={{ input: { fontFamily: 'monospace', fontSize: '0.82rem' } }}
                            />
                          )}
                        </div>
                      ) : (
                        <div onClick={() => setEditingId(row.id)} style={{ cursor: 'pointer', minHeight: 28 }}>
                          <EquationDisplay
                            equation={row.equation}
                            variableNames={equationVariableNames}
                            connectedVariableNames={row.connectedVariableNames}
                          />
                        </div>
                      )}
                    </Table.Td>

                    {/* Units */}
                    <Table.Td style={{ verticalAlign: 'top', paddingTop: 10 }}>
                      {editingFieldId === row.id && editingField === 'units' ? (
                        <TextInput
                          size="xs"
                          variant="unstyled"
                          value={fieldDraft}
                          onChange={(e) => setFieldDraft(e.currentTarget.value)}
                          onBlur={() => commitFieldEdit(row)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitFieldEdit(row);
                            if (e.key === 'Escape') cancelFieldEdit();
                          }}
                          autoFocus
                          styles={{ input: { fontFamily: 'monospace', fontSize: '0.82rem', borderBottom: '1px solid var(--mantine-color-blue-4)' } }}
                        />
                      ) : (
                        <Text
                          size="sm"
                          ff="monospace"
                          c={row.units ? undefined : 'dimmed'}
                          style={{ cursor: 'pointer' }}
                          onClick={() => startFieldEdit(row.id, 'units', row.units)}
                        >
                          {row.units || '—'}
                        </Text>
                      )}
                    </Table.Td>

                    {/* Geo X */}
                    <Table.Td style={{ verticalAlign: 'top', paddingTop: 10 }}>
                      {row.type === 'stock' ? (
                        <TextInput
                          size="xs"
                          variant="unstyled"
                          placeholder="—"
                          value={row.geo_x != null ? String(row.geo_x) : ''}
                          onChange={(e) => {
                            const v = e.currentTarget.value;
                            const parsed = parseFloat(v);
                            updateNode(row.id, { geo_x: Number.isFinite(parsed) ? parsed : undefined } as Partial<NodeModel>);
                          }}
                          styles={{ input: { fontFamily: 'monospace', fontSize: '0.78rem', textAlign: 'right' } }}
                        />
                      ) : null}
                    </Table.Td>

                    {/* Geo Y */}
                    <Table.Td style={{ verticalAlign: 'top', paddingTop: 10 }}>
                      {row.type === 'stock' ? (
                        <TextInput
                          size="xs"
                          variant="unstyled"
                          placeholder="—"
                          value={row.geo_y != null ? String(row.geo_y) : ''}
                          onChange={(e) => {
                            const v = e.currentTarget.value;
                            const parsed = parseFloat(v);
                            updateNode(row.id, { geo_y: Number.isFinite(parsed) ? parsed : undefined } as Partial<NodeModel>);
                          }}
                          styles={{ input: { fontFamily: 'monospace', fontSize: '0.78rem', textAlign: 'right' } }}
                        />
                      ) : null}
                    </Table.Td>

                    {/* Status */}
                    <Table.Td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 10 }}>
                      <StatusIcon issues={row.issues} />
                    </Table.Td>

                    {/* Delete */}
                    <Table.Td style={{ textAlign: 'center', verticalAlign: 'top', paddingTop: 8 }}>
                      <ActionIcon variant="subtle" color="gray" size="sm" onClick={() => handleDelete(row)}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </ScrollArea>

          <Text size="xs" c="dimmed" mt="xs">
            {filteredSortedRows.length} of {rows.length} variables
          </Text>
        </div>
  );

  return contentBody;
}

// ---------------------------------------------------------------------------
// Status icon sub-component
// ---------------------------------------------------------------------------

function StatusIcon({ issues }: { issues: ValidationIssue[] }) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  if (errors.length > 0) {
    return (
      <Tooltip label={errors.map((e) => e.message).join('; ')} multiline maw={300}>
        <IconAlertCircle size={16} color="var(--mantine-color-red-6)" />
      </Tooltip>
    );
  }
  if (warnings.length > 0) {
    return (
      <Tooltip label={warnings.map((w) => w.message).join('; ')} multiline maw={300}>
        <IconAlertTriangle size={16} color="var(--mantine-color-orange-6)" />
      </Tooltip>
    );
  }
  return <IconCheck size={16} color="var(--mantine-color-green-6)" />;
}
