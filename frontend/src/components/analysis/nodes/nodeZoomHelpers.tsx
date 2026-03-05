import { useEffect, useRef, useState } from 'react';
import { ActionIcon, Box, Badge, Text, Tooltip } from '@mantine/core';
import { IconCopy, IconPlayerPlay, IconSparkles, IconTrash } from '@tabler/icons-react';
import type { NodeResultResponse } from '../../../lib/api';
import type { RunScope, ZoomLevel } from '../AnalysisPage';

/**
 * Hook that returns a className string. Briefly returns 'zoom-transitioning'
 * when zoomLevel changes, causing the .node-card to go opacity:0.
 * The CSS transition then fades it back to opacity:1.
 */
export function useZoomTransition(zoomLevel: ZoomLevel): string {
  const prevRef = useRef(zoomLevel);
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    if (prevRef.current !== zoomLevel) {
      prevRef.current = zoomLevel;
      setTransitioning(true);
      // Double-rAF ensures the browser paints opacity:0 before we remove the class
      const id = requestAnimationFrame(() => {
        requestAnimationFrame(() => setTransitioning(false));
      });
      return () => cancelAnimationFrame(id);
    }
  }, [zoomLevel]);

  return transitioning ? 'zoom-transitioning' : '';
}

export function StatusDot({ result, size = 10 }: { result?: NodeResultResponse; size?: number }) {
  const bg = !result ? '#dee2e6' : result.ok ? '#2f9e44' : '#e03131';
  return <div style={{ width: size, height: size, borderRadius: '50%', background: bg, flexShrink: 0 }} />;
}

export function ShapeBadge({ result, isMock }: { result?: NodeResultResponse; isMock?: boolean }) {
  if (!result?.shape) return null;
  const [rows, cols] = result.shape;
  return (
    <Box style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
      {isMock && <Badge size="sm" variant="light" color="grape">Mock</Badge>}
      <Badge size="sm" variant="light" color="gray">{rows?.toLocaleString()} x {cols}</Badge>
    </Box>
  );
}

export function ColumnChips({ result, max = 6 }: { result?: NodeResultResponse; max?: number }) {
  if (!result?.ok || !result.preview?.columns) return null;
  const cols = result.preview.columns.map((c: any) => typeof c === 'string' ? c : c.label ?? c.key);
  const shown = cols.slice(0, max);
  const more = cols.length - shown.length;
  return (
    <Text c="dimmed" lineClamp={1} style={{ fontFamily: 'monospace', fontSize: 14 }}>
      {shown.join(', ')}{more > 0 ? `, +${more}` : ''}
    </Text>
  );
}

/** Hover controls for summary and mini zoom levels. */
export function ZoomControls({ zoomLevel, onRunScope, onAutoDescribe, isAiDescribing, onDuplicate, onDelete }: {
  zoomLevel: ZoomLevel;
  onRunScope?: (scope: RunScope) => void;
  onAutoDescribe?: () => void;
  isAiDescribing?: boolean;
  onDuplicate?: () => void;
  onDelete?: () => void;
}) {
  const isMini = zoomLevel === 'mini';
  return (
    <div className="node-controls" style={{
      position: 'absolute',
      top: 6,
      right: 6,
      display: 'flex',
      gap: 3,
      zIndex: 10,
      background: 'rgba(255,255,255,0.92)',
      borderRadius: 6,
      padding: '3px 4px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
    }}>
      {onRunScope && (
        <Tooltip label="Run (smart)">
          <ActionIcon size="sm" variant="light" color="green" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onRunScope('smart'); }}>
            <IconPlayerPlay size={14} />
          </ActionIcon>
        </Tooltip>
      )}
      {!isMini && onAutoDescribe && (
        <Tooltip label="AI describe">
          <ActionIcon size="sm" variant="light" color="violet" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onAutoDescribe(); }} loading={isAiDescribing}>
            <IconSparkles size={14} />
          </ActionIcon>
        </Tooltip>
      )}
      {!isMini && onDuplicate && (
        <Tooltip label="Duplicate">
          <ActionIcon size="sm" variant="light" color="gray" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDuplicate(); }}>
            <IconCopy size={14} />
          </ActionIcon>
        </Tooltip>
      )}
      {onDelete && (
        <Tooltip label="Delete">
          <ActionIcon size="sm" variant="light" color="red" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete(); }}>
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      )}
    </div>
  );
}
