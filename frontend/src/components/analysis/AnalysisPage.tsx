import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'reactflow';
import 'reactflow/dist/style.css';
import { Box, Button, Group, Select, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconPlus } from '@tabler/icons-react';
import { useEditorStore } from '../../state/editorStore';
import type { AnalysisNodeType, AnalysisNode as AnalysisNodeT, AnalysisEdge as AnalysisEdgeT, PipelineCheckpoint } from '../../types/model';
import { loadPipelineResults, fetchNodePreview, aiDescribeNode, transformNotebookStream, type TransformNodeDef, type NotebookCell } from '../../lib/api';
import { parseCSV } from '../../lib/csvParser';
import { saveDataTable } from '../../lib/dataTableStorage';
import { parseSpreadsheetId, writeSheetData } from '../../lib/googleSheetsApi';
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

    return {
      id: n.id,
      type: n.type,
      position: { x: n.x, y: n.y },
      style: { width: n.w ?? 280, height: n.h ?? 200 },
      data: {
        ...n,
        result: effective?.result,
        selected: n.id === selectedNodeId,
        zoomLevel,
        inputVars,
        childCount,
        onUpdate: (patch: Record<string, unknown>) => onUpdate(n.id, patch),
        onDelete: () => onDelete(n.id),
        onRunScope: (scope: RunScope) => onRunScope(n.id, scope),
        onSaveComponent: n.type === 'code' ? onSaveComponent : undefined,
        onToggleCollapse: n.type === 'group' ? () => onToggleGroupCollapse(n.id) : undefined,
        onSnapshotMock: () => onSnapshotMock(n.id),
        onClearMock: n.mockValue ? () => onClearMock(n.id) : undefined,
        onGenerateMock: n.type === 'data_source' ? () => onGenerateMock(n.id) : undefined,
        onExportToSheets: n.type === 'sheets_export' ? () => onExportToSheets(n.id) : undefined,
        onDuplicate: () => onDuplicate(n.id),
        onAutoDescribe: () => onAutoDescribe(n.id),
        isAiDescribing: n.id === aiDescribingNodeId,
        pipelineId,
        isMockPreview: effective?.isMock ?? false,
      },
    };
  });
}

function pipelineEdgesToFlow(edges: AnalysisEdgeT[], visibleNodeIds: Set<string>): Edge[] {
  return edges
    .filter((e) => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target))
    .map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      type: 'smoothstep',
      style: { stroke: '#868e96', strokeWidth: 1.5 },
    }));
}

/** Inner component that has access to useReactFlow. */
function AnalysisCanvas() {
  const pipelines = useEditorStore((s) => s.pipelines);
  const activePipelineId = useEditorStore((s) => s.activePipelineId);
  const updatePipeline = useEditorStore((s) => s.updatePipeline);
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

  const { screenToFlowPosition, fitBounds } = useReactFlow();
  const { zoom } = useViewport();
  const zoomLevel: ZoomLevel = zoom < 0.45 ? 'mini' : zoom < 0.85 ? 'summary' : 'full';

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
        ...(type === 'code' ? { code: opts?.code ?? '# df_in: input DataFrame from upstream node\n# df_out: output DataFrame to pass downstream\n\ndf_out = df_in\n', w: 420, h: 400 } : {}),
        ...(type === 'sql' ? { sql: '-- Input tables: df_in (single parent) or df_in1, df_in2, ...\n\nSELECT * FROM df_in\n', w: 420, h: 350 } : {}),
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

  /** Import a CSV file, save it, and create a Data Source node. */
  const handleCsvDrop = useCallback(
    async (file: File) => {
      if (!activePipeline) return;
      try {
        const table = await parseCSV(file);
        await saveDataTable(table);
        const pos = { x: 100 + activePipeline.nodes.length * 50, y: 100 + activePipeline.nodes.length * 50 };
        handleAddNodeAtPosition('data_source', pos, { tableId: table.id, tableName: table.name });
      } catch (err) {
        window.alert(`CSV import failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
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
        aiChatHistory: [
          ...useEditorStore.getState().aiChatHistory,
          { role: 'user' as const, content: userMsg },
        ],
      });

      const idPrefix = `nb_${Date.now()}`;
      // Track nodes added so far (by index) for progressive canvas building
      const addedNodes: AnalysisNodeT[] = [];

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
            const analysisNode = transformNodeToAnalysis(nodeDef, index, idPrefix);
            addedNodes[index] = analysisNode;
            // Update pipeline with all nodes added so far
            const currentPipeline = useEditorStore.getState().pipelines.find((p) => p.id === activePipeline.id);
            if (currentPipeline) {
              const existingNonNb = currentPipeline.nodes.filter((n) => !n.id.startsWith(idPrefix));
              updatePipeline(activePipeline.id, {
                nodes: [...existingNonNb, ...addedNodes.filter(Boolean)],
              });
            }
            useEditorStore.setState({ aiStatusMessage: `Building node ${index + 1}: ${nodeDef.name || nodeDef.type}...` });
          },
          // onStatus
          (message) => {
            useEditorStore.setState({ aiStatusMessage: message });
          },
        );

        // Final: wire up edges from the complete result
        const allNodes = addedNodes.filter(Boolean);
        const newEdges: AnalysisEdgeT[] = (result.edges ?? [])
          .filter((te) => te.from_index >= 0 && te.from_index < allNodes.length && te.to_index >= 0 && te.to_index < allNodes.length)
          .map((te, i) => ({
            id: `nb_edge_${Date.now()}_${i}`,
            source: allNodes[te.from_index].id,
            target: allNodes[te.to_index].id,
          }));

        const currentPipeline = useEditorStore.getState().pipelines.find((p) => p.id === activePipeline.id);
        if (currentPipeline) {
          updatePipeline(activePipeline.id, {
            name: pipelineName || currentPipeline.name,
            edges: [...currentPipeline.edges, ...newEdges],
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

  // Derive flow nodes/edges from pipeline state
  const derivedFlowNodes = useMemo(
    () => activePipeline ? pipelineNodesToFlow(activePipeline.nodes, activePipeline.edges, analysisResults, handleUpdateNode, handleDeleteNode, handleRunScope, saveAnalysisComponent, handleToggleGroupCollapse, handleSnapshotMock, handleClearMock, handleGenerateMock, handleExportToSheets, handleDuplicateNode, handleAutoDescribe, aiDescribingNodeId, activePipeline.id, selectedNodeId, zoomLevel) : [],
    [activePipeline, analysisResults, handleUpdateNode, handleDeleteNode, handleRunScope, saveAnalysisComponent, handleToggleGroupCollapse, handleSnapshotMock, handleClearMock, handleGenerateMock, handleExportToSheets, handleDuplicateNode, handleAutoDescribe, aiDescribingNodeId, selectedNodeId, zoomLevel],
  );

  const derivedFlowEdges = useMemo(
    () => {
      if (!activePipeline) return [];
      const visibleIds = new Set(derivedFlowNodes.map((n) => n.id));
      return pipelineEdgesToFlow(activePipeline.edges, visibleIds);
    },
    [activePipeline, derivedFlowNodes],
  );

  // Local state for ReactFlow
  const [flowNodes, setFlowNodes] = useState<Node[]>(derivedFlowNodes);
  const [flowEdges, setFlowEdges] = useState<Edge[]>(derivedFlowEdges);

  useEffect(() => { setFlowNodes(derivedFlowNodes); }, [derivedFlowNodes]);
  useEffect(() => { setFlowEdges(derivedFlowEdges); }, [derivedFlowEdges]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => { setFlowNodes((nds) => applyNodeChanges(changes, nds)); },
    [],
  );

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
      const newEdge: AnalysisEdgeT = { id, source: connection.source, target: connection.target };
      updatePipeline(activePipeline.id, { edges: [...activePipeline.edges, newEdge] });
    },
    [activePipeline, updatePipeline],
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

      // Case 2: CSV file drop
      const file = e.dataTransfer.files[0];
      if (file && file.name.endsWith('.csv')) {
        void handleCsvDrop(file);
      }
    },
    [screenToFlowPosition, handleAddNodeAtPosition, handleCsvDrop],
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

  const [multiSelectedIds, setMultiSelectedIds] = useState<string[]>([]);

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
            }}
            onSelectionChange={({ nodes: sel }) => {
              setMultiSelectedIds(sel.map((n) => n.id));
              // Don't touch selectedNodeId here — onNodeClick and onPaneClick handle it.
              // onSelectionChange fires with [] during re-selection which causes flicker.
            }}
            fitView
            deleteKeyCode={['Delete', 'Backspace']}
          >
            <Background />
            <Controls />
          </ReactFlow>
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
