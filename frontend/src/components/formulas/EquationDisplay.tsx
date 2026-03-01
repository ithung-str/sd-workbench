import { useMemo } from 'react';
import {
  analyzeEquation,
  DEFAULT_FUNCTION_NAMES,
  DEFAULT_RESERVED_NAMES,
} from '../inspector/equationEditorUtils';

type Props = {
  equation: string;
  variableNames: string[];
  connectedVariableNames: string[];
};

const reservedSet = new Set(DEFAULT_RESERVED_NAMES.map((n) => n.toLowerCase()));
const functionSet = new Set(DEFAULT_FUNCTION_NAMES.map((n) => n.toLowerCase()));

export function EquationDisplay({ equation, variableNames, connectedVariableNames }: Props) {
  const connectedSet = useMemo(() => new Set(connectedVariableNames), [connectedVariableNames]);

  const analysis = useMemo(
    () => analyzeEquation(equation, variableNames, connectedSet, reservedSet, functionSet),
    [equation, variableNames, connectedSet],
  );

  if (!equation) return <span style={{ color: '#999', fontStyle: 'italic' }}>(empty)</span>;

  return (
    <span style={{ fontFamily: 'monospace', fontSize: '0.82rem', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
      {analysis.highlightedTokens.map((token, i) => {
        if (token.isVariable) {
          return (
            <span
              key={i}
              className={`equation-inline-chip${token.isConnected ? ' connected' : ''}`}
            >
              {token.text}
            </span>
          );
        }
        if (token.isUnknown) {
          return (
            <span key={i} className="equation-inline-chip unknown">
              {token.text}
            </span>
          );
        }
        return <span key={i}>{token.text}</span>;
      })}
    </span>
  );
}
