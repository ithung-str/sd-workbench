import { useCallback, useEffect, useRef, useState } from 'react';
import { Handle, Position } from 'reactflow';
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

/**
 * Hook that adds/removes a 'node-hovered' class on the stable ReactFlow
 * wrapper element (parent of .analysis-node). This survives React re-renders
 * because ReactFlow's wrapper DOM element is never replaced.
 * Uses a short delay on leave so buttons positioned outside the node
 * (e.g. the "+" buttons at -20px offsets) remain reachable.
 */
export function useNodeHover() {
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onMouseEnter = useCallback(() => {
    if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    ref.current?.closest('.react-flow__node')?.classList.add('node-hovered');
  }, []);
  const onMouseLeave = useCallback(() => {
    timerRef.current = setTimeout(() => {
      ref.current?.closest('.react-flow__node')?.classList.remove('node-hovered');
    }, 150);
  }, []);
  return { ref, onMouseEnter, onMouseLeave };
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

/** Label badge shown on port (external reference) nodes in focused stage view. */
export function PortBadge({ label }: { label?: string }) {
  if (!label) return null;
  return (
    <div style={{
      position: 'absolute',
      top: -22,
      left: 0,
      right: 0,
      display: 'flex',
      justifyContent: 'center',
      pointerEvents: 'none',
      zIndex: 5,
    }}>
      <Badge size="xs" variant="filled" color="gray" style={{ fontSize: 9, textTransform: 'none' }}>
        {label}
      </Badge>
    </div>
  );
}

/** Standard 4-directional handles for analysis nodes. */
export function NodeHandles({ hasInput = true, hasOutput = true }: { hasInput?: boolean; hasOutput?: boolean }) {
  return (
    <>
      {hasInput && <Handle type="target" position={Position.Top} id="top" />}
      {hasInput && <Handle type="target" position={Position.Left} id="left" />}
      {hasOutput && <Handle type="source" position={Position.Bottom} id="bottom" />}
      {hasOutput && <Handle type="source" position={Position.Right} id="right" />}
    </>
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
      gap: 4,
      zIndex: 10,
      background: 'rgba(255,255,255,0.92)',
      borderRadius: 8,
      padding: '4px 6px',
      boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
    }}>
      {onRunScope && (
        <Tooltip label="Run (smart)">
          <ActionIcon size="md" variant="light" color="green" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onRunScope('smart'); }}>
            <IconPlayerPlay size={18} />
          </ActionIcon>
        </Tooltip>
      )}
      {!isMini && onAutoDescribe && (
        <Tooltip label="AI describe">
          <ActionIcon size="md" variant="light" color="violet" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onAutoDescribe(); }} loading={isAiDescribing}>
            <IconSparkles size={18} />
          </ActionIcon>
        </Tooltip>
      )}
      {!isMini && onDuplicate && (
        <Tooltip label="Duplicate">
          <ActionIcon size="md" variant="light" color="gray" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDuplicate(); }}>
            <IconCopy size={18} />
          </ActionIcon>
        </Tooltip>
      )}
      {onDelete && (
        <Tooltip label="Delete">
          <ActionIcon size="md" variant="light" color="red" onClick={(e: React.MouseEvent) => { e.stopPropagation(); onDelete(); }}>
            <IconTrash size={18} />
          </ActionIcon>
        </Tooltip>
      )}
    </div>
  );
}
