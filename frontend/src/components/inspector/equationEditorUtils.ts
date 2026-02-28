export type SuggestionMode = 'suggest' | 'referenced' | 'hidden';

export type TokenKind =
  | 'identifier'
  | 'number'
  | 'operator'
  | 'paren'
  | 'whitespace'
  | 'punctuation';

export type TokenSegment = {
  text: string;
  kind: TokenKind;
  start: number;
  end: number;
};

export type CursorToken = {
  token: string;
  start: number;
  end: number;
};

export type HighlightToken = {
  text: string;
  isVariable: boolean;
  isConnected: boolean;
  isUnknown: boolean;
};

const IDENTIFIER_START = /[A-Za-z_]/;
const IDENTIFIER_CHAR = /[A-Za-z0-9_]/;
const NUMBER_CHAR = /[0-9.]/;
const OPERATOR_CHAR = /[+\-*/^=<>!&|%]/;
const PAREN_CHAR = /[()[\]{}]/;
const WHITESPACE_CHAR = /\s/;

export const DEFAULT_RESERVED_NAMES = ['min', 'max', 'abs', 'exp', 'log', 'time'] as const;
export const DEFAULT_FUNCTION_NAMES = [
  'min',
  'max',
  'abs',
  'exp',
  'log',
  'step',
  'ramp',
  'pulse',
  'pulse_train',
  'delay',
  'delay1',
  'delay3',
  'delayn',
  'smooth',
  'smooth3',
  'smoothn',
] as const;

export function tokenizeEquation(value: string): TokenSegment[] {
  const out: TokenSegment[] = [];
  let i = 0;

  while (i < value.length) {
    const ch = value[i];
    const start = i;

    if (WHITESPACE_CHAR.test(ch)) {
      while (i < value.length && WHITESPACE_CHAR.test(value[i])) i += 1;
      out.push({ text: value.slice(start, i), kind: 'whitespace', start, end: i });
      continue;
    }

    if (IDENTIFIER_START.test(ch)) {
      i += 1;
      while (i < value.length && IDENTIFIER_CHAR.test(value[i])) i += 1;
      out.push({ text: value.slice(start, i), kind: 'identifier', start, end: i });
      continue;
    }

    if (NUMBER_CHAR.test(ch)) {
      i += 1;
      while (i < value.length && /[0-9.eE+-]/.test(value[i])) i += 1;
      out.push({ text: value.slice(start, i), kind: 'number', start, end: i });
      continue;
    }

    if (OPERATOR_CHAR.test(ch)) {
      i += 1;
      while (i < value.length && OPERATOR_CHAR.test(value[i])) i += 1;
      out.push({ text: value.slice(start, i), kind: 'operator', start, end: i });
      continue;
    }

    if (PAREN_CHAR.test(ch)) {
      i += 1;
      out.push({ text: value.slice(start, i), kind: 'paren', start, end: i });
      continue;
    }

    i += 1;
    out.push({ text: value.slice(start, i), kind: 'punctuation', start, end: i });
  }

  return out;
}

export function getCursorToken(text: string, caret: number): CursorToken | null {
  const isTokenChar = (ch: string) => IDENTIFIER_CHAR.test(ch);
  let start = caret;
  let end = caret;
  while (start > 0 && isTokenChar(text[start - 1])) start -= 1;
  while (end < text.length && isTokenChar(text[end])) end += 1;
  if (start === end) return null;
  return { token: text.slice(start, end), start, end };
}

function sortUnique(items: string[]): string[] {
  return [...new Set(items)];
}

export function rankSuggestions(
  query: string,
  variableNames: string[],
  connectedSet: Set<string>,
  maxSuggestions: number,
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];

  const deduped = sortUnique(variableNames).filter(Boolean);
  const scored = deduped.map((name) => {
    const lower = name.toLowerCase();
    const isPrefix = lower.startsWith(q);
    const isConnected = connectedSet.has(name);
    const isContains = !isPrefix && lower.includes(q);
    const isSubsequence =
      !isPrefix &&
      !isContains &&
      q.split('').every((char, idx) => {
        const prevIdx = idx === 0 ? -1 : lower.indexOf(q[idx - 1], 0);
        return lower.indexOf(char, prevIdx + 1) >= 0;
      });

    const bucket = isPrefix ? 0 : isConnected ? 1 : isContains ? 2 : isSubsequence ? 3 : 4;
    return { name, bucket, isConnected, len: name.length };
  });

  return scored
    .sort((a, b) => {
      if (a.bucket !== b.bucket) return a.bucket - b.bucket;
      if (a.isConnected !== b.isConnected) return a.isConnected ? -1 : 1;
      if (a.len !== b.len) return a.len - b.len;
      return a.name.localeCompare(b.name);
    })
    .slice(0, maxSuggestions)
    .map((entry) => entry.name);
}

export function analyzeEquation(
  value: string,
  variableNames: string[],
  connectedSet: Set<string>,
  reservedNames: Set<string>,
  functionNames: Set<string>,
): {
  highlightedTokens: HighlightToken[];
  referencedVariables: string[];
  unknownVariables: string[];
  hasParenError: boolean;
} {
  if (!value) {
    return { highlightedTokens: [], referencedVariables: [], unknownVariables: [], hasParenError: false };
  }

  const knownVariables = new Set(variableNames);
  const referencedVariables: string[] = [];
  const unknownVariables: string[] = [];
  const seenKnown = new Set<string>();
  const seenUnknown = new Set<string>();
  let depth = 0;
  let hasParenError = false;

  const highlightedTokens = tokenizeEquation(value).map((segment) => {
    if (segment.kind !== 'identifier') {
      if (segment.kind === 'paren') {
        if (segment.text === '(' || segment.text === '[' || segment.text === '{') depth += 1;
        if (segment.text === ')' || segment.text === ']' || segment.text === '}') depth -= 1;
        if (depth < 0) hasParenError = true;
      }
      return { text: segment.text, isVariable: false, isConnected: false, isUnknown: false };
    }

    const token = segment.text;
    const lower = token.toLowerCase();
    const isReservedOrFunction = reservedNames.has(lower) || functionNames.has(lower);
    const isVariable = !isReservedOrFunction && knownVariables.has(token);
    const isUnknown = !isReservedOrFunction && !isVariable;

    if (isVariable && !seenKnown.has(token)) {
      seenKnown.add(token);
      referencedVariables.push(token);
    }
    if (isUnknown && !seenUnknown.has(token)) {
      seenUnknown.add(token);
      unknownVariables.push(token);
    }

    return {
      text: token,
      isVariable,
      isConnected: isVariable && connectedSet.has(token),
      isUnknown,
    };
  });

  if (depth !== 0) hasParenError = true;

  return { highlightedTokens, referencedVariables, unknownVariables, hasParenError };
}
