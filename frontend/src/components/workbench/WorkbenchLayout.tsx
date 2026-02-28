import { useEffect, useRef, useState } from 'react';
import { PalettePanel } from '../palette/PalettePanel';
import { ModelCanvas } from '../canvas/ModelCanvas';
import { InspectorPanel } from '../inspector/InspectorPanel';
import { ResultsDock } from '../results/ResultsDock';
import { ImportExportControls } from '../io/ImportExportControls';
import { useUIStore } from '../../state/uiStore';
import { modelPresets, type ModelPresetKey } from '../../lib/sampleModels';
import { useEditorStore } from '../../state/editorStore';

export function WorkbenchLayout() {
  const {
    leftRailCollapsed,
    rightRailCollapsed,
    showFunctionInternals,
    showMinimap,
    toggleLeftRail,
    toggleRightRail,
    toggleFunctionInternals,
    toggleMinimap,
  } = useUIStore();
  const model = useEditorStore((s) => s.model);
  const loadModel = useEditorStore((s) => s.loadModel);
  const activeSimulationMode = useEditorStore((s) => s.activeSimulationMode);
  const importedVensim = useEditorStore((s) => s.importedVensim);
  const aiCommand = useEditorStore((s) => s.aiCommand);
  const setAiCommand = useEditorStore((s) => s.setAiCommand);
  const runAiCommand = useEditorStore((s) => s.runAiCommand);
  const isApplyingAi = useEditorStore((s) => s.isApplyingAi);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const logoUrl = import.meta.env.VITE_SC_LOGO_URL as string | undefined;
  const workspaceClass = [
    'workspace-grid',
    leftRailCollapsed ? 'left-collapsed' : '',
    rightRailCollapsed ? 'right-collapsed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const presetOptions: Array<{ key: ModelPresetKey; label: string }> = [
    { key: 'blank', label: 'Unsaved diagram' },
    { key: 'teacup', label: 'Teacup Cooling' },
    { key: 'bathtub', label: 'Bathtub Inventory' },
    { key: 'population', label: 'Simple Population' },
  ];

  const selectedPreset =
    presetOptions.find((option) => model.name === modelPresets[option.key].name)?.key ?? 'blank';

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  return (
    <div className="workbench">
      <header className="app-header">
        <div className="brand-area">
          <div className="brand-lockup">
            {logoUrl ? (
              <img src={logoUrl} alt="Structural Collective" className="brand-logo" />
            ) : (
              <div className="brand-mark" aria-hidden="true">SC</div>
            )}
            <div className="brand-copy">
              <h1>Structural Collective</h1>
              <p>System Dynamics Workbench</p>
            </div>
          </div>
        </div>
        <div className="header-actions">
          <div className="diagram-select-wrap">
            <select
              aria-label="Diagram selector"
              className="diagram-select"
              value={selectedPreset}
              onChange={(e) => loadModel(modelPresets[e.target.value as ModelPresetKey])}
            >
              {presetOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
            <span
              className={`status-pill ${activeSimulationMode === 'vensim' ? 'mode-vensim' : ''}`}
              title={activeSimulationMode === 'vensim' ? importedVensim?.source.filename : undefined}
            >
              {activeSimulationMode === 'vensim' ? 'IMPORTED VENSIM' : selectedPreset === 'blank' ? 'UNSAVED' : 'PRESET'}
            </span>
          </div>
          <button
            className={`ghost-icon-button ${showFunctionInternals ? 'is-active' : ''}`}
            onClick={toggleFunctionInternals}
            title={showFunctionInternals ? 'Hide function internals in node labels' : 'Show function internals in node labels'}
            aria-pressed={showFunctionInternals}
          >
            {showFunctionInternals ? 'Hide fn args' : 'Show fn args'}
          </button>
          <button
            className={`ghost-icon-button ${showMinimap ? 'is-active' : ''}`}
            onClick={toggleMinimap}
            title={showMinimap ? 'Hide minimap' : 'Show minimap'}
            aria-pressed={showMinimap}
          >
            {showMinimap ? 'Hide map' : 'Show map'}
          </button>
          <div className="ai-command-box">
            <textarea
              value={aiCommand}
              onChange={(e) => setAiCommand(e.target.value)}
              placeholder="Ask AI to modify the canvas (e.g. add stock inventory, flow inflow from cloud, connect to inventory)"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void runAiCommand();
                }
              }}
            />
            <button className="purple-button" onClick={() => void runAiCommand()} disabled={isApplyingAi || !aiCommand.trim()}>
              {isApplyingAi ? 'Applying…' : 'Apply with AI'}
            </button>
          </div>
          <button className="purple-button">+ New Diagram</button>
          <div className="hamburger-wrap" ref={menuRef}>
            <button
              className="ghost-icon-button hamburger-button"
              aria-label="Open menu"
              title="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span />
              <span />
              <span />
            </button>
            {menuOpen ? <ImportExportControls mode="menu" onActionComplete={() => setMenuOpen(false)} /> : null}
          </div>
        </div>
      </header>

      <div className={workspaceClass}>
        <aside className={`left-rail ${leftRailCollapsed ? 'collapsed' : ''}`}>
          <div className="rail-toggle">
            <button
              className="rail-handle-button"
              onClick={toggleLeftRail}
              aria-label={leftRailCollapsed ? 'Expand left panel' : 'Collapse left panel'}
              title={leftRailCollapsed ? 'Expand left panel' : 'Collapse left panel'}
            >
              <span className={`chevron ${leftRailCollapsed ? 'right' : 'left'}`} />
            </button>
          </div>
          {!leftRailCollapsed && <PalettePanel />}
        </aside>

        <main className="canvas-column">
          <ModelCanvas />
        </main>

        <aside className={`right-rail ${rightRailCollapsed ? 'collapsed' : ''}`}>
          <div className="rail-toggle">
            <button
              className="rail-handle-button"
              onClick={toggleRightRail}
              aria-label={rightRailCollapsed ? 'Expand right panel' : 'Collapse right panel'}
              title={rightRailCollapsed ? 'Expand right panel' : 'Collapse right panel'}
            >
              <span className={`chevron ${rightRailCollapsed ? 'left' : 'right'}`} />
            </button>
          </div>
          {!rightRailCollapsed && <InspectorPanel />}
        </aside>
      </div>

      <ResultsDock />
    </div>
  );
}
