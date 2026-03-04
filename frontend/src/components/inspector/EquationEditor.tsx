import { useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { FunctionCatalogEntry } from '../../types/model';
import { useEditorStore } from '../../state/editorStore';
import {
  DEFAULT_FUNCTION_NAMES,
  DEFAULT_RESERVED_NAMES,
  analyzeEquation,
  getCursorToken,
  rankSuggestions,
  type SuggestionMode,
} from './equationEditorUtils';

type Props = {
  value: string;
  onChange: (v: string) => void;
  variableNames?: string[];
  connectedVariableNames?: string[];
  reservedNames?: string[];
  functionNames?: string[];
  availableFunctions?: FunctionCatalogEntry[];
  onInsertFunction?: (template: string) => void;
  onConnectVariable?: (variableName: string) => void;
  maxSuggestions?: number;
  showReferencedSummary?: boolean;
  rows?: number;
  compact?: boolean;
};

const SUGGESTION_LIST_ID = 'equation-editor-suggestion-list';

const CATEGORY_ORDER: FunctionCatalogEntry['category'][] = [
  'Math',
  'Time Inputs',
  'Delays/Smoothing',
  'Stochastic',
  'Lookups',
  'Other Detected',
];

function findFirstArgumentRange(template: string): [number, number] {
  const openParen = template.indexOf('(');
  if (openParen < 0) {
    return [template.length, template.length];
  }

  const closeParen = template.indexOf(')', openParen + 1);
  const comma = template.indexOf(',', openParen + 1);
  const rawEnd = [comma, closeParen].filter((idx) => idx >= 0).sort((a, b) => a - b)[0] ?? template.length;

  let start = openParen + 1;
  while (start < rawEnd && /\s/.test(template[start])) {
    start += 1;
  }

  let end = rawEnd;
  while (end > start && /\s/.test(template[end - 1])) {
    end -= 1;
  }

  return [start, end];
}

export function EquationEditor({
  value,
  onChange,
  variableNames = [],
  connectedVariableNames = [],
  reservedNames = [...DEFAULT_RESERVED_NAMES],
  functionNames = [...DEFAULT_FUNCTION_NAMES],
  availableFunctions = [],
  onInsertFunction,
  maxSuggestions = 8,
  showReferencedSummary = true,
  rows = 4,
  compact = false,
}: Props) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [caret, setCaret] = useState<number>(value.length);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });
  const [isFocused, setIsFocused] = useState(false);
  const [dismissSuggestions, setDismissSuggestions] = useState(false);
  const [pickerValue, setPickerValue] = useState('');
  const [pendingSelection, setPendingSelection] = useState<[number, number] | null>(null);

  const connectedSet = useMemo(() => new Set(connectedVariableNames), [connectedVariableNames]);
  const normalizedReserved = useMemo(
    () => new Set(reservedNames.map((entry) => entry.toLowerCase())),
    [reservedNames],
  );
  const effectiveFunctionNames = useMemo(
    () => [...new Set([...functionNames, ...availableFunctions.map((entry) => entry.key).filter(Boolean)])],
    [functionNames, availableFunctions],
  );
  const normalizedFunctions = useMemo(
    () => new Set(effectiveFunctionNames.map((entry) => entry.toLowerCase())),
    [effectiveFunctionNames],
  );
  const cursorToken = useMemo(() => getCursorToken(value, caret), [value, caret]);
  const suggestions = useMemo(
    () =>
      rankSuggestions(cursorToken?.token ?? '', variableNames, connectedSet, Math.max(1, maxSuggestions)),
    [cursorToken, variableNames, connectedSet, maxSuggestions],
  );
  const analysis = useMemo(
    () => analyzeEquation(value, variableNames, connectedSet, normalizedReserved, normalizedFunctions),
    [value, variableNames, connectedSet, normalizedReserved, normalizedFunctions],
  );
  const groupedFunctions = useMemo(() => {
    const groups = new Map<FunctionCatalogEntry['category'], FunctionCatalogEntry[]>();
    for (const category of CATEGORY_ORDER) groups.set(category, []);
    for (const entry of availableFunctions) {
      const bucket = groups.get(entry.category) ?? [];
      bucket.push(entry);
      groups.set(entry.category, bucket);
    }
    for (const entries of groups.values()) {
      entries.sort((a, b) => a.displayName.localeCompare(b.displayName));
    }
    return groups;
  }, [availableFunctions]);

  const showSuggestMode = Boolean(
    isFocused && cursorToken?.token && suggestions.length > 0 && !dismissSuggestions,
  );
  const mode: SuggestionMode = showSuggestMode ? 'suggest' : showReferencedSummary ? 'referenced' : 'hidden';
  const hasWarning = analysis.unknownVariables.length > 0;
  const hasError = analysis.hasParenError;

  useEffect(() => {
    setActiveSuggestionIndex(0);
    setDismissSuggestions(false);
  }, [cursorToken?.token, cursorToken?.start, cursorToken?.end]);

  useEffect(() => {
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setDismissSuggestions(true);
      }
    };
    window.addEventListener('mousedown', onMouseDown);
    return () => window.removeEventListener('mousedown', onMouseDown);
  }, []);

  useEffect(() => {
    if (!pendingSelection) return;
    const textarea = textRef.current;
    if (!textarea) return;
    const [start, end] = pendingSelection;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start, end);
      setCaret(start);
      setPendingSelection(null);
    });
  }, [pendingSelection, value]);

  const insertAtCaret = (template: string) => {
    const textarea = textRef.current;
    if (!textarea) {
      onChange(value + template);
      return;
    }

    const token = cursorToken;
    const insertionStart = token?.token ? token.start : textarea.selectionStart ?? caret ?? value.length;
    const insertionEnd = token?.token ? token.end : textarea.selectionEnd ?? insertionStart;
    const next = `${value.slice(0, insertionStart)}${template}${value.slice(insertionEnd)}`;
    onChange(next);

    const [argStart, argEnd] = findFirstArgumentRange(template);
    const selectionStart = insertionStart + argStart;
    const selectionEnd = insertionStart + argEnd;
    setPendingSelection([selectionStart, selectionEnd]);
  };

  const applySuggestion = (name: string) => {
    const token = cursorToken;
    const textarea = textRef.current;
    if (!token || !textarea) return;
    const next = `${value.slice(0, token.start)}${name}${value.slice(token.end)}`;
    onChange(next);
    const nextCaret = token.start + name.length;
    requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(nextCaret, nextCaret);
      setCaret(nextCaret);
    });
  };

  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    setCaret(e.target.selectionStart ?? e.target.value.length);
    setActiveSuggestionIndex(0);
    setDismissSuggestions(false);
  };

  const undo = useEditorStore((s) => s.undo);
  const redo = useEditorStore((s) => s.redo);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Ctrl/Cmd+Z → store undo/redo (prevent browser native undo conflict)
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
      return;
    }

    if (mode !== 'suggest') {
      // Enter → blur/confirm (equations are single-expression)
      if (e.key === 'Enter') {
        e.preventDefault();
        textRef.current?.blur();
        return;
      }
      if (e.key === 'Escape') setDismissSuggestions(true);
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveSuggestionIndex((i) => (i + 1) % suggestions.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveSuggestionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setDismissSuggestions(true);
      return;
    }
    if ((e.key === 'Tab' || e.key === 'Enter') && cursorToken) {
      e.preventDefault();
      applySuggestion(suggestions[activeSuggestionIndex] ?? suggestions[0]);
    }
  };

  const statusMessage = hasError
    ? 'Parentheses are unbalanced.'
    : hasWarning
      ? `Unknown symbol${analysis.unknownVariables.length > 1 ? 's' : ''}: ${analysis.unknownVariables.join(', ')}`
      : null;

  return (
    <div className={`equation-editor ${compact ? 'compact' : ''}`} ref={rootRef}>
      <div className="equation-editor-top-row">
        <label htmlFor="equation-editor">Equation</label>
        {!compact && <div className="equation-function-picker-wrap">
          <select
            aria-label="Insert function"
            className="equation-function-picker"
            value={pickerValue}
            onChange={(event) => {
              const selected = availableFunctions.find((entry) => entry.key === event.target.value);
              if (!selected) {
                setPickerValue('');
                return;
              }
              if (onInsertFunction) {
                onInsertFunction(selected.template);
              } else {
                insertAtCaret(selected.template);
              }
              setPickerValue('');
            }}
            title="Pick a function to insert its template at cursor."
          >
            <option value="">Insert function...</option>
            {CATEGORY_ORDER.map((category) => {
              const rows = groupedFunctions.get(category) ?? [];
              if (rows.length === 0) return null;
              return (
                <optgroup key={category} label={category}>
                  {rows.map((entry) => (
                    <option key={entry.key} value={entry.key}>
                      {`${entry.displayName} - ${entry.template}`}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <span className="equation-function-picker-help" title="Pick a function to insert its template at cursor.">?</span>
        </div>}
      </div>
      <div
        className={`equation-editor-input-wrap ${isFocused ? 'is-focused' : ''} ${hasWarning ? 'has-warning' : ''} ${hasError ? 'has-error' : ''}`}
      >
        <div className="equation-editor-overlay" aria-hidden="true">
          <div
            className="equation-editor-overlay-content"
            style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}
          >
            {analysis.highlightedTokens.length > 0
              ? analysis.highlightedTokens.map((part, idx) => {
                  if (part.isVariable) {
                    return (
                      <span
                        key={`${part.text}-${idx}`}
                        className={`equation-inline-chip ${part.isConnected ? 'connected' : ''}`}
                      >
                        {part.text}
                      </span>
                    );
                  }
                  if (part.isUnknown) {
                    return (
                      <span key={`${part.text}-${idx}`} className="equation-inline-chip unknown">
                        {part.text}
                      </span>
                    );
                  }
                  return <span key={`${part.text}-${idx}`}>{part.text}</span>;
                })
              : ' '}
          </div>
        </div>
        <textarea
          ref={textRef}
          id="equation-editor"
          className="equation-editor-input"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onFocus={() => {
            setIsFocused(true);
            setDismissSuggestions(false);
          }}
          onBlur={() => setIsFocused(false)}
          onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft })}
          rows={rows}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={mode === 'suggest'}
          aria-controls={mode === 'suggest' ? SUGGESTION_LIST_ID : undefined}
          aria-activedescendant={mode === 'suggest' ? `equation-suggestion-${activeSuggestionIndex}` : undefined}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      {mode === 'suggest' ? (
        <div className="equation-smart-panel equation-suggestions-panel" role="listbox" id={SUGGESTION_LIST_ID} aria-label="Variable suggestions">
          {suggestions.map((name, idx) => (
            <button
              key={name}
              id={`equation-suggestion-${idx}`}
              type="button"
              role="option"
              aria-selected={idx === activeSuggestionIndex}
              className={idx === activeSuggestionIndex ? 'active' : ''}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => applySuggestion(name)}
              title={connectedSet.has(name) ? 'Connected variable' : 'Variable'}
            >
              <span className={`eq-chip-inline ${connectedSet.has(name) ? 'connected' : ''}`}>{name}</span>
            </button>
          ))}
        </div>
      ) : null}

      {mode === 'referenced' ? (
        <div className="equation-smart-panel equation-summary-panel">
          {analysis.referencedVariables.length > 0 || analysis.unknownVariables.length > 0 ? (
            <>
              <div className="equation-smart-panel-header">
                <span className="equation-recognized-label">Equation symbols</span>
                {statusMessage ? <span className={`equation-status ${hasError ? 'error' : 'warning'}`}>{statusMessage}</span> : null}
              </div>
              <div className="equation-chip-list">
                {analysis.referencedVariables.map((name) => (
                  <span key={`known-${name}`} className={`equation-chip ${connectedSet.has(name) ? 'connected' : ''}`}>
                    {name}
                  </span>
                ))}
                {analysis.unknownVariables.map((name) => (
                  <span key={`unknown-${name}`} className="equation-chip unknown">
                    {name}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="equation-smart-panel-empty">Type an equation to see detected symbols and quick suggestions.</div>
          )}
        </div>
      ) : null}

      {!compact && <p className="field-hint">Allowed: + - * / **, min/max/abs/exp/log, variable names.</p>}
    </div>
  );
}
