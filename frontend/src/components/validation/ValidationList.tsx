import { useEditorStore } from '../../state/editorStore';

export function ValidationList() {
  const validation = useEditorStore((s) => s.validation);
  const localIssues = useEditorStore((s) => s.localIssues);
  const setSelected = useEditorStore((s) => s.setSelected);

  const issues = [...localIssues, ...validation.errors, ...validation.warnings];

  if (issues.length === 0) {
    return <p className="muted">No validation issues.</p>;
  }

  return (
    <ul className="validation-list">
      {issues.map((issue, idx) => (
        <li key={`${issue.code}-${idx}`}>
          <button
            className={`validation-item ${issue.severity}`}
            onClick={() => issue.node_id && setSelected({ kind: 'node', id: issue.node_id })}
          >
            <span className="validation-code">{issue.code}</span>
            <span>{issue.message}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
