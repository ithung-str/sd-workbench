import { useCallback, useRef, useState } from 'react';
import { Handle, Position, type NodeProps, NodeResizer } from 'reactflow';
import { ActionIcon, Box, Select, Text, Textarea, TextInput, Tooltip } from '@mantine/core';
import { IconCode, IconDeviceFloppy, IconSparkles, IconTrash } from '@tabler/icons-react';
import Editor, { type Monaco } from '@monaco-editor/react';
import type { NodeResultResponse } from '../../../lib/api';
import type { RunScope, ZoomLevel } from '../AnalysisPage';
import { StatsPanel } from './StatsPanel';
import { RunMenu } from './RunMenu';
import { useZoomTransition, StatusDot, ShapeBadge, ColumnChips, ZoomControls } from './nodeZoomHelpers';
import { CompactResultBar, DataPreviewModal } from './DataPreviewModal';
import './analysisNodes.css';

type ViewMode = 'all' | 'code' | 'result' | 'stats' | 'desc';

type InputVar = { varName: string; label: string; columns?: string[] };

type CodeData = {
  id?: string;
  pipelineId?: string;
  code?: string;
  name?: string;
  description?: string;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
  onRunScope?: (scope: RunScope) => void;
  onSaveComponent?: (name: string, code: string) => void;
  onDuplicate?: () => void;
  onAutoDescribe?: () => void;
  isAiDescribing?: boolean;
  result?: NodeResultResponse;
  isMockPreview?: boolean;
  selected?: boolean;
  inputVars?: InputVar[];
  zoomLevel?: ZoomLevel;
};

function statusClass(result?: NodeResultResponse): string {
  if (!result) return 'node-card--none';
  return result.ok ? 'node-card--ok' : 'node-card--error';
}

export function CodeNode({ data }: NodeProps<CodeData>) {
  const [saveName, setSaveName] = useState('');
  const [showSave, setShowSave] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [dataModalOpen, setDataModalOpen] = useState(false);
  const zoomLevel = data.zoomLevel ?? 'full';
  const zoomClass = useZoomTransition(zoomLevel);
  const disposeRef = useRef<{ dispose(): void } | null>(null);

  const handleCodeChange = useCallback(
    (value: string | undefined) => {
      data.onUpdate({ code: value ?? '' });
    },
    [data],
  );

  /** Register Monaco completion provider for df_in column names + pandas API. */
  const handleEditorMount = useCallback(
    (_editor: unknown, monaco: Monaco) => {
      // Dispose previous provider if re-mounted
      disposeRef.current?.dispose();

      disposeRef.current = monaco.languages.registerCompletionItemProvider('python', {
        triggerCharacters: ['.', '[', "'", '"'],
        provideCompletionItems(model: any, position: any) {
          const textUntilPosition = model.getValueInRange({
            startLineNumber: position.lineNumber,
            startColumn: 1,
            endLineNumber: position.lineNumber,
            endColumn: position.column,
          });
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn,
          };

          const suggestions: any[] = [];
          const inputVars = data.inputVars ?? [];

          // If user typed a df variable name followed by dot or bracket
          for (const iv of inputVars) {
            const cols = iv.columns ?? [];

            // df_in. → suggest column access patterns
            if (textUntilPosition.endsWith(`${iv.varName}.`)) {
              // Common pandas DataFrame methods
              for (const method of [
                { label: 'head()', detail: 'First 5 rows' },
                { label: 'tail()', detail: 'Last 5 rows' },
                { label: 'describe()', detail: 'Summary statistics' },
                { label: 'info()', detail: 'DataFrame info' },
                { label: 'shape', detail: 'Row x column dimensions' },
                { label: 'columns', detail: 'Column names' },
                { label: 'dtypes', detail: 'Column data types' },
                { label: 'groupby()', detail: 'Group by columns' },
                { label: 'merge()', detail: 'Merge DataFrames' },
                { label: 'sort_values()', detail: 'Sort by column' },
                { label: 'drop_duplicates()', detail: 'Remove duplicates' },
                { label: 'fillna()', detail: 'Fill missing values' },
                { label: 'dropna()', detail: 'Drop missing values' },
                { label: 'rename()', detail: 'Rename columns' },
                { label: 'apply()', detail: 'Apply function' },
                { label: 'value_counts()', detail: 'Count unique values' },
                { label: 'pivot_table()', detail: 'Create pivot table' },
                { label: 'melt()', detail: 'Unpivot wide to long' },
                { label: 'query()', detail: 'Filter with string expr' },
                { label: 'assign()', detail: 'Add new columns' },
              ]) {
                suggestions.push({
                  label: method.label,
                  kind: monaco.languages.CompletionItemKind.Method,
                  insertText: method.label,
                  detail: method.detail,
                  range,
                });
              }
              // Column names as attributes
              for (const col of cols) {
                suggestions.push({
                  label: col,
                  kind: monaco.languages.CompletionItemKind.Field,
                  insertText: col,
                  detail: `Column: ${col}`,
                  range,
                });
              }
            }

            // df_in["  or  df_in[' → suggest column names as strings
            if (textUntilPosition.match(new RegExp(`${iv.varName}\\[["']$`))) {
              for (const col of cols) {
                suggestions.push({
                  label: col,
                  kind: monaco.languages.CompletionItemKind.Value,
                  insertText: col,
                  detail: `Column: ${col}`,
                  range,
                });
              }
            }
          }

          // Top-level: suggest variable names and common imports
          if (!textUntilPosition.includes('.') || suggestions.length === 0) {
            for (const iv of inputVars) {
              suggestions.push({
                label: iv.varName,
                kind: monaco.languages.CompletionItemKind.Variable,
                insertText: iv.varName,
                detail: `Input DataFrame${iv.columns ? ` (${iv.columns.length} cols)` : ''}`,
                range,
              });
            }
            suggestions.push({
              label: 'df_out',
              kind: monaco.languages.CompletionItemKind.Variable,
              insertText: 'df_out',
              detail: 'Output DataFrame (assign your result here)',
              range,
            });
          }

          return { suggestions };
        },
      });
    },
    [data.inputVars],
  );

  const handleSave = () => {
    if (saveName.trim() && data.code && data.onSaveComponent) {
      data.onSaveComponent(saveName.trim(), data.code);
      setSaveName('');
      setShowSave(false);
    }
  };

  const result = data.result;
  const preview = result?.ok ? result.preview : null;
  const showCode = viewMode === 'all' || viewMode === 'code';
  const showResult = viewMode === 'all' || viewMode === 'result';
  const showDesc = viewMode === 'desc';
  const showStats = viewMode === 'stats';

  // ── Mini view ──
  if (zoomLevel === 'mini') {
    return (
      <div className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        <ZoomControls zoomLevel={zoomLevel} onRunScope={data.onRunScope} onDelete={data.onDelete} />
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconCode size={28} color="#862e9c" />
            <Text fw={700} c="violet.8" style={{ fontSize: 24 }} lineClamp={1}>{data.name || 'Code'}</Text>
          </Box>
          <StatusDot result={result} />
          {result?.shape && <Text size="sm" c="dimmed" fw={500}>{result.shape[0]?.toLocaleString()} x {result.shape[1]}</Text>}
        </Box>
      </div>
    );
  }

  // ── Summary view ──
  if (zoomLevel === 'summary') {
    const codePreview = (data.code ?? '').split('\n').filter(l => l.trim() && !l.trim().startsWith('#')).slice(0, 5).join('\n');
    return (
      <div className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />
        <ZoomControls zoomLevel={zoomLevel} onRunScope={data.onRunScope} onAutoDescribe={data.onAutoDescribe} isAiDescribing={data.isAiDescribing} onDuplicate={data.onDuplicate} onDelete={data.onDelete} />
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f0f0f0' }}>
            <IconCode size={22} color="#862e9c" />
            <Text fw={700} c="violet.8" style={{ fontSize: 22, flex: 1 }} lineClamp={1}>{data.name || 'Code'}</Text>
            <StatusDot result={result} />
          </Box>
          {data.description && (
            <Text c="dimmed" px={14} pt={8} lineClamp={2} style={{ fontSize: 16 }}>{data.description}</Text>
          )}
          {codePreview && (
            <Box px={14} py={8} style={{ flex: 1, overflow: 'hidden' }}>
              <Text c="gray.6" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap', fontSize: 14 }} lineClamp={5}>{codePreview}</Text>
            </Box>
          )}
          <Box px={14} pb={10} style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
            <ShapeBadge result={result} isMock={data.isMockPreview} />
            <ColumnChips result={result} />
          </Box>
        </Box>
      </div>
    );
  }

  // ── Full view ──
  return (
    <div className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
      <NodeResizer minWidth={320} minHeight={250} isVisible={data.selected} />
      <Box
        className={`node-card ${statusClass(result)}`}
        style={{
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: 8,
          overflow: 'hidden',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid #f0f0f0', overflow: 'hidden' }}>
          <IconCode size={14} color="#862e9c" style={{ flexShrink: 0 }} />
          <TextInput
            size="xs"
            variant="unstyled"
            value={data.name ?? ''}
            placeholder="Code"
            onChange={(e) => data.onUpdate({ name: e.currentTarget.value })}
            styles={{
              input: { fontWeight: 600, fontSize: 12, color: 'var(--mantine-color-violet-8)', padding: 0, height: 20, minHeight: 20 },
              root: { flex: 1, minWidth: 0, overflow: 'hidden' },
            }}
          />

          <div className="node-controls" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            <Select
              size="xs"
              value={viewMode}
              onChange={(v) => v && setViewMode(v as ViewMode)}
              data={[
                { value: 'all', label: 'All' },
                { value: 'code', label: 'Code' },
                { value: 'result', label: 'Result' },
                { value: 'stats', label: 'Stats' },
                { value: 'desc', label: 'Description' },
              ]}
              allowDeselect={false}
              withCheckIcon={false}
              styles={{
                input: { fontSize: 11, height: 24, minHeight: 24, paddingLeft: 8, paddingRight: 20, width: 95 },
              }}
            />

            {data.onSaveComponent && (
              <Tooltip label="Save as component">
                <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setShowSave(!showSave)}>
                  <IconDeviceFloppy size={12} />
                </ActionIcon>
              </Tooltip>
            )}
            {data.onRunScope && <RunMenu onRunScope={data.onRunScope} />}
            {result && (
              <Box style={{ width: 8, height: 8, borderRadius: '50%', background: result.ok ? '#2f9e44' : '#e03131' }} />
            )}
            {data.onAutoDescribe && (
              <Tooltip label="AI suggest name & description">
                <ActionIcon size="xs" variant="subtle" color="violet" onClick={data.onAutoDescribe} loading={data.isAiDescribing}>
                  <IconSparkles size={12} />
                </ActionIcon>
              </Tooltip>
            )}
            {data.onDelete && (
              <Tooltip label="Delete node">
                <ActionIcon size="xs" variant="subtle" color="red" onClick={data.onDelete}>
                  <IconTrash size={12} />
                </ActionIcon>
              </Tooltip>
            )}
          </div>
        </Box>

        {showSave && (
          <Box style={{ display: 'flex', gap: 4, padding: '4px 12px', borderBottom: '1px solid #f0f0f0' }}>
            <TextInput
              size="xs"
              placeholder="Component name"
              value={saveName}
              onChange={(e) => setSaveName(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSave(); }}
              style={{ flex: 1 }}
            />
            <ActionIcon size="sm" variant="filled" color="violet" onClick={handleSave} disabled={!saveName.trim()}>
              <IconDeviceFloppy size={12} />
            </ActionIcon>
          </Box>
        )}

        <Handle type="target" position={Position.Left} />
        <Handle type="source" position={Position.Right} />

        {/* Description view */}
        {showDesc && (
          <Box style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: 10 }}>
            <Textarea
              placeholder="Describe what this node does..."
              value={data.description ?? ''}
              onChange={(e) => data.onUpdate({ description: e.currentTarget.value })}
              autosize
              minRows={4}
              styles={{
                input: { fontSize: 13, border: 'none', padding: 0, background: 'transparent' },
              }}
              style={{ flex: 1 }}
            />
          </Box>
        )}

        {/* Stats view */}
        {showStats && preview?.stats && (
          <StatsPanel stats={preview.stats} shape={result?.shape} />
        )}
        {showStats && !preview?.stats && (
          <Box style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text size="xs" c="dimmed">Run pipeline to see stats</Text>
          </Box>
        )}

        {/* Code editor */}
        {showCode && (
          <Box style={{ flex: 1, minHeight: 100 }}>
            <Editor
              height="100%"
              language="python"
              theme="vs-light"
              value={data.code ?? ''}
              onChange={handleCodeChange}
              onMount={handleEditorMount}
              options={{
                minimap: { enabled: false },
                fontSize: 12,
                lineNumbers: 'off',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                padding: { top: 8 },
                overviewRulerLanes: 0,
                quickSuggestions: true,
                suggestOnTriggerCharacters: true,
              }}
            />
          </Box>
        )}

        {/* Error display */}
        {showResult && result && !result.ok && (
          <Box style={{ padding: '6px 12px', background: '#fff5f5', borderTop: '1px solid #ffc9c9', maxHeight: 120, overflow: 'auto' }}>
            <Text size="xs" c="red" style={{ fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>{result.error}</Text>
          </Box>
        )}

        {/* Result preview bar */}
        {showResult && result?.ok && (
          <CompactResultBar result={result} onExpand={() => setDataModalOpen(true)} />
        )}
        {showResult && !result && (
          <Box style={{ padding: '12px', borderTop: viewMode === 'result' ? '1px solid #f0f0f0' : undefined, flex: viewMode === 'result' ? 1 : undefined, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Text size="xs" c="dimmed">Run pipeline to see results</Text>
          </Box>
        )}

        {/* Data preview modal */}
        {result?.ok && (
          <DataPreviewModal
            opened={dataModalOpen}
            onClose={() => setDataModalOpen(false)}
            result={result}
            pipelineId={data.pipelineId}
            nodeId={data.id}
            title={data.name || 'Code Result'}
          />
        )}
      </Box>
    </div>
  );
}
