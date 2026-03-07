import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  ReactFlowProvider,
  applyNodeChanges,
  applyEdgeChanges,
  useReactFlow,
  useViewport,
  type Connection,
  type Edge,
  type Node,
  type NodeChange,
  type EdgeChange,
  type NodeTypes,
  type OnConnectStart,
  type OnConnectEnd,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Box, Button, Group, Select, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconCode, IconDatabase, IconPlus, IconSql, IconTableFilled } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import type { AnalysisNodeType, AnalysisNode as AnalysisNodeT, AnalysisEdge as AnalysisEdgeT, PipelineCheckpoint } from '../../types/model';
import { loadPipelineResults, fetchNodePreview, aiDescribeNode, transformNotebookStream, type TransformNodeDef, type NotebookCell } from '../../lib/api';
import { saveDataTable } from '../../lib/dataTableStorage';
import { buildImportedNotebookGroups } from '../../lib/notebookImportGroups';
import { parseSpreadsheetId, writeSheetData } from '../../lib/googleSheetsApi';
import { layoutImportedNotebookNodes } from '../../lib/notebookImportLayout';
import {
  attachNotebookImportNodeToPlaceholderStage,
  buildNotebookImportPlaceholderStages,
  getNotebookImportPlaceholderGroupId,
  updateNotebookImportPlaceholderStageState,
} from '../../lib/notebookImportPlaceholders';
import { importSpreadsheetTables, isSupportedSpreadsheetFile } from '../../lib/spreadsheetImport';
import { AnalysisToolbar } from './AnalysisToolbar';
import { AnalysisIconStrip, type AnalysisFlyout } from './AnalysisIconStrip';
import { AnalysisFlyoutPanel } from './AnalysisFlyoutPanel';
import { DataSourceNode } from './nodes/DataSourceNode';
import { CodeNode } from './nodes/CodeNode';
import { SqlNode } from './nodes/SqlNode';
import { OutputNode } from './nodes/OutputNode';
import { NoteNode } from './nodes/NoteNode';
import { GroupNode } from './nodes/GroupNode';
import { SheetsExportNode } from './nodes/SheetsExportNode';
import { PublishNode } from './nodes/PublishNode';

const nodeTypes: NodeTypes = {
  data_source: DataSourceNode,
  code: CodeNode,
  sql: SqlNode,
  output: OutputNode,
  note: NoteNode,
  group: GroupNode,
  sheets_export: SheetsExportNode,
  publish: PublishNode,
};

export type RunScope = 'this' | 'upstream' | 'downstream' | 'connected' | 'all' | 'smart';
export type ZoomLevel = 'mini' | 'summary' | 'full';

/** Compute the set of node IDs to run based on scope. */
function computeRunNodeIds(
  nodeId: string,
  scope: RunScope,
  nodes: AnalysisNodeT[],
  edges: AnalysisEdgeT[],
  results?: Record<string, { ok?: boolean }>,
): string[] | undefined {
  if (scope === 'all') return undefined; // run everything

  const allIds = new Set(nodes.map((n) => n.id));
  const childrenOf = new Map<string, string[]>();
  const parentsOf = new Map<string, string[]>();
  for (const id of allIds) {
    childrenOf.set(id, []);
    parentsOf.set(id, []);
  }
  for (const e of edges) {
    childrenOf.get(e.source)?.push(e.target);
    parentsOf.get(e.target)?.push(e.source);
  }

  const collectUp = (id: string, visited: Set<string>) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const p of parentsOf.get(id) ?? []) collectUp(p, visited);
  };
  const collectDown = (id: string, visited: Set<string>) => {
    if (visited.has(id)) return;
    visited.add(id);
    for (const c of childrenOf.get(id) ?? []) collectDown(c, visited);
  };

  if (scope === 'this') return [nodeId];

  if (scope === 'smart') {
    // Run this node + upstream nodes that don't have successful results
    const upstream = new Set<string>();
    collectUp(nodeId, upstream);
    return [...upstream].filter((id) => id === nodeId || !results?.[id]?.ok);
  }

  if (scope === 'upstream') {
    const set = new Set<string>();
    collectUp(nodeId, set);
    return [...set];
  }
  if (scope === 'downstream') {
    const set = new Set<string>();
    collectDown(nodeId, set);
    return [...set];
  }
  // 'connected' = upstream + downstream
  const set = new Set<string>();
  collectUp(nodeId, set);
  collectDown(nodeId, set);
  return [...set];
}

/** Extract column names from a node's result preview. */
function resultColumns(result: any): string[] | undefined {
  if (!result?.ok || !result.preview?.columns) return undefined;
  return result.preview.columns.map((c: any) => typeof c === 'string' ? c : c.key);
}

/** Resolve the effective result for a node: real result > own mock > propagated upstream mock. */
function resolveEffectiveResult(
  nodeId: string,
  nodes: AnalysisNodeT[],
  edges: AnalysisEdgeT[],
  results: Record<string, any>,
  _visited?: Set<string>,
): { result: any; isMock: boolean } | undefined {
  // Real result takes priority
  if (results[nodeId]) return { result: results[nodeId], isMock: false };

  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return undefined;

  // Own mock value
  if (node.mockValue) {
    return {
      result: { ok: true, preview: node.mockValue.preview, shape: node.mockValue.shape, value_kind: node.mockValue.kind, generic_value: node.mockValue.generic_value },
      isMock: true,
    };
  }

  // For output/publish/sheets_export nodes, propagate from single upstream parent
  const visited = _visited ?? new Set<string>();
  if (visited.has(nodeId)) return undefined;
  visited.add(nodeId);

  const parentIds = edges.filter((e) => e.target === nodeId).map((e) => e.source);
  if (parentIds.length === 1) {
    const upstream = resolveEffectiveResult(parentIds[0], nodes, edges, results, visited);
    if (upstream) return { result: upstream.result, isMock: true };
  }

  return undefined;
}

function pipelineNodesToFlow(
  nodes: AnalysisNodeT[],
  edges: AnalysisEdgeT[],
  results: Record<string, any>,
  onUpdate: (nodeId: string, patch: Record<string, unknown>) => void,
  onDelete: (nodeId: string) => void,
  onRunScope: (nodeId: string, scope: RunScope) => void,
  onSaveComponent: (name: string, code: string) => void,
  onToggleGroupCollapse: (groupId: string) => void,
  onSnapshotMock: (nodeId: string) => void,
  onClearMock: (nodeId: string) => void,
  onGenerateMock: (nodeId: string) => void,
  onExportToSheets: (nodeId: string) => void,
  onDuplicate: (nodeId: string) => void,
  onAutoDescribe: (nodeId: string) => void,
  aiDescribingNodeId: string | null,
  pipelineId: string,
  selectedNodeId: string | null,
  zoomLevel: ZoomLevel,
  multiSelectedIds: string[],
): Node[] {
  // Determine which nodes are hidden (inside collapsed groups)
  const collapsedGroupIds = new Set(nodes.filter((n) => n.type === 'group' && n.collapsed).map((n) => n.id));
  const visibleNodes = nodes.filter((n) => !n.parentGroup || !collapsedGroupIds.has(n.parentGroup));

  return visibleNodes.map((n) => {
    // Compute input variable info for code and sql nodes
    const parentIds = edges.filter((e) => e.target === n.id).map((e) => e.source);
    let inputVars: { varName: string; label: string; columns?: string[] }[] = [];
    if ((n.type === 'code' || n.type === 'sql') && parentIds.length > 0) {
      // Use real results or fall back to mock data for column info
      const parentResult = (pid: string) => {
        const resolved = resolveEffectiveResult(pid, nodes, edges, results);
        return resolved ? resultColumns(resolved.result) : undefined;
      };
      if (parentIds.length === 1) {
        inputVars = [{ varName: 'df_in', label: 'DataFrame', columns: parentResult(parentIds[0]) }];
      } else {
        inputVars = parentIds.map((pid, i) => ({
          varName: `df_in${i + 1}`,
          label: 'DataFrame',
          columns: parentResult(pid),
        }));
      }
    }

    // For group nodes, compute child count
    const childCount = n.type === 'group' ? nodes.filter((c) => c.parentGroup === n.id).length : undefined;

    // Resolve effective result (real > mock > propagated)
    const effective = resolveEffectiveResult(n.id, nodes, edges, results);

    const isPort = (n as any)._isPort === true;
    const portLabel = (n as any)._portLabel as string | undefined;

    return {
      id: n.id,
      type: n.type,
      position: { x: n.x, y: n.y },
      style: {
        width: n.w ?? 280,
        height: n.h ?? 200,
        ...(isPort ? { opacity: 0.55, pointerEvents: 'none' as const } : {}),
      },
      className: isPort ? 'analysis-port-node' : undefined,
      data: {
        ...n,
        result: effective?.result,
        selected: n.id === selectedNodeId || multiSelectedIds.includes(n.id),
        zoomLevel,
        inputVars,
        childCount,
        portLabel,
        onUpdate: isPort ? () => {} : (patch: Record<string, unknown>) => onUpdate(n.id, patch),
        onDelete: isPort ? undefined : () => onDelete(n.id),
        onRunScope: isPort ? undefined : (scope: RunScope) => onRunScope(n.id, scope),
        onSaveComponent: n.type === 'code' ? onSaveComponent : undefined,
        onToggleCollapse: n.type === 'group' ? () => onToggleGroupCollapse(n.id) : undefined,
        onSnapshotMock: isPort ? undefined : () => onSnapshotMock(n.id),
        onClearMock: n.mockValue ? () => onClearMock(n.id) : undefined,
        onGenerateMock: n.type === 'data_source' && !isPort ? () => onGenerateMock(n.id) : undefined,
        onExportToSheets: n.type === 'sheets_export' && !isPort ? () => onExportToSheets(n.id) : undefined,
        onDuplicate: isPort ? undefined : () => onDuplicate(n.id),
        onAutoDescribe: isPort ? undefined : () => onAutoDescribe(n.id),
        isAiDescribing: n.id === aiDescribingNodeId,
        pipelineId,
        isMockPreview: effective?.isMock ?? false,
      },
    };
  });
}

function pipelineEdgesToFlow(edges: AnalysisEdgeT[], visibleNodeIds: Set<string>, nodes: AnalysisNodeT[]): Edge[] {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const stageById = new Map(
    nodes
      .filter((node) => node.type === 'group' && node.importedStage)
      .map((node) => [node.id, node]),
  );

  const importedStageRole = (nodeId: string): 'main' | 'branch' | null => {
    const node = nodeById.get(nodeId);
    if (!node) return null;
    if (node.importedStage) return node.stageRole ?? 'main';
    if (node.parentGroup) return stageById.get(node.parentGroup)?.stageRole ?? null;
    return null;
  };

  return edges
    .filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
    .map((e) => {
      const isGroupEdge = e.id.includes('_ge_');
      const imported = e.id.startsWith('nb_edge_') || isGroupEdge;
      const sourceRole = imported ? importedStageRole(e.source) : null;
      const targetRole = imported ? importedStageRole(e.target) : null;
      const onMainPath = sourceRole === 'main' && targetRole === 'main';
      return {
        id: e.id,
        source: e.source,
        target: e.target,
        sourceHandle: e.sourceHandle ?? 'bottom',
        targetHandle: e.targetHandle ?? 'top',
        type: 'smoothstep',
        style: isGroupEdge
          ? {
            stroke: onMainPath ? '#495057' : '#adb5bd',
            strokeWidth: onMainPath ? 2.5 : 1.5,
            opacity: onMainPath ? 0.85 : 0.5,
          }
          : imported
            ? {
              stroke: onMainPath ? '#495057' : '#adb5bd',
              strokeWidth: onMainPath ? 1.5 : 1.05,
              opacity: onMainPath ? 0.9 : 0.55,
            }
            : { stroke: '#868e96', strokeWidth: 1.5 },
      };
    });
}

/** Inner component that has access to useReactFlow. */
function AnalysisCanvas() {
  const pipelines = useEditorStore((s) => s.pipelines);
  const activePipelineId = useEditorStore((s) => s.activePipelineId);
  const updatePipeline = useEditorStore((s) => s.updatePipeline);
  const deletePipeline = useEditorStore((s) => s.deletePipeline);
  const runPipeline = useEditorStore((s) => s.runPipeline);
  const isRunningPipeline = useEditorStore((s) => s.isRunningPipeline);
  const analysisResults = useEditorStore((s) => s.analysisResults);
  const analysisComponents = useEditorStore((s) => s.analysisComponents);
  const saveAnalysisComponent = useEditorStore((s) => s.saveAnalysisComponent);
  const selectedNodeId = useEditorStore((s) => s.selectedAnalysisNodeId);
  const setRightSidebarMode = useEditorStore((s) => s.setRightSidebarMode);

  const setSelectedNodeId = useCallback((id: string | null) => {
    useEditorStore.setState({ selectedAnalysisNodeId: id });
  }, []);

  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;
  const [canvasDragOver, setCanvasDragOver] = useState(false);
  const [activeFlyout, setActiveFlyout] = useState<AnalysisFlyout>(null);

  // Load cached results from backend on mount (if results are empty)
  useEffect(() => {
    if (activePipelineId && Object.keys(analysisResults).length === 0) {
      void loadPipelineResults(activePipelineId).then((cached) => {
        if (Object.keys(cached).length > 0) {
          useEditorStore.setState({ analysisResults: cached });
        }
      });
    }
  }, [activePipelineId]); // eslint-disable-line react-hooks/exhaustive-deps

  const { screenToFlowPosition, fitBounds, fitView: rfFitView } = useReactFlow();
  const { zoom } = useViewport();
  const autoZoomLevel: ZoomLevel = zoom < 0.45 ? 'mini' : zoom < 0.85 ? 'summary' : 'full';
  const [zoomOverride, setZoomOverride] = useState<ZoomLevel | 'auto'>('auto');
  const zoomLevel: ZoomLevel = zoomOverride === 'auto' ? autoZoomLevel : zoomOverride;

  const handleToggleFlyout = useCallback((panel: NonNullable<AnalysisFlyout>) => {
    setActiveFlyout((prev) => (prev === panel ? null : panel));
  }, []);

  /** Create a node at a specific canvas position. */
  const handleAddNodeAtPosition = useCallback(
    (type: AnalysisNodeType, position: { x: number; y: number }, opts?: { tableId?: string; tableName?: string; code?: string; outputMode?: string }) => {
      if (!activePipeline) return;
      const id = `node_${Date.now()}`;
      const newNode: AnalysisNodeT = {
        id,
        type,
        x: position.x,
        y: position.y,
        ...(type === 'data_source' ? { w: 280, h: 200, ...(opts?.tableId ? { data_table_id: opts.tableId, name: opts.tableName ?? '' } : {}) } : {}),
        ...(type === 'code' ? { code: opts?.code ?? '# df_in: input DataFrame from upstream node\n# df_out: output DataFrame to pass downstream\n\ndf_out = df_in\n', w: 600, h: 400 } : {}),
        ...(type === 'sql' ? { sql: '-- Input tables: df_in (single parent) or df_in1, df_in2, ...\n\nSELECT * FROM df_in\n', w: 600, h: 350 } : {}),
        ...(type === 'output' ? { w: 380, h: 320, ...(opts?.outputMode ? { output_mode: opts.outputMode } : {}) } : {}),
        ...(type === 'note' ? { content: '', w: 300, h: 200 } : {}),
        ...(type === 'group' ? { w: 500, h: 400, groupColor: 'blue' } : {}),
        ...(type === 'sheets_export' ? { w: 320, h: 280, sheet_name: 'Sheet1' } : {}),
        ...(type === 'publish' ? { w: 300, h: 240, publish_mode: 'overwrite' as const } : {}),
      };
      updatePipeline(activePipeline.id, { nodes: [...activePipeline.nodes, newNode] });
    },
    [activePipeline, updatePipeline],
  );

  /** Add node at a default stacked offset position (for click-to-add). */
  const handleAddNode = useCallback(
    (type: AnalysisNodeType, code?: string, outputMode?: string) => {
      if (!activePipeline) return;
      const pos = { x: 100 + activePipeline.nodes.length * 50, y: 100 + activePipeline.nodes.length * 50 };
      handleAddNodeAtPosition(type, pos, { code, outputMode });
    },
    [activePipeline, handleAddNodeAtPosition],
  );

  /** Import a spreadsheet file, save its tables, and create a Data Source node. */
  const handleSpreadsheetDrop = useCallback(
    async (file: File) => {
      if (!activePipeline) return;
      try {
        const tables = await importSpreadsheetTables(file);
        for (const table of tables) {
          await saveDataTable(table);
        }
        const firstTable = tables[0];
        if (!firstTable) return;
        const pos = { x: 100 + activePipeline.nodes.length * 50, y: 100 + activePipeline.nodes.length * 50 };
        handleAddNodeAtPosition('data_source', pos, { tableId: firstTable.id, tableName: firstTable.name });
      } catch (err) {
        window.alert(`Import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [activePipeline, handleAddNodeAtPosition],
  );

  /** When a table is clicked/selected, create a Data Source node. */
  const handleSelectTable = useCallback(
    (tableId: string, tableName: string) => {
      if (!activePipeline) return;
      const pos = { x: 100 + activePipeline.nodes.length * 50, y: 100 + activePipeline.nodes.length * 50 };
      handleAddNodeAtPosition('data_source', pos, { tableId, tableName });
    },
    [activePipeline, handleAddNodeAtPosition],
  );

  const handleUpdateNode = useCallback(
    (nodeId: string, patch: Record<string, unknown>) => {
      if (!activePipeline) return;
      const nodes = activePipeline.nodes.map((n) =>
        n.id === nodeId ? { ...n, ...patch } : n,
      );
      updatePipeline(activePipeline.id, { nodes });
    },
    [activePipeline, updatePipeline],
  );

  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      if (!activePipeline) return;
      updatePipeline(activePipeline.id, {
        nodes: activePipeline.nodes.filter((n) => n.id !== nodeId),
        edges: activePipeline.edges.filter((e) => e.source !== nodeId && e.target !== nodeId),
      });
    },
    [activePipeline, updatePipeline],
  );

  /** Snapshot a node's last result as mock data for design-time previews. */
  const handleSnapshotMock = useCallback(
    (nodeId: string) => {
      if (!activePipeline) return;
      const result = analysisResults[nodeId];
      if (!result?.ok || !result.preview) return;
      const mockValue = {
        kind: (result.value_kind ?? 'dataframe') as 'dataframe' | 'scalar' | 'dict' | 'list' | 'text',
        preview: result.preview,
        shape: result.shape,
        generic_value: result.generic_value,
      };
      handleUpdateNode(nodeId, { mockValue });
    },
    [activePipeline, analysisResults, handleUpdateNode],
  );

  /** Clear mock data from a node. */
  const handleClearMock = useCallback(
    (nodeId: string) => {
      handleUpdateNode(nodeId, { mockValue: undefined });
    },
    [handleUpdateNode],
  );

  /** Auto-generate synthetic mock data for a data_source node based on its table schema. */
  const handleGenerateMock = useCallback(
    async (nodeId: string) => {
      if (!activePipeline) return;
      const node = activePipeline.nodes.find((n) => n.id === nodeId);
      if (!node?.data_table_id) return;

      const { loadDataTable } = await import('../../lib/dataTableStorage');
      const table = await loadDataTable(node.data_table_id);
      if (!table || table.columns.length === 0) return;

      const SAMPLE_ROWS = 5;
      const cols = table.columns;
      const rows: (string | number | null)[][] = [];
      for (let r = 0; r < SAMPLE_ROWS; r++) {
        const row: (string | number | null)[] = [];
        for (const col of cols) {
          if (col.type === 'number') {
            row.push(Math.round(Math.random() * 1000) / 10);
          } else if (col.type === 'date') {
            const d = new Date(2024, 0, 1 + r * 30);
            row.push(d.toISOString().slice(0, 10));
          } else {
            row.push(`${col.label}_${r + 1}`);
          }
        }
        rows.push(row);
      }

      const mockValue = {
        kind: 'dataframe' as const,
        preview: {
          columns: cols.map((c) => ({ key: c.key, label: c.label, type: c.type })),
          rows,
        },
        shape: [SAMPLE_ROWS, cols.length],
      };
      handleUpdateNode(nodeId, { mockValue });
    },
    [activePipeline, handleUpdateNode],
  );

  /** Export a sheets_export node's data to Google Sheets. */
  const handleExportToSheets = useCallback(
    async (nodeId: string) => {
      if (!activePipeline) return;
      const node = activePipeline.nodes.find((n) => n.id === nodeId);
      if (!node?.spreadsheet_url) {
        window.alert('Please set a spreadsheet URL first.');
        return;
      }
      const spreadsheetId = parseSpreadsheetId(node.spreadsheet_url);
      if (!spreadsheetId) {
        window.alert('Invalid Google Sheets URL.');
        return;
      }
      const sheetName = node.sheet_name || 'Sheet1';

      // Fetch full data from backend cache
      const preview = await fetchNodePreview(activePipeline.id, nodeId, 0, 10000);
      if (!preview.ok || !preview.columns || !preview.rows) {
        window.alert('No data to export. Run the pipeline first.');
        return;
      }

      try {
        const { getCachedGoogleToken } = await import('../../lib/googleAuth');
        const token = getCachedGoogleToken();
        if (!token) {
          window.alert('Please authenticate with Google first by importing a Google Sheet in the Data tab.');
          return;
        }

        const headers = preview.columns.map((c) => c.key);
        const rows = preview.rows as (string | number | null)[][];
        await writeSheetData(spreadsheetId, sheetName, headers, rows, token);
        window.alert(`Exported ${rows.length} rows to "${sheetName}".`);
      } catch (err) {
        window.alert(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    },
    [activePipeline],
  );

  const [aiDescribingNodeId, setAiDescribingNodeId] = useState<string | null>(null);

  /** Ask AI to suggest a name and description for a node. */
  const handleAutoDescribe = useCallback(
    async (nodeId: string) => {
      if (!activePipeline) { console.error('[AI] no active pipeline'); return; }
      const node = activePipeline.nodes.find((n) => n.id === nodeId);
      if (!node) { console.error('[AI] node not found:', nodeId); return; }

      setAiDescribingNodeId(nodeId);
      notifications.show({ id: 'ai-describe', title: 'AI describing...', message: `Generating name & description for ${node.name || node.type}`, color: 'violet', loading: true, autoClose: false, withCloseButton: false });

      // Gather upstream column context
      const parentIds = activePipeline.edges.filter((e) => e.target === nodeId).map((e) => e.source);
      const inputColumns: string[] = [];
      for (const pid of parentIds) {
        const resolved = resolveEffectiveResult(pid, activePipeline.nodes, activePipeline.edges, analysisResults);
        const cols = resolved ? resultColumns(resolved.result) : undefined;
        if (cols) inputColumns.push(...cols);
      }

      // For data_source nodes, get table column names
      let tableColumns: string[] | undefined;
      if (node.type === 'data_source') {
        const effective = resolveEffectiveResult(nodeId, activePipeline.nodes, activePipeline.edges, analysisResults);
        tableColumns = effective ? resultColumns(effective.result) : undefined;
      }

      try {
        const resp = await aiDescribeNode({
          node_type: node.type,
          code: node.code ?? undefined,
          sql: node.sql ?? undefined,
          columns: tableColumns,
          current_name: node.name ?? undefined,
          current_description: node.description ?? undefined,
          input_columns: inputColumns.length > 0 ? inputColumns : undefined,
        });

        if (resp.ok) {
          const patch: Record<string, unknown> = {};
          if (resp.name) patch.name = resp.name;
          if (resp.description) patch.description = resp.description;
          if (Object.keys(patch).length > 0) {
            handleUpdateNode(nodeId, patch);
            notifications.update({ id: 'ai-describe', title: 'AI suggestion applied', message: resp.name ?? '', color: 'teal', loading: false, autoClose: 3000 });
          } else {
            notifications.update({ id: 'ai-describe', title: 'AI returned empty', message: 'No name or description suggested', color: 'yellow', loading: false, autoClose: 3000 });
          }
        } else {
          console.warn('[AI describe] Failed:', resp.error);
          notifications.update({ id: 'ai-describe', title: 'AI describe failed', message: resp.error ?? 'Unknown error', color: 'red', loading: false, autoClose: 5000 });
        }
      } catch (err) {
        console.warn('[AI describe] Request failed:', err);
        notifications.update({ id: 'ai-describe', title: 'AI describe failed', message: String(err), color: 'red', loading: false, autoClose: 5000 });
      } finally {
        setAiDescribingNodeId(null);
      }
    },
    [activePipeline, analysisResults, handleUpdateNode],
  );

  /** Convert a TransformNodeDef to an AnalysisNode at a grid position. */
  const transformNodeToAnalysis = useCallback(
    (tn: TransformNodeDef, index: number, idPrefix: string): AnalysisNodeT => {
      const COL_GAP = 320, ROW_GAP = 280, COLS = 3;
      const col = index % COLS;
      const row = Math.floor(index / COLS);
      const id = `${idPrefix}_${index}`;
      const base: AnalysisNodeT = {
        id,
        type: tn.type === 'group' ? 'group' : tn.type,
        name: tn.name,
        description: tn.description,
        x: 100 + col * COL_GAP,
        y: 100 + row * ROW_GAP,
        original_cells: tn.original_cells,
        import_group_id: tn.group_id ?? undefined,
        import_group_name: tn.group_name ?? undefined,
      };
      if (tn.type === 'data_source') {
        base.w = 280; base.h = 200;
        if (tn.source_hint?.source_type === 'google_sheets' && tn.source_hint.url) {
          base.spreadsheet_url = tn.source_hint.url;
        }
      } else if (tn.type === 'code') {
        base.code = tn.code ?? '';
        base.w = 420; base.h = 400;
      } else if (tn.type === 'sql') {
        base.sql = tn.sql ?? '';
        base.w = 420; base.h = 350;
      } else if (tn.type === 'output') {
        (base as any).output_mode = tn.output_mode ?? undefined;
        base.w = 380; base.h = 320;
      } else if (tn.type === 'note') {
        base.content = tn.content ?? '';
        base.w = 300; base.h = 200;
      } else if (tn.type === 'group') {
        base.w = 500; base.h = 400;
      } else if (tn.type === 'sheets_export') {
        base.w = 320; base.h = 280;
        base.sheet_name = tn.export_hint?.sheet_name ?? 'Sheet1';
        if (tn.export_hint?.url) base.spreadsheet_url = tn.export_hint.url;
      } else if (tn.type === 'publish') {
        base.w = 300; base.h = 240;
        base.publish_mode = 'overwrite';
      }
      return base;
    },
    [],
  );

  /** Streaming notebook transform: shows progress in AI chat, builds nodes on canvas. */
  const handleStartTransform = useCallback(
    async (cells: NotebookCell[], pipelineName: string) => {
      if (!activePipeline) return;

      // Close flyout, open AI chat sidebar, set streaming state
      setActiveFlyout(null);
      setRightSidebarMode('chat');
      const userMsg = `Import notebook "${pipelineName}" (${cells.length} cells)`;
      useEditorStore.setState({
        isApplyingAi: true,
        aiStatusMessage: 'Transforming notebook...',
        aiStreamingRaw: '',
        notebookImportProgress: {
          phase: 'reading',
          message: 'Reading notebook...',
          stages: [],
          warnings: [],
          mainPathStageIds: [],
          isReviewPass: false,
        },
        aiChatHistory: [
          ...useEditorStore.getState().aiChatHistory,
          { role: 'user' as const, content: userMsg },
        ],
      });

      const idPrefix = `nb_${Date.now()}`;
      // Track nodes added so far (by index) for progressive canvas building
      const addedNodes: AnalysisNodeT[] = [];
      let placeholderGroups: AnalysisNodeT[] = [];
      const placeholderGroupIdsByStageId = new Map<string, string>();

      const syncPlaceholderStageNodeCounts = () => {
        placeholderGroups = placeholderGroups.map((group) => ({
          ...group,
          stageNodeCount: addedNodes.filter(Boolean).filter((node) => node.parentGroup === group.id).length,
        }));
      };

      const syncProgressiveImportNodes = () => {
        const currentPipeline = useEditorStore.getState().pipelines.find((p) => p.id === activePipeline.id);
        if (!currentPipeline) return;
        const existingNonImportNodes = currentPipeline.nodes.filter((n) => !n.id.startsWith(idPrefix));
        updatePipeline(activePipeline.id, {
          nodes: [
            ...existingNonImportNodes,
            ...placeholderGroups,
            ...addedNodes.filter(Boolean),
          ],
        });
      };

      try {
        const result = await transformNotebookStream(
          cells,
          pipelineName,
          // onText: stream raw AI output to chat
          (chunk) => {
            useEditorStore.setState((s) => ({ aiStreamingRaw: s.aiStreamingRaw + chunk }));
          },
          // onNode: add node to canvas progressively
          (index, nodeDef) => {
            const analysisNode = attachNotebookImportNodeToPlaceholderStage(
              transformNodeToAnalysis(nodeDef, index, idPrefix),
              idPrefix,
              placeholderGroupIdsByStageId,
            );
            addedNodes[index] = analysisNode;
            syncPlaceholderStageNodeCounts();
            syncProgressiveImportNodes();
            useEditorStore.setState({ aiStatusMessage: `Building node ${index + 1}: ${nodeDef.name || nodeDef.type}...` });
          },
          // onStatus
          (message) => {
            useEditorStore.setState((state) => ({
              aiStatusMessage: message,
              notebookImportProgress: state.notebookImportProgress
                ? {
                  ...state.notebookImportProgress,
                  message,
                  phase: message.toLowerCase().includes('reading')
                    ? 'reading'
                    : message.toLowerCase().includes('finding')
                      ? 'stage_plan'
                      : message.toLowerCase().includes('connecting')
                        ? 'workflow'
                        : message.toLowerCase().includes('reviewing')
                          ? 'review'
                          : message.toLowerCase().includes('preparing')
                            ? 'layout'
                            : 'build',
                }
                : state.notebookImportProgress,
            }));
          },
          {
            onAnalysis: (analysis) => {
              useEditorStore.setState((state) => ({
                notebookImportProgress: {
                  phase: 'analysis',
                  message: `Detected ${analysis.total_cells ?? cells.length} cells and a ${analysis.complexity_tier} workflow`,
                  complexityTier: analysis.complexity_tier,
                  stageCount: analysis.stage_count,
                  currentStageId: state.notebookImportProgress?.currentStageId ?? null,
                  stages: state.notebookImportProgress?.stages ?? [],
                  warnings: state.notebookImportProgress?.warnings ?? [],
                  mainPathStageIds: state.notebookImportProgress?.mainPathStageIds ?? [],
                  isReviewPass: false,
                },
              }));
            },
            onStagePlan: (plan) => {
              placeholderGroups = buildNotebookImportPlaceholderStages(idPrefix, plan.stages, { originX: 100, originY: 100 });
              placeholderGroupIdsByStageId.clear();
              for (const stage of plan.stages) {
                placeholderGroupIdsByStageId.set(stage.id, getNotebookImportPlaceholderGroupId(idPrefix, stage.id));
              }
              syncProgressiveImportNodes();
              useEditorStore.setState((state) => ({
                notebookImportProgress: {
                  phase: 'stage_plan',
                  message: `Proposed ${plan.stages.length} stages for this notebook`,
                  complexityTier: state.notebookImportProgress?.complexityTier,
                  stageCount: plan.stages.length,
                  currentStageId: null,
                  stages: plan.stages.map((stage) => ({
                    id: stage.id,
                    name: stage.name,
                    purpose: stage.purpose,
                    state: 'queued' as const,
                  })),
                  warnings: state.notebookImportProgress?.warnings ?? [],
                  mainPathStageIds: state.notebookImportProgress?.mainPathStageIds ?? [],
                  isReviewPass: false,
                },
              }));
            },
            onStageProgress: (progress) => {
              placeholderGroups = updateNotebookImportPlaceholderStageState(
                placeholderGroups,
                progress.stage_id,
                progress.state,
                progress.stage_name,
              );
              syncPlaceholderStageNodeCounts();
              syncProgressiveImportNodes();
              useEditorStore.setState((state) => ({
                notebookImportProgress: state.notebookImportProgress
                  ? {
                    ...state.notebookImportProgress,
                    currentStageId: progress.state === 'building' ? progress.stage_id : state.notebookImportProgress.currentStageId,
                    stages: state.notebookImportProgress.stages.map((stage) => (
                      stage.id === progress.stage_id
                        ? { ...stage, name: progress.stage_name || stage.name, state: progress.state }
                        : stage
                    )),
                    isReviewPass: progress.state === 'needs_review',
                  }
                  : state.notebookImportProgress,
              }));
            },
            onWorkflow: (workflow) => {
              const mainPathStageIds = new Set(workflow.main_path_stage_ids);
              placeholderGroups = placeholderGroups.map((group) => ({
                ...group,
                stageRole: mainPathStageIds.has(group.import_group_id ?? '') ? 'main' : 'branch',
              }));
              syncProgressiveImportNodes();
              useEditorStore.setState((state) => ({
                notebookImportProgress: state.notebookImportProgress
                  ? {
                    ...state.notebookImportProgress,
                    phase: 'workflow',
                    message: 'Connecting stages into a workflow',
                    mainPathStageIds: workflow.main_path_stage_ids,
                  }
                  : state.notebookImportProgress,
              }));
            },
            onWarning: (warning) => {
              useEditorStore.setState((state) => ({
                notebookImportProgress: state.notebookImportProgress
                  ? {
                    ...state.notebookImportProgress,
                    warnings: [...state.notebookImportProgress.warnings, warning.message],
                  }
                  : state.notebookImportProgress,
              }));
            },
          },
        );

        // Final: rebuild nodes from the complete payload so final graph order
        // matches the stitched backend result even if stage batches completed out of order.
        const allNodes = result.nodes.map((nodeDef, index) => transformNodeToAnalysis(nodeDef, index, idPrefix));
        const newEdges: AnalysisEdgeT[] = (result.edges ?? [])
          .filter((te) => te.from_index >= 0 && te.from_index < allNodes.length && te.to_index >= 0 && te.to_index < allNodes.length)
          .map((te, i) => ({
            id: `nb_edge_${Date.now()}_${i}`,
            source: allNodes[te.from_index].id,
            target: allNodes[te.to_index].id,
          }));

        const currentPipeline = useEditorStore.getState().pipelines.find((p) => p.id === activePipeline.id);
        if (currentPipeline) {
          const laidOutPositions = layoutImportedNotebookNodes(allNodes, newEdges, { originX: 100, originY: 100 });
          const laidOutNodes = allNodes.map((node) => {
            const pos = laidOutPositions[node.id];
            return pos ? { ...node, x: pos.x, y: pos.y } : node;
          });
          const groupedImport = buildImportedNotebookGroups(cells, laidOutNodes, newEdges, idPrefix, { originX: 100, originY: 100 });
          updatePipeline(activePipeline.id, {
            name: pipelineName || currentPipeline.name,
            nodes: [
              ...currentPipeline.nodes.filter((n) => !n.id.startsWith(idPrefix)),
              ...groupedImport.groups,
              ...groupedImport.nodes,
            ],
            edges: [...currentPipeline.edges, ...newEdges, ...groupedImport.groupEdges],
          });
        }

        // Build assistant message
        const warningsText = result.warnings?.length
          ? `\n\nWarnings:\n${result.warnings.map((w) => `- ${w}`).join('\n')}`
          : '';
        const assistantMsg = `Imported ${allNodes.length} nodes and ${newEdges.length} edges from notebook.${warningsText}`;
        const streamedRaw = useEditorStore.getState().aiStreamingRaw;

        useEditorStore.setState((s) => ({
          isApplyingAi: false,
          aiStatusMessage: '',
          aiStreamingRaw: '',
          notebookImportProgress: null,
          aiChatHistory: [
            ...s.aiChatHistory,
            { role: 'assistant' as const, content: assistantMsg, debugRawResponse: streamedRaw || undefined },
          ],
        }));

        notifications.show({
          title: 'Notebook imported',
          message: `${allNodes.length} nodes, ${newEdges.length} edges`,
          color: 'teal',
        });
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : String(err);
        const streamedRaw = useEditorStore.getState().aiStreamingRaw;
        useEditorStore.setState((s) => ({
          isApplyingAi: false,
          aiStatusMessage: '',
          aiStreamingRaw: '',
          notebookImportProgress: null,
          aiChatHistory: [
            ...s.aiChatHistory,
            { role: 'assistant' as const, content: `Error: ${errMsg}`, debugRawResponse: streamedRaw || undefined },
          ],
        }));
      }
    },
    [activePipeline, updatePipeline, setRightSidebarMode, transformNodeToAnalysis],
  );

  const handleRunScope = useCallback(
    (nodeId: string, scope: RunScope) => {
      if (!activePipeline) return;
      const ids = computeRunNodeIds(nodeId, scope, activePipeline.nodes, activePipeline.edges, analysisResults);
      void runPipeline(ids);
    },
    [activePipeline, runPipeline, analysisResults],
  );

  const handleDuplicateNode = useCallback(
    (nodeId: string) => {
      if (!activePipeline) return;
      const node = activePipeline.nodes.find((n) => n.id === nodeId);
      if (!node) return;
      const newNode: AnalysisNodeT = {
        ...JSON.parse(JSON.stringify(node)),
        id: `node_${Date.now()}`,
        x: node.x + 40,
        y: node.y + 40,
        name: node.name ? `${node.name} (copy)` : undefined,
      };
      updatePipeline(activePipeline.id, { nodes: [...activePipeline.nodes, newNode] });
    },
    [activePipeline, updatePipeline],
  );

  const handleToggleGroupCollapse = useCallback(
    (groupId: string) => {
      if (!activePipeline) return;
      const nodes = activePipeline.nodes.map((n) =>
        n.id === groupId ? { ...n, collapsed: !n.collapsed } : n,
      );
      updatePipeline(activePipeline.id, { nodes });
    },
    [activePipeline, updatePipeline],
  );

  const focusedStageId = useEditorStore((s) => s.focusedAnalysisStageId);
  const setFocusedStageId = useEditorStore((s) => s.setFocusedAnalysisStageId);

  /** Group the currently selected nodes into a new group node. */
  const handleGroupSelectedNodes = useCallback(
    (selectedIds: string[]) => {
      if (!activePipeline || selectedIds.length < 2) return;
      const selectedNodes = activePipeline.nodes.filter((n) => selectedIds.includes(n.id) && n.type !== 'group');
      if (selectedNodes.length < 2) return;
      // Compute bounding box
      const xs = selectedNodes.map((n) => n.x);
      const ys = selectedNodes.map((n) => n.y);
      const ws = selectedNodes.map((n) => n.w ?? 300);
      const hs = selectedNodes.map((n) => n.h ?? 200);
      const minX = Math.min(...xs) - 20;
      const minY = Math.min(...ys) - 40;
      const maxX = Math.max(...xs.map((x, i) => x + ws[i])) + 20;
      const maxY = Math.max(...ys.map((y, i) => y + hs[i])) + 20;

      const groupId = `group_${Date.now()}`;
      const groupNode: AnalysisNodeT = {
        id: groupId,
        type: 'group',
        name: 'New Group',
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
      };

      const nodes = [
        ...activePipeline.nodes.map((n) =>
          selectedIds.includes(n.id) && n.type !== 'group' ? { ...n, parentGroup: groupId } : n,
        ),
        groupNode,
      ];
      updatePipeline(activePipeline.id, { nodes });
    },
    [activePipeline, updatePipeline],
  );

  // When a stage is focused, filter pipeline to only that stage's nodes + port nodes for external connections
  const focusedPipeline = useMemo(() => {
    if (!activePipeline || !focusedStageId) return activePipeline;
    const stageNodeIds = new Set(
      activePipeline.nodes.filter((n) => n.parentGroup === focusedStageId).map((n) => n.id),
    );
    // Find external nodes that connect to/from this stage (for port display)
    const portNodes: AnalysisNodeT[] = [];
    const portEdges: AnalysisEdgeT[] = [];
    for (const edge of activePipeline.edges) {
      if (stageNodeIds.has(edge.source) && !stageNodeIds.has(edge.target)) {
        // Outgoing: target is external
        const target = activePipeline.nodes.find((n) => n.id === edge.target);
        if (target && !portNodes.some((p) => p.id === target.id)) {
          const parentStage = activePipeline.nodes.find((n) => n.id === target.parentGroup);
          portNodes.push({ ...target, x: target.x, y: target.y, _isPort: true, _portLabel: parentStage?.name ? `To: ${parentStage.name}` : 'External' } as any);
        }
        portEdges.push(edge);
      } else if (!stageNodeIds.has(edge.source) && stageNodeIds.has(edge.target)) {
        // Incoming: source is external
        const source = activePipeline.nodes.find((n) => n.id === edge.source);
        if (source && !portNodes.some((p) => p.id === source.id)) {
          const parentStage = activePipeline.nodes.find((n) => n.id === source.parentGroup);
          portNodes.push({ ...source, x: source.x, y: source.y, _isPort: true, _portLabel: parentStage?.name ? `From: ${parentStage.name}` : 'External' } as any);
        }
        portEdges.push(edge);
      }
    }
    const stageNodes = activePipeline.nodes.filter((n) => stageNodeIds.has(n.id));
    const stageInternalEdges = activePipeline.edges.filter((e) => stageNodeIds.has(e.source) && stageNodeIds.has(e.target));
    return {
      ...activePipeline,
      nodes: [...stageNodes, ...portNodes],
      edges: [...stageInternalEdges, ...portEdges],
    };
  }, [activePipeline, focusedStageId]);

  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);

  // Derive flow nodes/edges from pipeline state (uses focused pipeline when a stage is selected)
  const derivedFlowNodes = useMemo(
    () => {
      const pipeline = focusedStageId ? focusedPipeline : activePipeline;
      return pipeline ? pipelineNodesToFlow(pipeline.nodes, pipeline.edges, analysisResults, handleUpdateNode, handleDeleteNode, handleRunScope, saveAnalysisComponent, handleToggleGroupCollapse, handleSnapshotMock, handleClearMock, handleGenerateMock, handleExportToSheets, handleDuplicateNode, handleAutoDescribe, aiDescribingNodeId, pipeline.id, selectedNodeId, zoomLevel, multiSelectedIds) : [];
    },
    [focusedStageId, focusedPipeline, activePipeline, analysisResults, handleUpdateNode, handleDeleteNode, handleRunScope, saveAnalysisComponent, handleToggleGroupCollapse, handleSnapshotMock, handleClearMock, handleGenerateMock, handleExportToSheets, handleDuplicateNode, handleAutoDescribe, aiDescribingNodeId, selectedNodeId, zoomLevel, multiSelectedIds],
  );

  const derivedFlowEdges = useMemo(
    () => {
      const pipeline = focusedStageId ? focusedPipeline : activePipeline;
      if (!pipeline) return [];
      const visibleIds = new Set(derivedFlowNodes.map((n) => n.id));
      return pipelineEdgesToFlow(pipeline.edges, visibleIds, pipeline.nodes);
    },
    [focusedStageId, focusedPipeline, activePipeline, derivedFlowNodes],
  );

  // Local state for ReactFlow
  const [flowNodes, setFlowNodes] = useState<Node[]>(derivedFlowNodes);
  const [flowEdges, setFlowEdges] = useState<Edge[]>(derivedFlowEdges);
  const resizingRef = useRef(false);

  useEffect(() => { if (!resizingRef.current) setFlowNodes(derivedFlowNodes); }, [derivedFlowNodes]);
  useEffect(() => { setFlowEdges(derivedFlowEdges); }, [derivedFlowEdges]);
  // Re-fit view when focus changes
  useEffect(() => {
    const timer = setTimeout(() => rfFitView({ padding: 0.15, duration: 250 }), 50);
    return () => clearTimeout(timer);
  }, [focusedStageId, rfFitView]);

  const pendingResizeRef = useRef<{ nodeId: string } | null>(null);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      // Track resize state: only react to resize-end when we saw a resize-start
      for (const change of changes) {
        if (change.type === 'dimensions' && change.resizing === true) {
          resizingRef.current = true;
        }
        if (change.type === 'dimensions' && change.resizing === false && resizingRef.current) {
          pendingResizeRef.current = { nodeId: change.id };
          resizingRef.current = false;
        }
      }

      // Filter out redundant dimension changes when user isn't resizing —
      // ReactFlow's ResizeObserver can fire repeatedly (e.g. on hover CSS
      // transitions), causing re-render loops that make the cursor flicker.
      setFlowNodes((nds) => {
        const filtered = resizingRef.current
          ? changes
          : changes.filter((c) => {
              if (c.type !== 'dimensions' || !c.dimensions) return true;
              const existing = nds.find((n) => n.id === c.id);
              if (!existing) return true;
              // Only apply if dimensions actually changed
              return (
                existing.width !== c.dimensions.width ||
                existing.height !== c.dimensions.height
              );
            });
        return filtered.length > 0 ? applyNodeChanges(filtered, nds) : nds;
      });
    },
    [],
  );

  // Persist resize in an effect so we don't trigger side effects inside state updaters
  useEffect(() => {
    const pending = pendingResizeRef.current;
    if (!pending || !activePipeline) return;
    pendingResizeRef.current = null;

    const flowNode = flowNodes.find((n) => n.id === pending.nodeId);
    if (!flowNode) return;

    const w = Math.round(flowNode.width ?? (flowNode.style as any)?.width ?? 280);
    const h = Math.round(flowNode.height ?? (flowNode.style as any)?.height ?? 200);

    // Apply to all selected nodes if multi-selected
    const selectedSet = new Set(multiSelectedIds);
    selectedSet.add(pending.nodeId);

    const pipelineNodes = activePipeline.nodes.map((n) =>
      selectedSet.has(n.id)
        ? {
            ...n,
            w,
            h,
            ...(n.id === pending.nodeId ? { x: flowNode.position.x, y: flowNode.position.y } : {}),
          }
        : n,
    );
    updatePipeline(activePipeline.id, { nodes: pipelineNodes });
  }); // intentionally no deps — runs after every render to catch pending resizes

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => { setFlowEdges((eds) => applyEdgeChanges(changes, eds)); },
    [],
  );

  const onNodeDragStop = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (!activePipeline) return;
      const nodes = activePipeline.nodes.map((n) =>
        n.id === node.id ? { ...n, x: node.position.x, y: node.position.y } : n,
      );
      updatePipeline(activePipeline.id, { nodes });
    },
    [activePipeline, updatePipeline],
  );

  const onConnect = useCallback(
    (connection: Connection) => {
      if (!activePipeline || !connection.source || !connection.target) return;
      const id = `edge_${Date.now()}`;
      const newEdge: AnalysisEdgeT = {
        id,
        source: connection.source,
        target: connection.target,
        sourceHandle: connection.sourceHandle ?? undefined,
        targetHandle: connection.targetHandle ?? undefined,
      };
      updatePipeline(activePipeline.id, { edges: [...activePipeline.edges, newEdge] });
    },
    [activePipeline, updatePipeline],
  );

  // --- Drag-to-canvas: show node type menu when connection drops on empty canvas ---
  const connectStartNodeId = useRef<string | null>(null);
  const connectDropMenuJustOpened = useRef(false);
  const [connectDropMenu, setConnectDropMenu] = useState<{ x: number; y: number; sourceNodeId: string } | null>(null);

  const onConnectStart: OnConnectStart = useCallback((_event, params) => {
    connectStartNodeId.current = params.nodeId ?? null;
  }, []);

  const onConnectEnd: OnConnectEnd = useCallback(
    (event) => {
      const sourceId = connectStartNodeId.current;
      connectStartNodeId.current = null;
      if (!sourceId) return;
      const target = (event as MouseEvent).target as HTMLElement;
      if (target?.closest('.react-flow__handle')) return;
      if (target?.closest('.react-flow__node')) return;
      // Dropped on canvas — show menu
      connectDropMenuJustOpened.current = true;
      setConnectDropMenu({
        x: (event as MouseEvent).clientX,
        y: (event as MouseEvent).clientY,
        sourceNodeId: sourceId,
      });
    },
    [],
  );

  const handleConnectDropSelect = useCallback(
    (type: AnalysisNodeType) => {
      if (!connectDropMenu || !activePipeline) { setConnectDropMenu(null); return; }
      const position = screenToFlowPosition({ x: connectDropMenu.x, y: connectDropMenu.y });
      const id = `node_${Date.now()}`;
      const newNode: AnalysisNodeT = {
        id,
        type,
        x: position.x,
        y: position.y,
        ...(type === 'data_source' ? { w: 280, h: 200 } : {}),
        ...(type === 'code' ? { code: '# df_in: input DataFrame from upstream node\n# df_out: output DataFrame to pass downstream\n\ndf_out = df_in\n', w: 600, h: 400 } : {}),
        ...(type === 'sql' ? { sql: '-- Input tables: df_in (single parent) or df_in1, df_in2, ...\n\nSELECT * FROM df_in\n', w: 600, h: 350 } : {}),
        ...(type === 'output' ? { w: 380, h: 320 } : {}),
        ...(type === 'note' ? { content: '', w: 300, h: 200 } : {}),
        ...(type === 'sheets_export' ? { w: 320, h: 280, sheet_name: 'Sheet1' } : {}),
        ...(type === 'publish' ? { w: 300, h: 240, publish_mode: 'overwrite' as const } : {}),
      };
      const newEdge: AnalysisEdgeT = { id: `edge_${Date.now()}`, source: connectDropMenu.sourceNodeId, target: id };
      updatePipeline(activePipeline.id, {
        nodes: [...activePipeline.nodes, newNode],
        edges: [...activePipeline.edges, newEdge],
      });
      setConnectDropMenu(null);
    },
    [connectDropMenu, activePipeline, updatePipeline, screenToFlowPosition],
  );

  const onEdgesDelete = useCallback(
    (deleted: Edge[]) => {
      if (!activePipeline) return;
      const deletedIds = new Set(deleted.map((e) => e.id));
      updatePipeline(activePipeline.id, {
        edges: activePipeline.edges.filter((e) => !deletedIds.has(e.id)),
      });
    },
    [activePipeline, updatePipeline],
  );

  const onNodesDelete = useCallback(
    (deleted: Node[]) => {
      if (!activePipeline) return;
      const deletedIds = new Set(deleted.map((n) => n.id));
      updatePipeline(activePipeline.id, {
        nodes: activePipeline.nodes.filter((n) => !deletedIds.has(n.id)),
        edges: activePipeline.edges.filter((e) => !deletedIds.has(e.source) && !deletedIds.has(e.target)),
      });
    },
    [activePipeline, updatePipeline],
  );

  // Unified drag-over handler
  const onCanvasDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const hasNodeType = e.dataTransfer.types.includes('application/analysis-node-type');
    const hasFile = e.dataTransfer.types.includes('Files');
    if (hasNodeType || hasFile) {
      e.dataTransfer.dropEffect = 'copy';
      setCanvasDragOver(true);
    }
  }, []);

  // Unified drop handler
  const onCanvasDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setCanvasDragOver(false);

      // Case 1: node type from flyout
      const nodeType = e.dataTransfer.getData('application/analysis-node-type') as AnalysisNodeType | '';
      if (nodeType) {
        const position = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const tableId = e.dataTransfer.getData('application/analysis-data-table-id') || undefined;
        const tableName = e.dataTransfer.getData('application/analysis-data-table-name') || undefined;
        const code = e.dataTransfer.getData('application/analysis-node-code') || undefined;
        const outputMode = e.dataTransfer.getData('application/analysis-output-mode') || undefined;
        handleAddNodeAtPosition(nodeType, position, { tableId, tableName, code, outputMode });
        return;
      }

      // Case 2: spreadsheet file drop
      const file = e.dataTransfer.files[0];
      if (file && isSupportedSpreadsheetFile(file)) {
        void handleSpreadsheetDrop(file);
      }
    },
    [screenToFlowPosition, handleAddNodeAtPosition, handleSpreadsheetDrop],
  );

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const padding = 50;
      const width = node.width ?? 300;
      const height = node.height ?? 200;
      fitBounds(
        { x: node.position.x - padding, y: node.position.y - padding, width: width + padding * 2, height: height + padding * 2 },
        { duration: 300 },
      );
    },
    [fitBounds],
  );

  // Keyboard shortcut: Cmd+Enter runs smart scope on selected node, Ctrl+G groups
  const onCanvasKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && selectedNodeId) {
        e.preventDefault();
        handleRunScope(selectedNodeId, 'smart');
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'g' && multiSelectedIds.length >= 2) {
        e.preventDefault();
        handleGroupSelectedNodes(multiSelectedIds);
      }
    },
    [selectedNodeId, handleRunScope, multiSelectedIds, handleGroupSelectedNodes],
  );

  const handleCreateCheckpoint = useCallback(() => {
    if (!activePipeline) return;
    const cp: PipelineCheckpoint = {
      id: `cp_${Date.now()}`,
      name: `Checkpoint ${(activePipeline.checkpoints?.length ?? 0) + 1}`,
      timestamp: Date.now(),
      nodes: JSON.parse(JSON.stringify(activePipeline.nodes)),
      edges: JSON.parse(JSON.stringify(activePipeline.edges)),
    };
    const existing = activePipeline.checkpoints ?? [];
    // Keep at most 20 checkpoints
    const checkpoints = [...existing, cp].slice(-20);
    updatePipeline(activePipeline.id, { checkpoints });
  }, [activePipeline, updatePipeline]);

  const handleRestoreCheckpoint = useCallback((cp: PipelineCheckpoint) => {
    if (!activePipeline) return;
    updatePipeline(activePipeline.id, {
      nodes: JSON.parse(JSON.stringify(cp.nodes)),
      edges: JSON.parse(JSON.stringify(cp.edges)),
    });
  }, [activePipeline, updatePipeline]);

  if (!activePipeline) return null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <AnalysisToolbar
        pipeline={activePipeline}
        isRunning={isRunningPipeline}
        onUpdatePipeline={updatePipeline}
        onRun={() => void runPipeline()}
        onCreateCheckpoint={handleCreateCheckpoint}
        onRestoreCheckpoint={handleRestoreCheckpoint}
        onDelete={() => deletePipeline(activePipeline.id)}
      />
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        <AnalysisIconStrip activeFlyout={activeFlyout} onToggle={handleToggleFlyout} />
        <AnalysisFlyoutPanel
          activeFlyout={activeFlyout}
          onClose={() => setActiveFlyout(null)}
          components={analysisComponents}
          onAddNode={handleAddNode}
          onSelectTable={handleSelectTable}
          onStartTransform={handleStartTransform}
        />
        <div
          style={{ flex: 1, width: '100%', height: '100%', position: 'relative', outline: 'none' }}
          onDragOver={onCanvasDragOver}
          onDragLeave={() => setCanvasDragOver(false)}
          onDrop={onCanvasDrop}
          onKeyDown={onCanvasKeyDown}
          tabIndex={0}
        >
          {canvasDragOver && (
            <div style={{
              position: 'absolute', inset: 0, zIndex: 10,
              background: 'rgba(12, 166, 120, 0.08)',
              border: '2px dashed var(--mantine-color-teal-5)',
              borderRadius: 8,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              pointerEvents: 'none',
            }}>
              <Text size="lg" fw={600} c="teal">Drop to add node</Text>
            </div>
          )}
          <ReactFlow
            nodes={flowNodes}
            edges={flowEdges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDragStop={onNodeDragStop}
            onConnect={onConnect}
            onConnectStart={onConnectStart}
            onConnectEnd={onConnectEnd}
            onEdgesDelete={onEdgesDelete}
            onNodesDelete={onNodesDelete}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeClick={(_event, node) => {
              setSelectedNodeId(node.id);
              setRightSidebarMode('analysis-inspector');
            }}
            onPaneClick={() => {
              setSelectedNodeId(null);
              setMultiSelectedIds([]);
              if (connectDropMenuJustOpened.current) {
                connectDropMenuJustOpened.current = false;
              } else {
                setConnectDropMenu(null);
              }
            }}
            onSelectionChange={({ nodes: sel }) => {
              // Only update if the selection actually changed — onSelectionChange
              // fires repeatedly (e.g. with []) during re-renders, and creating a
              // new array reference each time causes derivedFlowNodes to recalculate,
              // re-rendering all nodes and causing hover/control flicker.
              const ids = sel.map((n) => n.id);
              setMultiSelectedIds((prev) => {
                if (prev.length === ids.length && prev.every((id, i) => id === ids[i])) return prev;
                return ids;
              });
            }}
            fitView
            minZoom={0.05}
            deleteKeyCode={['Delete', 'Backspace']}
          >
            <Background />
            <Controls />
            <div style={{
              position: 'absolute',
              bottom: 10,
              left: 60,
              zIndex: 5,
              display: 'flex',
              gap: 2,
              background: 'rgba(255,255,255,0.95)',
              borderRadius: 6,
              padding: '3px 4px',
              fontSize: 11,
              boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
            }}>
              {(['auto', 'full', 'summary', 'mini'] as const).map((mode) => {
                const isActive = zoomOverride === mode;
                const label = mode === 'auto'
                  ? `Auto (${autoZoomLevel.charAt(0).toUpperCase() + autoZoomLevel.slice(1)})`
                  : mode.charAt(0).toUpperCase() + mode.slice(1);
                return (
                  <button
                    key={mode}
                    onClick={() => setZoomOverride(mode)}
                    style={{
                      border: 'none',
                      background: isActive ? '#e9ecef' : 'transparent',
                      color: isActive ? '#343a40' : '#868e96',
                      fontWeight: isActive ? 600 : 400,
                      fontSize: 11,
                      padding: '2px 8px',
                      borderRadius: 4,
                      cursor: 'pointer',
                    }}
                  >
                    {label}
                  </button>
                );
              })}
              <span style={{ color: '#adb5bd', padding: '2px 4px', fontSize: 10 }}>{Math.round(zoom * 100)}%</span>
            </div>
          </ReactFlow>
          {/* Floating menu when connection is dropped on canvas */}
          {connectDropMenu && (
            <>
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 999 }}
              onClick={() => setConnectDropMenu(null)}
              onKeyDown={(e) => { if (e.key === 'Escape') setConnectDropMenu(null); }}
            />
            <div
              style={{
                position: 'fixed',
                left: connectDropMenu.x,
                top: connectDropMenu.y,
                zIndex: 1000,
                background: '#fff',
                borderRadius: 8,
                boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                padding: '4px 0',
                minWidth: 160,
              }}
            >
              {[
                { type: 'code' as const, label: 'Code', icon: IconCode, color: '#7048e8' },
                { type: 'sql' as const, label: 'SQL', icon: IconSql, color: '#1c7ed6' },
                { type: 'output' as const, label: 'Output', icon: IconTableFilled, color: '#e8590c' },
                { type: 'data_source' as const, label: 'Data Source', icon: IconDatabase, color: '#0ca678' },
              ].map(({ type, label, icon: Icon, color }) => (
                <button
                  key={type}
                  onClick={() => handleConnectDropSelect(type)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    padding: '8px 12px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontSize: 13,
                    color: '#1a1b1e',
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.background = '#f1f3f5'; }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  <Icon size={16} color={color} />
                  {label}
                </button>
              ))}
            </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function AnalysisPage() {
  const pipelines = useEditorStore((s) => s.pipelines);
  const activePipelineId = useEditorStore((s) => s.activePipelineId);
  const createPipeline = useEditorStore((s) => s.createPipeline);
  const setActivePipeline = useEditorStore((s) => s.setActivePipeline);

  const activePipeline = pipelines.find((p) => p.id === activePipelineId) ?? null;

  if (!activePipeline) {
    return (
      <Box style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
        <Group px="md" py="xs" style={{ borderBottom: '1px solid var(--mantine-color-gray-3)' }}>
          <Text fw={600}>Analysis Pipelines</Text>
          <Button size="xs" variant="light" leftSection={<IconPlus size={14} />} onClick={() => createPipeline()}>
            New Pipeline
          </Button>
          {pipelines.length > 0 && (
            <Select
              size="xs"
              placeholder="Select pipeline"
              data={pipelines.map((p) => ({ value: p.id, label: p.name }))}
              onChange={(v) => v && setActivePipeline(v)}
              w={200}
            />
          )}
        </Group>
        <Box style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Text c="dimmed">Create a pipeline to get started</Text>
        </Box>
      </Box>
    );
  }

  return (
    <ReactFlowProvider>
      <AnalysisCanvas />
    </ReactFlowProvider>
  );
}
