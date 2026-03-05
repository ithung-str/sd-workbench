import { useState } from 'react';
import { Handle, Position, NodeResizer, type NodeProps } from 'reactflow';
import { ActionIcon, Badge, Box, Button, Text, TextInput, Tooltip } from '@mantine/core';
import { IconBrandGoogleDrive, IconCheck, IconTrash, IconUpload } from '@tabler/icons-react';
import type { NodeResultResponse } from '../../../lib/api';
import type { RunScope, ZoomLevel } from '../AnalysisPage';
import { RunMenu } from './RunMenu';
import './analysisNodes.css';

type SheetsExportData = {
  name?: string;
  spreadsheet_url?: string;
  sheet_name?: string;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
  onRunScope?: (scope: RunScope) => void;
  onExportToSheets?: () => void;
  result?: NodeResultResponse;
  selected?: boolean;
  zoomLevel?: ZoomLevel;
};

function statusClass(result?: NodeResultResponse): string {
  if (!result) return 'node-card--none';
  return result.ok ? 'node-card--ok' : 'node-card--error';
}

export function SheetsExportNode({ data }: NodeProps<SheetsExportData>) {
  const result = data.result;
  const zoomLevel = data.zoomLevel ?? 'full';
  const [exporting, setExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<string | null>(null);

  const handleExport = async () => {
    if (!data.onExportToSheets) return;
    setExporting(true);
    setExportStatus(null);
    try {
      data.onExportToSheets();
      setExportStatus('Exported');
    } catch {
      setExportStatus('Failed');
    } finally {
      setExporting(false);
    }
  };

  if (zoomLevel === 'mini') {
    return (
      <div className="analysis-node analysis-node--mini">
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden' }}>
          <div className="node-zoom-mini node-zoom-content">
            <IconBrandGoogleDrive size={14} color="#0f9d58" />
            <Text size="xs" fw={600} c="green.8" truncate>{data.name || 'Sheets Export'}</Text>
          </div>
          <Handle type="target" position={Position.Left} />
        </Box>
      </div>
    );
  }

  if (zoomLevel === 'summary') {
    return (
      <div className="analysis-node analysis-node--summary">
        <Box className={`node-card ${statusClass(result)}`} style={{ background: '#fff', borderRadius: 8, border: '1px solid #dee2e6', overflow: 'hidden', minWidth: 180 }}>
          <div className="node-zoom-summary node-zoom-content">
            <Box style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <IconBrandGoogleDrive size={14} color="#0f9d58" />
              <Text size="xs" fw={600} c="green.8" truncate>{data.name || 'Sheets Export'}</Text>
            </Box>
          </div>
          <Handle type="target" position={Position.Left} />
        </Box>
      </div>
    );
  }

  return (
    <div className="analysis-node" style={{ width: '100%', height: '100%' }}>
      <NodeResizer minWidth={280} minHeight={180} isVisible={data.selected} />
      <Box
        className={`node-card ${statusClass(result)}`}
        style={{
          background: '#fff',
          border: '1px solid #dee2e6',
          borderRadius: 8,
          minWidth: 300,
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <Handle type="target" position={Position.Left} />

        <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 12px', borderBottom: '1px solid #f0f0f0' }}>
          <IconBrandGoogleDrive size={14} color="#0f9d58" />
          <TextInput
            size="xs"
            variant="unstyled"
            value={data.name ?? ''}
            placeholder="Sheets Export"
            onChange={(e) => data.onUpdate({ name: e.currentTarget.value })}
            styles={{
              input: { fontWeight: 600, fontSize: 12, color: '#0f9d58', padding: 0, height: 20, minHeight: 20, width: Math.max(40, (data.name?.length ?? 12) * 8 + 12) },
            }}
          />
          <div className="node-controls" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            {data.onRunScope && <RunMenu onRunScope={data.onRunScope} />}
            {result && (
              <Box style={{ width: 8, height: 8, borderRadius: '50%', background: result.ok ? '#2f9e44' : '#e03131' }} />
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

        <div className="node-zoom-content">
          <Box px={12} py={8} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <TextInput
              size="xs"
              label="Spreadsheet URL"
              placeholder="https://docs.google.com/spreadsheets/d/..."
              value={data.spreadsheet_url ?? ''}
              onChange={(e) => data.onUpdate({ spreadsheet_url: e.currentTarget.value })}
              styles={{ label: { fontSize: 11 } }}
            />
            <TextInput
              size="xs"
              label="Sheet name"
              placeholder="Sheet1"
              value={data.sheet_name ?? 'Sheet1'}
              onChange={(e) => data.onUpdate({ sheet_name: e.currentTarget.value })}
              styles={{ label: { fontSize: 11 } }}
            />

            <Button
              size="xs"
              variant="light"
              color="green"
              leftSection={<IconUpload size={14} />}
              loading={exporting}
              onClick={handleExport}
              disabled={!result?.ok}
            >
              Export to Sheets
            </Button>

            {exportStatus && (
              <Badge size="sm" color={exportStatus === 'Exported' ? 'green' : 'red'} variant="light">
                {exportStatus === 'Exported' && <IconCheck size={10} style={{ marginRight: 4 }} />}
                {exportStatus}
              </Badge>
            )}
          </Box>
        </div>

        {!result && <Text size="xs" c="dimmed" p={12}>Run pipeline to prepare data for export</Text>}

        {result && !result.ok && (
          <Box style={{ padding: '6px 12px' }}>
            <Text size="xs" c="red" style={{ fontFamily: 'monospace' }}>{result.error}</Text>
          </Box>
        )}

        {result?.ok && result.shape && (
          <Box px={12} pb={8}>
            <Text size="xs" c="dimmed">
              {result.shape[0]} rows × {result.shape[1]} columns ready to export
            </Text>
          </Box>
        )}
      </Box>
    </div>
  );
}
