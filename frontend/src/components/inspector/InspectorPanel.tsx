import { useMemo } from 'react';
import { collectGlobalVariableUsage } from '../../lib/globalVariableUsage';
import { useEditorStore } from '../../state/editorStore';
import type { CldLoopDirection, CldSymbol, EdgeModel, LookupNode, NodeModel } from '../../types/model';
import { EquationEditor } from './EquationEditor';
import { buildContextFunctions } from './functionCatalog';
import { LookupEditor } from './LookupEditor';

function endpointLabel(node: NodeModel | undefined, fallback: string): string {
  if (!node) return fallback;
  if (node.type === 'text') return `Text (${node.id})`;
  if (node.type === 'cloud') return `Cloud (${node.id})`;
  if (node.type === 'cld_symbol') return `${node.name?.trim() || `CLD ${node.symbol}`} (${node.id})`;
  return `${node.label} (${node.name})`;
}

export function InspectorPanel() {
  const selected = useEditorStore((s) => s.selected);
  const model = useEditorStore((s) => s.model);
  const updateNode = useEditorStore((s) => s.updateNode);
  const updateGlobalVariable = useEditorStore((s) => s.updateGlobalVariable);
  const setSelected = useEditorStore((s) => s.setSelected);
  const deleteSelected = useEditorStore((s) => s.deleteSelected);
  const validation = useEditorStore((s) => s.validation);

  const node = useMemo<NodeModel | null>(() => {
    if (!selected || selected.kind !== 'node') return null;
    return model.nodes.find((n) => n.id === selected.id) ?? null;
  }, [selected, model.nodes]);

  const edge = useMemo<EdgeModel | null>(() => {
    if (!selected || selected.kind !== 'edge') return null;
    return model.edges.find((e) => e.id === selected.id) ?? null;
  }, [selected, model.edges]);

  const globalVariable = useMemo(() => {
    if (!selected || selected.kind !== 'global_variable') return null;
    return (model.global_variables ?? []).find((variable) => variable.id === selected.id) ?? null;
  }, [selected, model.global_variables]);

  const globalUsage = useMemo(() => collectGlobalVariableUsage(model), [model]);

  const nodeIssues = node
    ? validation.errors.filter((e) => e.node_id === node.id).concat(validation.warnings.filter((e) => e.node_id === node.id))
    : [];

  const equationVariableNames = useMemo(
    () =>
      model.nodes
        .flatMap((n) => (n.type === 'text' || n.type === 'cloud' || n.type === 'cld_symbol' ? [] : [n.name]))
        .concat((model.global_variables ?? []).map((v) => v.name))
        .filter(Boolean),
    [model.nodes, model.global_variables],
  );

  const connectedVariableNames = useMemo(() => {
    if (!node) return [];
    const neighborIds = new Set<string>();
    for (const edgeRow of model.edges) {
      if (edgeRow.source === node.id) neighborIds.add(edgeRow.target);
      if (edgeRow.target === node.id) neighborIds.add(edgeRow.source);
    }
    return model.nodes
      .filter((n) => neighborIds.has(n.id) && n.id !== node.id && n.type !== 'text' && n.type !== 'cloud' && n.type !== 'cld_symbol')
      .flatMap((n) => (n.type === 'text' || n.type === 'cloud' || n.type === 'cld_symbol' ? [] : [n.name]))
      .filter(Boolean);
  }, [model.edges, model.nodes, node]);

  const connectedUnits = useMemo(() => {
    if (!node || node.type === 'text' || node.type === 'cloud' || node.type === 'cld_symbol') return [];
    const rows: Array<{ id: string; edgeType: 'flow_link' | 'influence'; label: string; name: string; units?: string }> = [];
    for (const edgeRow of model.edges) {
      if (edgeRow.source !== node.id && edgeRow.target !== node.id) continue;
      const otherId = edgeRow.source === node.id ? edgeRow.target : edgeRow.source;
      const other = model.nodes.find((n) => n.id === otherId);
      if (!other || other.type === 'text' || other.type === 'cloud' || other.type === 'cld_symbol') continue;
      rows.push({
        id: `${edgeRow.id}-${other.id}`,
        edgeType: edgeRow.type,
        label: other.label,
        name: other.name,
        units: other.units,
      });
    }
    rows.sort((a, b) => {
      const aw = a.edgeType === 'flow_link' ? 0 : 1;
      const bw = b.edgeType === 'flow_link' ? 0 : 1;
      if (aw !== bw) return aw - bw;
      return a.name.localeCompare(b.name);
    });
    return rows;
  }, [model.edges, model.nodes, node]);

  const availableFunctions = useMemo(
    () => buildContextFunctions(),
    [],
  );

  if (!node && !edge && !globalVariable) {
    return (
      <section className="panel inspector-panel">
        <h2>Inspector</h2>
        <p className="muted">Select a node, global variable, or connection on the canvas to edit or disconnect.</p>
      </section>
    );
  }

  if (globalVariable) {
    const usage = globalUsage[globalVariable.id] ?? { stock: [], flow: [], total: 0 };
    return (
      <section className="panel inspector-panel">
        <div className="panel-header-row">
          <h2>Global Variable</h2>
        </div>
        <div className="field-grid">
          <label>
            Name
            <input
              value={globalVariable.name}
              onChange={(e) => updateGlobalVariable(globalVariable.id, { name: e.target.value })}
            />
          </label>
          <label>
            Value
            <input
              value={globalVariable.equation}
              onChange={(e) => updateGlobalVariable(globalVariable.id, { equation: e.target.value })}
            />
          </label>
        </div>
        <div className="connected-units-panel">
          <div className="connected-units-header">
            <span>Used by Stocks ({usage.stock.length})</span>
          </div>
          {usage.stock.length === 0 ? (
            <p className="muted">No stock equations currently reference this global.</p>
          ) : (
            <div className="global-usage-list">
              {usage.stock.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="global-usage-row"
                  onClick={() => setSelected({ kind: 'node', id: item.id })}
                >
                  {item.label} ({item.name})
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="connected-units-panel">
          <div className="connected-units-header">
            <span>Used by Flows ({usage.flow.length})</span>
          </div>
          {usage.flow.length === 0 ? (
            <p className="muted">No flow equations currently reference this global.</p>
          ) : (
            <div className="global-usage-list">
              {usage.flow.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="global-usage-row"
                  onClick={() => setSelected({ kind: 'node', id: item.id })}
                >
                  {item.label} ({item.name})
                </button>
              ))}
            </div>
          )}
        </div>
      </section>
    );
  }

  if (edge) {
    const sourceNode = model.nodes.find((n) => n.id === edge.source);
    const targetNode = model.nodes.find((n) => n.id === edge.target);
    return (
      <section className="panel inspector-panel">
        <div className="panel-header-row">
          <h2>Connection</h2>
          <button className="danger" onClick={deleteSelected}>Disconnect</button>
        </div>
        <div className="field-grid">
          <label>
            Type
            <input value={edge.type} readOnly />
          </label>
          <label>
            Source
            <input value={endpointLabel(sourceNode, edge.source)} readOnly />
          </label>
          <label>
            Target
            <input value={endpointLabel(targetNode, edge.target)} readOnly />
          </label>
        </div>
        <p className="muted">Click any line, then use “Disconnect” to remove only that connection.</p>
      </section>
    );
  }

  if (!node) {
    return null;
  }

  if (node.type === 'text') {
    return (
      <section className="panel inspector-panel">
        <div className="panel-header-row">
          <h2>Text Annotation</h2>
          <button className="danger" onClick={deleteSelected}>Delete</button>
        </div>
        <div className="field-grid">
          <label>
            Text
            <textarea
              rows={5}
              value={node.text}
              onChange={(e) => updateNode(node.id, { text: e.target.value } as Partial<NodeModel>)}
            />
          </label>
        </div>
      </section>
    );
  }

  if (node.type === 'cloud') {
    return (
      <section className="panel inspector-panel">
        <div className="panel-header-row">
          <h2>Cloud</h2>
          <button className="danger" onClick={deleteSelected}>Delete</button>
        </div>
        <p className="muted">Cloud nodes represent external sources or sinks for flows.</p>
      </section>
    );
  }

  if (node.type === 'cld_symbol') {
    const cldChoices: Array<{ symbol: CldSymbol; label: string }> = [
      { symbol: '+', label: '+' },
      { symbol: '-', label: '-' },
      { symbol: '||', label: '||' },
      { symbol: 'R', label: 'R' },
      { symbol: 'B', label: 'B' },
    ];
    const directionChoices: Array<{ direction: CldLoopDirection; label: string }> = [
      { direction: 'clockwise', label: '↻ Clockwise' },
      { direction: 'counterclockwise', label: '↺ Counterclockwise' },
    ];
    const activeDirection = node.loop_direction ?? (node.symbol === 'B' ? 'counterclockwise' : 'clockwise');
    return (
      <section className="panel inspector-panel">
        <div className="panel-header-row">
          <h2>CLD Symbol</h2>
          <button className="danger" onClick={deleteSelected}>Delete</button>
        </div>
        <p className="muted">CLD symbols are annotation-only and excluded from simulation variables.</p>
        <label>
          Name
          <input
            value={node.name ?? ''}
            placeholder="Optional symbol name"
            onChange={(e) => updateNode(node.id, { name: e.target.value || undefined } as Partial<NodeModel>)}
          />
        </label>
        <div className="palette-buttons">
          {cldChoices.map(({ symbol, label }) => (
            <button
              key={symbol}
              type="button"
              className={node.symbol === symbol ? 'purple-button' : ''}
              onClick={() => updateNode(node.id, { symbol } as Partial<NodeModel>)}
            >
              {label}
            </button>
          ))}
        </div>
        {(node.symbol === 'R' || node.symbol === 'B') && (
          <div className="palette-buttons">
            {directionChoices.map(({ direction, label }) => (
              <button
                key={direction}
                type="button"
                className={activeDirection === direction ? 'purple-button' : ''}
                onClick={() => updateNode(node.id, { loop_direction: direction } as Partial<NodeModel>)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </section>
    );
  }

  return (
    <section className="panel inspector-panel">
      <div className="panel-header-row">
        <h2>Inspector</h2>
        <button className="danger" onClick={deleteSelected}>Delete</button>
      </div>
      <div className="field-grid">
        <label>
          Name
          <input value={node.name} onChange={(e) => updateNode(node.id, { name: e.target.value })} />
        </label>
        <label>
          Label
          <input value={node.label} onChange={(e) => updateNode(node.id, { label: e.target.value })} />
        </label>
        <label>
          Units
          <input value={node.units ?? ''} onChange={(e) => updateNode(node.id, { units: e.target.value || undefined })} />
        </label>
        {connectedUnits.length > 0 ? (
          <div className="connected-units-panel">
            <div className="connected-units-header">
              <span>Connected units</span>
              {!node.units && connectedUnits.find((r) => r.units) ? (
                <button
                  type="button"
                  className="ghost-icon-button"
                  onClick={() => updateNode(node.id, { units: connectedUnits.find((r) => r.units)?.units } as Partial<NodeModel>)}
                >
                  Use linked unit
                </button>
              ) : null}
            </div>
            <div className="connected-unit-list">
              {connectedUnits.map((row) => (
                <div key={row.id} className={`connected-unit-row ${row.edgeType}`}>
                  <span className="connected-unit-name">{row.label}</span>
                  <span className={`connected-unit-value ${row.units ? '' : 'missing'}`}>{row.units || '(no units)'}</span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
        {node.type === 'stock' ? (
          <label>
            Initial Value
            <input
              value={String(node.initial_value)}
              onChange={(e) => {
                const v = e.target.value;
                const parsed = Number(v);
                updateNode(node.id, { initial_value: Number.isFinite(parsed) && v.trim() !== '' ? parsed : v } as Partial<NodeModel>);
              }}
            />
          </label>
        ) : null}
      </div>
      <EquationEditor
        value={node.equation}
        onChange={(equation) => updateNode(node.id, { equation })}
        variableNames={equationVariableNames}
        connectedVariableNames={connectedVariableNames}
        availableFunctions={availableFunctions}
      />
      {node.type === 'lookup' ? (
        <LookupEditor node={node as LookupNode} onChange={(patch) => updateNode(node.id, patch)} />
      ) : null}
      {node.type === 'flow' ? (
        <div className="field-grid">
          <label>
            Source Stock ID
            <input value={node.source_stock_id ?? ''} onChange={(e) => updateNode(node.id, { source_stock_id: e.target.value || undefined })} />
          </label>
          <label>
            Target Stock ID
            <input value={node.target_stock_id ?? ''} onChange={(e) => updateNode(node.id, { target_stock_id: e.target.value || undefined })} />
          </label>
        </div>
      ) : null}
      {nodeIssues.length > 0 && (
        <div className="inline-issues">
          {nodeIssues.map((issue, idx) => (
            <div key={`${issue.code}-${idx}`} className={`issue-pill ${issue.severity}`}>{issue.code}: {issue.message}</div>
          ))}
        </div>
      )}
    </section>
  );
}
