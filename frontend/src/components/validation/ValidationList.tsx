import { useEditorStore } from '../../state/editorStore';
import type { ValidationIssue, NodeModel } from '../../types/model';

const UNIT_CODES = new Set(['UNIT_MISMATCH_FLOW_STOCK', 'UNIT_MISSING_FLOW', 'UNIT_MISSING_STOCK']);

function hasUnits(n: NodeModel): n is NodeModel & { units?: string } {
  return n.type === 'stock' || n.type === 'flow' || n.type === 'aux' || n.type === 'lookup';
}

function UnitQuickFix({ issue }: { issue: ValidationIssue }) {
  const model = useEditorStore((s) => s.model);
  const updateNode = useEditorStore((s) => s.updateNode);
  const runValidate = useEditorStore((s) => s.runValidate);

  const apply = (nodeId: string, units: string) => {
    updateNode(nodeId, { units } as Partial<NodeModel>);
    void runValidate();
  };

  if (issue.code === 'UNIT_MISSING_FLOW' || issue.code === 'UNIT_MISSING_STOCK') {
    // node_id is the node missing units; find connected unit from flow_link neighbors
    const node = model.nodes.find((n) => n.id === issue.node_id);
    if (!node) return null;
    const neighborIds = new Set<string>();
    for (const edge of model.edges) {
      if (edge.type !== 'flow_link') continue;
      if (edge.source === node.id) neighborIds.add(edge.target);
      if (edge.target === node.id) neighborIds.add(edge.source);
    }
    const suggestedUnit = model.nodes
      .filter((n) => neighborIds.has(n.id) && hasUnits(n) && n.units)
      .map((n) => (n as NodeModel & { units: string }).units)[0];

    if (!suggestedUnit) return null;
    return (
      <button
        className="validation-fix-btn"
        onClick={(e) => {
          e.stopPropagation();
          apply(node.id, suggestedUnit);
        }}
      >
        Set to "{suggestedUnit}"
      </button>
    );
  }

  if (issue.code === 'UNIT_MISMATCH_FLOW_STOCK') {
    const edge = model.edges.find((e) => e.id === issue.edge_id);
    if (!edge) return null;
    const srcNode = model.nodes.find((n) => n.id === edge.source);
    const tgtNode = model.nodes.find((n) => n.id === edge.target);
    if (!srcNode || !tgtNode) return null;

    const stockNode = srcNode.type === 'stock' ? srcNode : tgtNode.type === 'stock' ? tgtNode : null;
    const flowNode = srcNode.type === 'flow' ? srcNode : tgtNode.type === 'flow' ? tgtNode : null;
    if (!stockNode || !flowNode || !hasUnits(stockNode) || !hasUnits(flowNode)) return null;

    const stockUnits = stockNode.units;
    const flowUnits = flowNode.units;
    if (!stockUnits || !flowUnits) return null;

    return (
      <span className="validation-fix-group">
        <button
          className="validation-fix-btn"
          onClick={(e) => {
            e.stopPropagation();
            apply(flowNode.id, stockUnits);
          }}
        >
          Set flow to "{stockUnits}"
        </button>
        <button
          className="validation-fix-btn"
          onClick={(e) => {
            e.stopPropagation();
            apply(stockNode.id, flowUnits);
          }}
        >
          Set stock to "{flowUnits}"
        </button>
      </span>
    );
  }

  return null;
}

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
            {UNIT_CODES.has(issue.code) && <UnitQuickFix issue={issue} />}
          </button>
        </li>
      ))}
    </ul>
  );
}
