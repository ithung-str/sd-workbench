import { useEditorStore } from '../../state/editorStore';
import { useUIStore } from '../../state/uiStore';
import { ResultsChart } from './ResultsChart';
import { ResultsTable } from './ResultsTable';
import { ValidationList } from '../validation/ValidationList';
import type { ImportedVariableSummary } from '../../types/model';

type ParsedFunctionCall = {
  functionName: string;
  args: string[];
  raw: string;
};

type FunctionInputRow = {
  variableName: string;
  equation: string;
  call: ParsedFunctionCall;
};

const FUNCTION_NAMES = ['PULSE TRAIN', 'STEP', 'RAMP', 'PULSE', 'DELAY1', 'DELAY3', 'DELAYN', 'DELAY', 'SMOOTH', 'SMOOTH3', 'SMOOTHN'];

function splitArgs(raw: string): string[] {
  const args: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of raw) {
    if (ch === ',' && depth === 0) {
      args.push(current.trim());
      current = '';
      continue;
    }
    if (ch === '(') depth += 1;
    if (ch === ')') depth = Math.max(0, depth - 1);
    current += ch;
  }
  if (current.trim()) args.push(current.trim());
  return args;
}

function parseFunctionCalls(equation?: string): ParsedFunctionCall[] {
  if (!equation) return [];
  const upper = equation.toUpperCase();
  const calls: ParsedFunctionCall[] = [];
  for (let i = 0; i < upper.length; i += 1) {
    for (const fn of FUNCTION_NAMES) {
      if (!upper.startsWith(fn, i)) continue;
      const prev = i > 0 ? upper[i - 1] : '';
      if (/[A-Z0-9_]/.test(prev)) continue;
      let j = i + fn.length;
      while (j < upper.length && /\s/.test(upper[j])) j += 1;
      if (upper[j] !== '(') continue;
      let depth = 0;
      let k = j;
      for (; k < equation.length; k += 1) {
        const ch = equation[k];
        if (ch === '(') depth += 1;
        if (ch === ')') {
          depth -= 1;
          if (depth === 0) break;
        }
      }
      if (k >= equation.length) continue;
      const raw = equation.slice(i, k + 1);
      const argsRaw = equation.slice(j + 1, k);
      calls.push({ functionName: fn, args: splitArgs(argsRaw), raw });
      i = k;
      break;
    }
  }
  return calls;
}

function functionRows(variables: ImportedVariableSummary[]): FunctionInputRow[] {
  return variables.flatMap((v) =>
    parseFunctionCalls(v.equation).map((call) => ({
      variableName: v.name,
      equation: v.equation ?? '',
      call,
    }))
  );
}

function argLabel(functionName: string, index: number): string {
  const fn = functionName.toUpperCase();
  const labels: Record<string, string[]> = {
    STEP: ['height', 'time'],
    RAMP: ['slope', 'start', 'end'],
    PULSE: ['volume', 'first_time', 'width?'],
    'PULSE TRAIN': ['volume', 'first_time', 'interval', 'last_time'],
    DELAY1: ['input', 'delay_time', 'initial?'],
    DELAY3: ['input', 'delay_time', 'initial?'],
    DELAYN: ['input', 'delay_time', 'initial?', 'order'],
    DELAY: ['input', 'delay_time', 'initial?'],
    SMOOTH: ['input', 'smooth_time', 'initial?'],
    SMOOTH3: ['input', 'smooth_time', 'initial?'],
    SMOOTHN: ['input', 'smooth_time', 'initial?', 'order'],
  };
  return labels[fn]?.[index] ?? `arg ${index + 1}`;
}

function isIdentifierToken(value: string): boolean {
  return /^[A-Za-z_][A-Za-z0-9_ ]*$/.test(value.trim());
}

function isNumericLiteralToken(value: string): boolean {
  return /^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test(value.trim());
}

function parseNumericArgValue(arg: string, overrides: Record<string, number | string>): number | null {
  const trimmed = arg.trim();
  if (isNumericLiteralToken(trimmed)) return Number(trimmed);
  if (isIdentifierToken(trimmed)) {
    const override = overrides[trimmed];
    if (typeof override === 'number' && Number.isFinite(override)) return override;
    if (typeof override === 'string' && isNumericLiteralToken(override)) return Number(override);
  }
  return null;
}

function buildFunctionPreviewPoints(
  call: ParsedFunctionCall,
  start: number,
  stop: number,
  overrides: Record<string, number | string>,
  samples = 40
): number[] | null {
  if (!Number.isFinite(start) || !Number.isFinite(stop) || stop <= start) return null;
  const fn = call.functionName.toUpperCase();
  const vals: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    const t = start + ((stop - start) * i) / (samples - 1);
    let y: number | null = null;
    if (fn === 'STEP') {
      const h = parseNumericArgValue(call.args[0] ?? '', overrides);
      const t0 = parseNumericArgValue(call.args[1] ?? '', overrides);
      if (h != null && t0 != null) y = t >= t0 ? h : 0;
    } else if (fn === 'RAMP') {
      const slope = parseNumericArgValue(call.args[0] ?? '', overrides);
      const t0 = parseNumericArgValue(call.args[1] ?? '', overrides);
      const t1 = parseNumericArgValue(call.args[2] ?? '', overrides);
      if (slope != null && t0 != null) {
        const end = t1 ?? stop;
        if (t < t0) y = 0;
        else if (t <= end) y = slope * (t - t0);
        else y = slope * (end - t0);
      }
    } else if (fn === 'PULSE') {
      const amp = parseNumericArgValue(call.args[0] ?? '', overrides);
      const t0 = parseNumericArgValue(call.args[1] ?? '', overrides);
      const width = parseNumericArgValue(call.args[2] ?? '', overrides) ?? 1e-9;
      if (amp != null && t0 != null) y = t >= t0 && t < t0 + width ? amp : 0;
    } else if (fn === 'PULSE TRAIN') {
      const amp = parseNumericArgValue(call.args[0] ?? '', overrides);
      const first = parseNumericArgValue(call.args[1] ?? '', overrides);
      const interval = parseNumericArgValue(call.args[2] ?? '', overrides);
      const last = parseNumericArgValue(call.args[3] ?? '', overrides) ?? stop;
      if (amp != null && first != null && interval != null && interval > 0) {
        y = 0;
        for (let n = 0; first + n * interval <= last + 1e-9; n += 1) {
          const tn = first + n * interval;
          if (Math.abs(t - tn) <= (stop - start) / samples / 2) {
            y = amp;
            break;
          }
        }
      }
    }
    if (y == null || !Number.isFinite(y)) return null;
    vals.push(y);
  }
  return vals;
}

function sparklinePath(values: number[], width = 180, height = 44): string {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * width;
      const y = height - ((v - min) / range) * height;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
}

export function ResultsDock() {
  const bottomTrayExpanded = useUIStore((s) => s.bottomTrayExpanded);
  const toggleBottomTray = useUIStore((s) => s.toggleBottomTray);
  const activeDockTab = useEditorStore((s) => s.activeDockTab);
  const setActiveDockTab = useEditorStore((s) => s.setActiveDockTab);
  const simConfig = useEditorStore((s) => s.simConfig);
  const setSimConfig = useEditorStore((s) => s.setSimConfig);
  const activeSimulationMode = useEditorStore((s) => s.activeSimulationMode);
  const importedVensim = useEditorStore((s) => s.importedVensim);
  const vensimSelectedOutputs = useEditorStore((s) => s.vensimSelectedOutputs);
  const setVensimSelectedOutputs = useEditorStore((s) => s.setVensimSelectedOutputs);
  const vensimParamOverrides = useEditorStore((s) => s.vensimParamOverrides);
  const setVensimParamOverride = useEditorStore((s) => s.setVensimParamOverride);
  const runValidate = useEditorStore((s) => s.runValidate);
  const runSimulate = useEditorStore((s) => s.runSimulate);
  const isValidating = useEditorStore((s) => s.isValidating);
  const isSimulating = useEditorStore((s) => s.isSimulating);
  const validation = useEditorStore((s) => s.validation);
  const localIssues = useEditorStore((s) => s.localIssues);
  const results = useEditorStore((s) => s.results);
  const apiError = useEditorStore((s) => s.apiError);
  const importedTime = importedVensim?.model_view.time_settings;
  const importedVariables = importedVensim?.model_view.variables ?? [];

  const functionVars =
    activeSimulationMode === 'vensim'
      ? importedVariables.filter((v) => /\b(step|ramp|pulse|delay\d*|smooth\d*)\b/i.test(v.equation ?? '')).slice(0, 12)
      : [];

  const functionInputRows = activeSimulationMode === 'vensim' ? functionRows(importedVariables).slice(0, 20) : [];

  const scalarParamCandidates =
    activeSimulationMode === 'vensim'
      ? importedVariables
          .filter((v) => /^[-+]?\d+(\.\d+)?([eE][-+]?\d+)?$/.test((v.equation ?? '').trim()))
          .slice(0, 12)
      : [];

  const hasErrors =
    activeSimulationMode === 'vensim'
      ? false
      : localIssues.some((i) => i.severity === 'error') || validation.errors.length > 0;

  return (
    <section className={`results-dock ${bottomTrayExpanded ? '' : 'collapsed'}`}>
      <div className="results-tray-header">
        <div className="results-tray-title">Validation & Simulation</div>
        <button type="button" className="ghost-icon-button" onClick={toggleBottomTray}>
          {bottomTrayExpanded ? 'Fold tray' : 'Open tray'}
        </button>
      </div>
      {!bottomTrayExpanded ? (
        <div className="dock-peek">
          <div className="dock-tabs">
            {(['validation', 'chart', 'table'] as const).map((tab) => (
              <button key={tab} className={tab === activeDockTab ? 'active' : ''} onClick={() => setActiveDockTab(tab)}>
                {tab}
              </button>
            ))}
          </div>
          <div className="dock-peek-actions">
            <button onClick={() => void runValidate()} disabled={isValidating || activeSimulationMode === 'vensim'}>
              {isValidating ? 'Validating…' : 'Validate'}
            </button>
            <button onClick={() => void runSimulate()} disabled={isSimulating || hasErrors}>
              {isSimulating ? 'Running…' : 'Run Simulation'}
            </button>
          </div>
        </div>
      ) : (
        <>
      <div className="dock-toolbar">
        <div className="dock-tabs">
          {(['validation', 'chart', 'table'] as const).map((tab) => (
            <button key={tab} className={tab === activeDockTab ? 'active' : ''} onClick={() => setActiveDockTab(tab)}>
              {tab}
            </button>
          ))}
        </div>
        <div className="sim-controls">
          {activeSimulationMode === 'vensim' && importedVensim ? (
            <label className="vensim-output-picker">
              Outputs
              <select
                multiple
                value={vensimSelectedOutputs}
                onChange={(e) =>
                  setVensimSelectedOutputs(Array.from(e.target.selectedOptions).map((option) => option.value))
                }
              >
                {importedVensim.model_view.variables.map((variable) => (
                  <option key={variable.name} value={variable.name}>
                    {variable.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className={activeSimulationMode === 'vensim' ? 'mdl-setting' : ''}>
            {activeSimulationMode === 'vensim' ? 'INITIAL TIME' : 'Start'}
            <input type="number" value={simConfig.start} onChange={(e) => setSimConfig({ start: Number(e.target.value) })} />
          </label>
          <label className={activeSimulationMode === 'vensim' ? 'mdl-setting' : ''}>
            {activeSimulationMode === 'vensim' ? 'FINAL TIME' : 'Stop'}
            <input type="number" value={simConfig.stop} onChange={(e) => setSimConfig({ stop: Number(e.target.value) })} />
          </label>
          <label className={activeSimulationMode === 'vensim' ? 'mdl-setting' : ''}>
            {activeSimulationMode === 'vensim' ? 'TIME STEP' : 'dt'}
            <input type="number" step="0.1" value={simConfig.dt} onChange={(e) => setSimConfig({ dt: Number(e.target.value) })} />
          </label>
          {activeSimulationMode === 'vensim' ? (
            <label className="mdl-setting">
              SAVEPER
              <input
                type="number"
                step="0.1"
                value={simConfig.return_step ?? ''}
                onChange={(e) => {
                  const v = e.target.value;
                  setSimConfig({ return_step: v === '' ? undefined : Number(v) });
                }}
              />
            </label>
          ) : null}
          {activeSimulationMode === 'vensim' && importedTime ? (
            <button
              className="ghost-icon-button"
              title="Reset run settings to imported .mdl defaults"
              onClick={() =>
                setSimConfig({
                  start: importedTime.initial_time ?? simConfig.start,
                  stop: importedTime.final_time ?? simConfig.stop,
                  dt: importedTime.time_step ?? simConfig.dt,
                  return_step: importedTime.saveper ?? importedTime.time_step ?? simConfig.return_step,
                })
              }
            >
              Reset MDL Settings
            </button>
          ) : null}
          <button onClick={() => void runValidate()} disabled={isValidating || activeSimulationMode === 'vensim'}>{isValidating ? 'Validating…' : 'Validate'}</button>
          <button onClick={() => void runSimulate()} disabled={isSimulating || hasErrors}>{isSimulating ? 'Running…' : 'Run Simulation'}</button>
        </div>
      </div>
      {apiError ? <div className="banner-error">{apiError}</div> : null}
      {activeSimulationMode === 'vensim' && importedVensim ? (
        <div className="vensim-run-panels">
          {functionVars.length > 0 ? (
            <section className="vensim-run-panel">
              <h4>Detected Function Variables</h4>
              <ul className="vensim-fn-list">
                {functionVars.map((v) => (
                  <li key={v.name}>
                    <div className="vensim-fn-name">{v.name}</div>
                    <code className="vensim-fn-equation">{v.equation}</code>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {functionInputRows.length > 0 ? (
            <section className="vensim-run-panel">
              <h4>Function Inputs</h4>
              <p className="muted compact">
                Variable arguments are editable via parameter overrides. Literal arguments are shown from the imported equation.
              </p>
              <div className="vensim-fn-input-rows">
                {functionInputRows.map((row, rowIndex) => (
                  <div key={`${row.variableName}-${row.call.raw}-${rowIndex}`} className="vensim-fn-input-row">
                    <div className="vensim-fn-input-header">
                      <span className="vensim-fn-name">{row.variableName}</span>
                      <span className="vensim-fn-badge">{row.call.functionName}</span>
                    </div>
                    <code className="vensim-fn-equation">{row.call.raw}</code>
                    {(() => {
                      const preview = buildFunctionPreviewPoints(
                        row.call,
                        simConfig.start,
                        simConfig.stop,
                        vensimParamOverrides
                      );
                      if (!preview) return null;
                      const path = sparklinePath(preview);
                      return (
                        <div className="vensim-fn-preview">
                          <svg viewBox="0 0 180 44" preserveAspectRatio="none" aria-label={`${row.call.functionName} preview`}>
                            <path d={path} />
                          </svg>
                          <div className="vensim-fn-preview-meta">
                            <span>{simConfig.start}</span>
                            <span>{simConfig.stop}</span>
                          </div>
                        </div>
                      );
                    })()}
                    <div className="vensim-param-grid">
                      {row.call.args.map((arg, idx) => {
                        const trimmed = arg.trim();
                        const editable = isIdentifierToken(trimmed);
                        const isLiteral = isNumericLiteralToken(trimmed);
                        return (
                          <label key={`${row.variableName}-${row.call.functionName}-${idx}`}>
                            <span>{argLabel(row.call.functionName, idx)}</span>
                            {editable ? (
                              <input
                                type="number"
                                step="any"
                                placeholder={trimmed}
                                value={vensimParamOverrides[trimmed] ?? ''}
                                onChange={(e) => {
                                  const raw = e.target.value;
                                  if (raw === '') {
                                    setVensimParamOverride(trimmed, undefined);
                                    return;
                                  }
                                  const parsed = Number(raw);
                                  setVensimParamOverride(trimmed, Number.isFinite(parsed) ? parsed : raw);
                                }}
                              />
                            ) : (
                              <div className={`vensim-arg-pill ${isLiteral ? 'literal' : 'expression'}`}>
                                {trimmed || '(empty)'}
                              </div>
                            )}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ) : null}
          {scalarParamCandidates.length > 0 ? (
            <section className="vensim-run-panel">
              <h4>Parameter Overrides</h4>
              <p className="muted compact">
                Override imported scalar constants used by functions like `STEP`, `RAMP`, or delays (when modeled as variables).
              </p>
              <div className="vensim-param-grid">
                {scalarParamCandidates.map((v) => (
                  <label key={v.name}>
                    <span>{v.name}</span>
                    <input
                      type="number"
                      step="any"
                      placeholder={v.equation}
                      value={vensimParamOverrides[v.name] ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (raw === '') {
                          setVensimParamOverride(v.name, undefined);
                          return;
                        }
                        const parsed = Number(raw);
                        setVensimParamOverride(v.name, Number.isFinite(parsed) ? parsed : raw);
                      }}
                    />
                  </label>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
      <div className="dock-body">
        {activeDockTab === 'validation' && <ValidationList />}
        {activeDockTab === 'chart' && <ResultsChart results={results} />}
        {activeDockTab === 'table' && <ResultsTable results={results} />}
      </div>
        </>
      )}
    </section>
  );
}
