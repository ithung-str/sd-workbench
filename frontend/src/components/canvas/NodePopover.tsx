import { useEffect, useMemo, useRef } from 'react';
import { useEditorStore } from '../../state/editorStore';
import { getConnectedNames, getEquationVariableNames, getStockFlowEquation } from '../../lib/modelHelpers';
import { buildContextFunctions } from '../inspector/functionCatalog';
import { EquationEditor } from '../inspector/EquationEditor';
import type { NodeModel, StockNode, LookupNode } from '../../types/model';

type Props = {
  nodeId: string;
  screenX: number;
  screenY: number;
  onClose: () => void;
};

export function NodePopover({ nodeId, screenX, screenY, onClose }: Props) {
  const model = useEditorStore((s) => s.model);
  const updateNode = useEditorStore((s) => s.updateNode);
  const activeSimulationMode = useEditorStore((s) => s.activeSimulationMode);
  const importedVensim = useEditorStore((s) => s.importedVensim);
  const ref = useRef<HTMLDivElement>(null);

  const node = model.nodes.find((n) => n.id === nodeId);

  const equationVariableNames = useMemo(() => getEquationVariableNames(model), [model]);
  const connectedVariableNames = useMemo(
    () => (node ? getConnectedNames(node.id, model) : []),
    [node, model],
  );
  const availableFunctions = useMemo(
    () => buildContextFunctions(activeSimulationMode, importedVensim),
    [activeSimulationMode, importedVensim],
  );
  const stockFlowEquation = useMemo(
    () => (node?.type === 'stock' ? getStockFlowEquation(node.id, model) : null),
    [node, model],
  );

  // Close on Escape or click-outside
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    // Use a timeout so the double-click that opened us doesn't immediately close us
    const timer = setTimeout(() => {
      window.addEventListener('mousedown', onClick);
    }, 100);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onClick);
      clearTimeout(timer);
    };
  }, [onClose]);

  if (!node) return null;
  if (node.type === 'text' || node.type === 'cloud' || node.type === 'cld_symbol' || node.type === 'phantom') {
    return null;
  }

  // Position: clamp to viewport. Estimate content height conservatively;
  // CSS max-height: 80vh + overflow-y: auto handles any overflow.
  const popW = 360;
  const popEstH = 320;
  const left = Math.min(screenX, window.innerWidth - popW - 16);
  const top = Math.max(16, Math.min(screenY + 10, window.innerHeight - popEstH - 16));

  const isStock = node.type === 'stock';
  const isLookup = node.type === 'lookup';

  return (
    <div
      ref={ref}
      className="node-popover"
      style={{ left, top, width: popW }}
    >
      <div className="node-popover-header">
        <span className="node-popover-title">{node.label || node.name}</span>
        <span className="node-popover-type">{node.type === 'aux' ? 'variable' : node.type}</span>
        <button className="node-popover-close" onClick={onClose}>×</button>
      </div>

      {/* Name */}
      <div className="node-popover-field">
        <label>Name</label>
        <input
          type="text"
          value={node.name}
          onChange={(e) => updateNode(node.id, { name: e.target.value, label: e.target.value })}
        />
      </div>

      {/* Stock: show derived flow equation */}
      {isStock && stockFlowEquation && (
        <div className="node-popover-derived">
          <span className="node-popover-derived-label">d(Stock)/dt =</span>
          <code>{stockFlowEquation}</code>
        </div>
      )}

      {/* Stock: initial value */}
      {isStock && (
        <div className="node-popover-field">
          <label>Initial value</label>
          <input
            type="text"
            value={String((node as StockNode).initial_value)}
            onChange={(e) => {
              const v = e.target.value;
              const parsed = Number(v);
              updateNode(node.id, { initial_value: Number.isFinite(parsed) && v.trim() !== '' ? parsed : v } as Partial<NodeModel>);
            }}
          />
        </div>
      )}

      {/* Equation editor (for flows, aux, and stocks without flow connections — not lookups) */}
      {!isLookup && (!isStock || !stockFlowEquation) ? (
        <EquationEditor
          value={node.equation}
          onChange={(equation) => updateNode(node.id, { equation })}
          variableNames={equationVariableNames}
          connectedVariableNames={connectedVariableNames}
          availableFunctions={availableFunctions}
          showReferencedSummary={false}
          rows={2}
          compact
        />
      ) : null}

      {/* Lookup: mini preview */}
      {isLookup && (node as LookupNode).points?.length >= 2 && (
        <div className="node-popover-lookup-preview">
          <svg viewBox="0 0 220 60" preserveAspectRatio="none">
            {(() => {
              const pts = [...(node as LookupNode).points].sort((a, b) => a.x - b.x);
              const xs = pts.map((p) => p.x);
              const ys = pts.map((p) => p.y);
              const minX = Math.min(...xs), maxX = Math.max(...xs);
              const minY = Math.min(...ys), maxY = Math.max(...ys);
              const rx = maxX - minX || 1, ry = maxY - minY || 1;
              const d = pts.map((p, i) => {
                const sx = ((p.x - minX) / rx) * 220;
                const sy = 60 - ((p.y - minY) / ry) * 56;
                return `${i === 0 ? 'M' : 'L'}${sx.toFixed(1)},${sy.toFixed(1)}`;
              }).join(' ');
              return <path d={d} fill="none" stroke="#4b1b78" strokeWidth="2" />;
            })()}
          </svg>
        </div>
      )}

      {/* Units */}
      <div className="node-popover-field">
        <label>Units</label>
        <input
          type="text"
          value={node.units ?? ''}
          onChange={(e) => updateNode(node.id, { units: e.target.value || undefined })}
          placeholder="—"
        />
      </div>
    </div>
  );
}
