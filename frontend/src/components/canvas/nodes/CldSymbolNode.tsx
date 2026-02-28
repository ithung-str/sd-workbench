type CldSymbolNodeData = {
  symbol: '+' | '-' | '||' | 'R' | 'B';
  loopDirection?: 'clockwise' | 'counterclockwise';
  name?: string;
};

export function CldSymbolNodeView({ data }: { data: CldSymbolNodeData }) {
  const symbol = data.symbol || '+';
  const symbolClass = symbol.replace(/\|/g, 'pipe');
  const isLoop = symbol === 'R' || symbol === 'B';
  const loopDirection = data.loopDirection ?? (symbol === 'B' ? 'counterclockwise' : 'clockwise');
  const name = data.name?.trim();
  return (
    <div className={`rf-node rf-node-cld-symbol rf-node-cld-symbol-${symbolClass}`}>
      {isLoop ? (
        <svg className="rf-node-cld-loop" viewBox="0 0 32 32" aria-hidden="true">
          {loopDirection === 'clockwise' ? (
            <>
              <path
                className="rf-node-cld-loop-path"
                d="M8 7c2.7-2.6 6.3-4 10.1-3.8 7 .3 12.6 6.2 12.6 13.2 0 5.9-4 10.9-9.5 12.5"
              />
              <path className="rf-node-cld-loop-arrow" d="M7.6 10.7l.1-5.7 5.2 1.9" />
            </>
          ) : (
            <>
              <path
                className="rf-node-cld-loop-path"
                d="M24 7c-2.7-2.6-6.3-4-10.1-3.8-7 .3-12.6 6.2-12.6 13.2 0 5.9 4 10.9 9.5 12.5"
              />
              <path className="rf-node-cld-loop-arrow" d="M24.4 10.7l-.1-5.7-5.2 1.9" />
            </>
          )}
          <text x="16" y="20" textAnchor="middle" className="rf-node-cld-loop-letter">
            {symbol}
          </text>
        </svg>
      ) : (
        <div className="rf-node-cld-symbol-text">{symbol}</div>
      )}
      {name ? <div className="rf-node-cld-symbol-name">{name}</div> : null}
    </div>
  );
}
