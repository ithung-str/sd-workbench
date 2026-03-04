import { useMemo, useState } from 'react';
import { collectGlobalVariableUsage } from '../../lib/globalVariableUsage';
import { useEditorStore } from '../../state/editorStore';

type PalettePanelProps = {
  onSelectOutlineNode?: () => void;
};

export function PalettePanel({ onSelectOutlineNode }: PalettePanelProps) {
  const addNode = useEditorStore((s) => s.addNode);
  const addGlobalVariable = useEditorStore((s) => s.addGlobalVariable);
  const updateGlobalVariable = useEditorStore((s) => s.updateGlobalVariable);
  const deleteGlobalVariable = useEditorStore((s) => s.deleteGlobalVariable);
  const model = useEditorStore((s) => s.model);
  const selected = useEditorStore((s) => s.selected);
  const setSelected = useEditorStore((s) => s.setSelected);
  const activeSimulationMode = 'native_json' as const;
  const importedVensim = null as any;
  const [editingGlobalId, setEditingGlobalId] = useState<string | null>(null);
  const [editingGlobalValue, setEditingGlobalValue] = useState('');
  const globalUsage = useMemo(() => collectGlobalVariableUsage(model), [model]);

  const startEdit = (id: string, value: string) => {
    setEditingGlobalId(id);
    setEditingGlobalValue(value);
  };

  const commitEdit = (id: string) => {
    updateGlobalVariable(id, { equation: editingGlobalValue });
    setEditingGlobalId(null);
  };

  const nodeOutlineLabel = (node: (typeof model.nodes)[number]): string => {
    if (node.type === 'text') return node.text;
    if (node.type === 'cloud') return 'Cloud';
    if (node.type === 'cld_symbol') return node.name?.trim() || `CLD ${node.symbol}`;
    return node.label;
  };

  return (
    <section className="panel palette-panel">
      <h2>Palette</h2>
      {activeSimulationMode === 'vensim' ? (
        <div className="vensim-readonly-note">Imported Vensim mode (read-only for now)</div>
      ) : (
        <div className="palette-buttons">
          <button onClick={() => addNode('stock')}>+ Stock</button>
          <button onClick={() => addNode('flow')}>+ Flow</button>
          <button onClick={() => addNode('aux')}>+ Aux</button>
          <button onClick={() => addNode('lookup')}>+ Lookup</button>
          <button onClick={() => addNode('text')}>+ Text</button>
        </div>
      )}
      <h3>Model Outline</h3>
      <ul className="model-outline">
        {model.nodes.map((node) => (
          <li key={node.id}>
            <button
              type="button"
              className={`outline-row ${selected?.kind === 'node' && selected.id === node.id ? 'is-selected' : ''}`}
              onClick={() => {
                setSelected({ kind: 'node', id: node.id });
                onSelectOutlineNode?.();
              }}
            >
              <span className={`tag tag-${node.type}`}>{node.type}</span>{' '}
              {nodeOutlineLabel(node)}
            </button>
          </li>
        ))}
      </ul>
      {activeSimulationMode !== 'vensim' ? (
        <>
          <h3>Global Variables</h3>
          <div className="global-variable-actions">
            <button className="purple-button" onClick={addGlobalVariable}>+ Global Variable</button>
          </div>
          <ul className="model-outline global-variable-list">
            {(model.global_variables ?? []).map((variable) => (
              <li key={variable.id} className={selected?.kind === 'global_variable' && selected.id === variable.id ? 'is-selected' : ''}>
                <button
                  type="button"
                  className="global-variable-row"
                  onClick={() => {
                    setSelected({ kind: 'global_variable', id: variable.id });
                    onSelectOutlineNode?.();
                  }}
                >
                  <span className="tag tag-global">global</span>
                  <span className="global-variable-name">{variable.name}</span>
                  <span className="global-variable-uses">{globalUsage[variable.id]?.total ?? 0} uses</span>
                </button>
                <div className="global-variable-value-wrap">
                  {editingGlobalId === variable.id ? (
                    <input
                      className="global-variable-value-input"
                      value={editingGlobalValue}
                      onChange={(e) => setEditingGlobalValue(e.target.value)}
                      autoFocus
                      onBlur={() => commitEdit(variable.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          commitEdit(variable.id);
                        }
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setEditingGlobalId(null);
                        }
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="global-variable-value"
                      onClick={() => startEdit(variable.id, variable.equation)}
                      title="Edit value"
                    >
                      {variable.equation}
                    </button>
                  )}
                  <button type="button" className="ghost-icon-button" onClick={() => startEdit(variable.id, variable.equation)}>
                    Edit
                  </button>
                  <button type="button" className="danger" onClick={() => deleteGlobalVariable(variable.id)}>
                    Delete
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {activeSimulationMode === 'vensim' && importedVensim ? (
        <>
          <h3>Vensim Compatibility</h3>
          <div className="compat-box">
            <div><strong>Tier:</strong> {importedVensim.capabilities.tier}</div>
            <div><strong>Unsupported:</strong> {importedVensim.capabilities.unsupported.length || 0}</div>
            <div><strong>Partial:</strong> {importedVensim.capabilities.partial.length || 0}</div>
            {importedVensim.model_view.time_settings ? (
              <div className="compat-time">
                <strong>Time:</strong>{' '}
                {[
                  importedVensim.model_view.time_settings.initial_time != null
                    ? `start=${importedVensim.model_view.time_settings.initial_time}`
                    : null,
                  importedVensim.model_view.time_settings.final_time != null
                    ? `stop=${importedVensim.model_view.time_settings.final_time}`
                    : null,
                  importedVensim.model_view.time_settings.time_step != null
                    ? `dt=${importedVensim.model_view.time_settings.time_step}`
                    : null,
                  importedVensim.model_view.time_settings.saveper != null
                    ? `saveper=${importedVensim.model_view.time_settings.saveper}`
                    : null,
                ]
                  .filter(Boolean)
                  .join(', ')}
              </div>
            ) : null}
            {importedVensim.capabilities.detected_functions.length > 0 ? (
              <div className="compat-list">
                <strong>Detected functions:</strong> {importedVensim.capabilities.detected_functions.slice(0, 8).join(', ')}
                {importedVensim.capabilities.detected_functions.length > 8 ? '…' : ''}
              </div>
            ) : null}
            {importedVensim.model_view.dependency_graph ? (
              <div className="compat-list">
                <strong>Graph:</strong> auto-generated dependency graph ({importedVensim.model_view.dependency_graph.edges.length} edges)
              </div>
            ) : null}
          </div>
          <h3>Variables</h3>
          <ul className="model-outline vensim-variable-list">
            {importedVensim.model_view.variables.slice(0, 40).map((v) => (
              <li key={v.name}>
                <div className="vensim-var-row">
                  <span className="tag tag-aux">{v.kind ?? 'var'}</span> {v.name}
                </div>
                {v.equation ? <code className="vensim-var-eq">{v.equation}</code> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
