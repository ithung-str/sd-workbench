import { useEditorStore } from '../../state/editorStore';

export function PalettePanel() {
  const addNode = useEditorStore((s) => s.addNode);
  const addGlobalVariable = useEditorStore((s) => s.addGlobalVariable);
  const updateGlobalVariable = useEditorStore((s) => s.updateGlobalVariable);
  const deleteGlobalVariable = useEditorStore((s) => s.deleteGlobalVariable);
  const model = useEditorStore((s) => s.model);
  const activeSimulationMode = useEditorStore((s) => s.activeSimulationMode);
  const importedVensim = useEditorStore((s) => s.importedVensim);

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
            <span className={`tag tag-${node.type}`}>{node.type}</span>{' '}
            {node.type === 'text' ? node.text : node.type === 'cloud' ? 'Cloud' : node.label}
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
              <li key={variable.id}>
                <div className="global-variable-head">
                  <span className="tag tag-global">global</span>
                  <button type="button" className="danger" onClick={() => deleteGlobalVariable(variable.id)}>Delete</button>
                </div>
                <label>
                  Name
                  <input
                    value={variable.name}
                    onChange={(e) => updateGlobalVariable(variable.id, { name: e.target.value })}
                  />
                </label>
                <label>
                  Equation
                  <input
                    value={variable.equation}
                    onChange={(e) => updateGlobalVariable(variable.id, { equation: e.target.value })}
                  />
                </label>
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
