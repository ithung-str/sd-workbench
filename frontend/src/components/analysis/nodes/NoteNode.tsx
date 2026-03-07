import { useState, useCallback, useRef, useEffect } from 'react';
import { NodeResizer, type NodeProps } from 'reactflow';
import { ActionIcon, Box, Text, Tooltip } from '@mantine/core';
import { IconMarkdown, IconTrash } from '@tabler/icons-react';
import type { ZoomLevel } from '../AnalysisPage';
import { useNodeHover, useZoomTransition, useNodeFocus, ZoomControls, NodeHandles } from './nodeZoomHelpers';
import './analysisNodes.css';

type NoteData = {
  content?: string;
  name?: string;
  onUpdate: (patch: Record<string, unknown>) => void;
  onDelete?: () => void;
  onDuplicate?: () => void;
  onDeselect?: () => void;
  onAddNode?: (type: import('../../../types/model').AnalysisNodeType) => void;
  onEditorFocusChange?: (editing: boolean) => void;
  selected?: boolean;
  zoomLevel?: ZoomLevel;
};

/** Simple markdown-ish renderer: headings, bold, italic, code, lists, links. */
function renderMarkdown(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      // Headings
      if (line.startsWith('### ')) return `<h4 style="margin:4px 0;font-size:13px">${esc(line.slice(4))}</h4>`;
      if (line.startsWith('## ')) return `<h3 style="margin:4px 0;font-size:14px">${esc(line.slice(3))}</h3>`;
      if (line.startsWith('# ')) return `<h2 style="margin:6px 0;font-size:16px">${esc(line.slice(2))}</h2>`;
      // Unordered list
      if (/^[-*] /.test(line)) return `<li style="margin-left:16px;font-size:12px">${inlineFormat(line.slice(2))}</li>`;
      // Ordered list
      const ol = line.match(/^(\d+)\. (.+)/);
      if (ol) return `<li style="margin-left:16px;font-size:12px" value="${ol[1]}">${inlineFormat(ol[2])}</li>`;
      // Blank line
      if (!line.trim()) return '<br/>';
      // Paragraph
      return `<p style="margin:2px 0;font-size:12px;line-height:1.5">${inlineFormat(line)}</p>`;
    })
    .join('\n');
}

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function inlineFormat(s: string): string {
  let out = esc(s);
  // Code
  out = out.replace(/`([^`]+)`/g, '<code style="background:#f1f3f5;padding:1px 4px;border-radius:3px;font-size:11px">$1</code>');
  // Bold
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  // Italic
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
  // Links
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color:#1971c2">$1</a>');
  return out;
}

export function NoteNode({ data }: NodeProps<NoteData>) {
  const [editing, setEditing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const zoomLevel = data.zoomLevel ?? 'full';
  const zoomClass = useZoomTransition(zoomLevel);
  const hover = useNodeHover();
  const focus = useNodeFocus({
    selected: data.selected,
    onDelete: data.onDelete,
    onDeselect: data.onDeselect,
    onAddNode: data.onAddNode,
  });
  const mergedRef = useCallback((el: HTMLDivElement | null) => {
    (hover.ref as React.MutableRefObject<HTMLDivElement | null>).current = el;
    focus.wrapperRef.current = el;
  }, [hover.ref, focus.wrapperRef]);
  const content = data.content ?? '';

  useEffect(() => {
    data.onEditorFocusChange?.(editing);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (editing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [editing]);

  // ── Mini view ──
  if (zoomLevel === 'mini') {
    return (
      <div ref={hover.ref} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <NodeResizer minWidth={100} minHeight={50} isVisible={data.selected} />
        <NodeHandles />
        <ZoomControls zoomLevel={zoomLevel} onDelete={data.onDelete} />
        <Box className="node-card node-card--none" style={{ background: '#fffde7', borderRadius: 8, border: '1px solid #e0d97e', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <IconMarkdown size={28} color="#e67700" />
            <Text fw={700} c="orange.8" style={{ fontSize: 24 }} lineClamp={1}>{data.name || 'Note'}</Text>
          </Box>
        </Box>
      </div>
    );
  }

  // ── Summary view ──
  if (zoomLevel === 'summary') {
    return (
      <div ref={hover.ref} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} className={`analysis-node ${zoomClass}`} style={{ width: '100%', height: '100%' }}>
        <NodeResizer minWidth={150} minHeight={80} isVisible={data.selected} />
        <NodeHandles />
        <ZoomControls zoomLevel={zoomLevel} onDuplicate={data.onDuplicate} onDelete={data.onDelete} />
        <Box className="node-card node-card--none" style={{ background: '#fffde7', borderRadius: 8, border: '1px solid #e0d97e', width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <Box style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid #f0e68c' }}>
            <IconMarkdown size={22} color="#e67700" />
            <Text fw={700} c="orange.8" style={{ fontSize: 22, flex: 1 }} lineClamp={1}>{data.name || 'Note'}</Text>
          </Box>
          {content && (
            <Text c="dimmed" px={14} py={10} style={{ flex: 1, overflow: 'hidden', fontSize: 16 }} lineClamp={8}>{content}</Text>
          )}
        </Box>
      </div>
    );
  }

  // ── Full view ──
  const focusClass = focus.focusMode === 'node' ? 'focus-node' : editing ? 'focus-editor' : '';
  return (
    <div ref={mergedRef} onMouseEnter={hover.onMouseEnter} onMouseLeave={hover.onMouseLeave} className={`analysis-node ${zoomClass} ${focusClass}`} style={{ width: '100%', height: '100%', outline: 'none' }} {...focus.nodeWrapperProps}>
      <NodeResizer minWidth={200} minHeight={120} isVisible={data.selected} />
      <Box
        className="node-card node-card--none"
        style={{
          background: '#fffde7',
          border: '1px solid #e0d97e',
          borderRadius: 8,
          overflow: 'hidden',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <Box style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderBottom: '1px solid #f0e68c' }}>
          <IconMarkdown size={14} color="#e67700" />
          <input
            type="text"
            value={data.name ?? ''}
            placeholder="Note"
            onChange={(e) => data.onUpdate({ name: e.target.value })}
            style={{
              border: 'none', background: 'transparent', fontWeight: 600, fontSize: 12,
              color: '#e67700', outline: 'none', flex: 1, padding: 0, minWidth: 0,
            }}
          />
          <div className="node-controls" style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 'auto' }}>
            {data.onDelete && (
              <Tooltip label="Delete node">
                <ActionIcon size="xs" variant="subtle" color="red" onClick={data.onDelete}>
                  <IconTrash size={12} />
                </ActionIcon>
              </Tooltip>
            )}
          </div>
        </Box>

        {/* Content: edit or render */}
        <Box
          className={editing ? 'nodrag nopan nowheel' : ''}
          style={{ flex: 1, overflow: 'auto', cursor: editing ? undefined : 'text' }}
          onDoubleClick={() => { if (!editing) { setEditing(true); focus.enterEditorFocus(); } }}
        >
          {editing ? (
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => data.onUpdate({ content: e.target.value })}
              onBlur={() => setEditing(false)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setEditing(false); return; }
                // Allow normal typing without node deletion
                e.stopPropagation();
              }}
              style={{
                width: '100%', height: '100%', border: 'none', outline: 'none',
                resize: 'none', fontFamily: 'monospace', fontSize: 12, lineHeight: 1.5,
                padding: '8px 12px', background: 'transparent',
              }}
            />
          ) : (
            <Box px={12} py={8} style={{ minHeight: 40 }}>
              {content ? (
                <div
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }}
                  style={{ lineHeight: 1.5 }}
                />
              ) : (
                <Text size="xs" c="dimmed" fs="italic">Double-click to add notes...</Text>
              )}
            </Box>
          )}
        </Box>

        {/* Optional handles for connecting to context */}
        <NodeHandles />
      </Box>
    </div>
  );
}
