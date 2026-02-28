import { useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';

type Props = {
  value: string;
  onChange: (v: string) => void;
  variableNames?: string[];
  connectedVariableNames?: string[];
};

type CursorToken = {
  token: string;
  start: number;
  end: number;
};

type HighlightToken = {
  text: string;
  isVariable: boolean;
  isConnected: boolean;
};

const RESERVED = new Set(['min', 'max', 'abs', 'exp', 'log']);

function getCursorToken(text: string, caret: number): CursorToken | null {
  const isTokenChar = (ch: string) => /[A-Za-z0-9_]/.test(ch);
  let start = caret;
  let end = caret;
  while (start > 0 && isTokenChar(text[start - 1])) start -= 1;
  while (end < text.length && isTokenChar(text[end])) end += 1;
  if (start === end) return null;
  return { token: text.slice(start, end), start, end };
}

function extractReferencedVariables(value: string, variableNames: string[]) {
  const all = new Set(variableNames);
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of value.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
    const token = match[0];
    if (RESERVED.has(token)) continue;
    if (!all.has(token)) continue;
    if (seen.has(token)) continue;
    seen.add(token);
    ordered.push(token);
  }
  return ordered;
}

function highlightEquationTokens(value: string, variableNames: string[], connectedSet: Set<string>): HighlightToken[] {
  if (!value) return [];
  const all = new Set(variableNames);
  const parts: HighlightToken[] = [];
  let idx = 0;
  for (const match of value.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
    const token = match[0];
    const start = match.index ?? 0;
    const end = start + token.length;
    if (start > idx) {
      parts.push({ text: value.slice(idx, start), isVariable: false, isConnected: false });
    }
    const isVariable = !RESERVED.has(token) && all.has(token);
    parts.push({ text: token, isVariable, isConnected: isVariable && connectedSet.has(token) });
    idx = end;
  }
  if (idx < value.length) {
    parts.push({ text: value.slice(idx), isVariable: false, isConnected: false });
  }
  return parts;
}

export function EquationEditor({
  value,
  onChange,
  variableNames = [],
  connectedVariableNames = [],
}: Props) {
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [caret, setCaret] = useState<number>(value.length);
  const [scroll, setScroll] = useState({ top: 0, left: 0 });

  const connectedSet = useMemo(() => new Set(connectedVariableNames), [connectedVariableNames]);

  const cursorToken = useMemo(() => getCursorToken(value, caret), [value, caret]);

  const suggestions = useMemo(() => {
    const q = cursorToken?.token ?? '';
    if (!q) return [];
    const lower = q.toLowerCase();
    return [...new Set(variableNames)]
      .filter((name) => name.toLowerCase().startsWith(lower))
      .sort((a, b) => {
        const ac = connectedSet.has(a) ? 0 : 1;
        const bc = connectedSet.has(b) ? 0 : 1;
        if (ac !== bc) return ac - bc;
        return a.localeCompare(b);
      })
      .slice(0, 8);
  }, [cursorToken, variableNames, connectedSet]);

  const referencedVariables = useMemo(() => extractReferencedVariables(value, variableNames), [value, variableNames]);
  const highlightedTokens = useMemo(
    () => highlightEquationTokens(value, variableNames, connectedSet),
    [value, variableNames, connectedSet],
  );

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
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length === 0) return;
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
    if ((e.key === 'Tab' || e.key === 'Enter') && cursorToken) {
      e.preventDefault();
      applySuggestion(suggestions[activeSuggestionIndex] ?? suggestions[0]);
    }
  };

  return (
    <div className="equation-editor">
      <label htmlFor="equation-editor">Equation</label>
      <div className="equation-editor-input-wrap">
        <div className="equation-editor-overlay" aria-hidden="true">
          <div
            className="equation-editor-overlay-content"
            style={{ transform: `translate(${-scroll.left}px, ${-scroll.top}px)` }}
          >
            {highlightedTokens.length > 0
              ? highlightedTokens.map((part, idx) =>
                  part.isVariable ? (
                    <span
                      key={`${part.text}-${idx}`}
                      className={`equation-inline-chip ${part.isConnected ? 'connected' : ''}`}
                    >
                      {part.text}
                    </span>
                  ) : (
                    <span key={`${part.text}-${idx}`}>{part.text}</span>
                  ),
                )
              : ' '}
          </div>
        </div>
        <textarea
          ref={textRef}
          id="equation-editor"
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onClick={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onKeyUp={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
          onScroll={(e) => setScroll({ top: e.currentTarget.scrollTop, left: e.currentTarget.scrollLeft })}
          rows={4}
          autoComplete="off"
          spellCheck={false}
        />
        {suggestions.length > 0 ? (
          <div className="equation-suggestions" role="listbox" aria-label="Variable suggestions">
            {suggestions.map((name, idx) => (
              <button
                key={name}
                type="button"
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
      </div>
      {referencedVariables.length > 0 ? (
        <div className="equation-recognized">
          <span className="equation-recognized-label">Detected variables</span>
          <div className="equation-chip-list">
            {referencedVariables.map((name) => (
              <span key={name} className={`equation-chip ${connectedSet.has(name) ? 'connected' : ''}`}>
                {name}
              </span>
            ))}
          </div>
        </div>
      ) : null}
      <p className="field-hint">Allowed: + - * / **, min/max/abs/exp/log, variable names</p>
    </div>
  );
}
