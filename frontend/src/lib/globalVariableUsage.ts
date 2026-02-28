import { tokenizeEquation } from '../components/inspector/equationEditorUtils';
import type { ModelDocument, NodeModel } from '../types/model';

export type GlobalVariableUsageItem = {
  id: string;
  name: string;
  label: string;
  type: 'stock' | 'flow';
};

export type GlobalVariableUsage = {
  stock: GlobalVariableUsageItem[];
  flow: GlobalVariableUsageItem[];
  total: number;
};

function equationForNode(node: NodeModel): string | null {
  if (node.type === 'stock' || node.type === 'flow' || node.type === 'aux' || node.type === 'lookup') {
    return node.equation;
  }
  return null;
}

function identifierSet(equation: string): Set<string> {
  return new Set(
    tokenizeEquation(equation)
      .filter((segment) => segment.kind === 'identifier')
      .map((segment) => segment.text),
  );
}

function usageItem(node: NodeModel): GlobalVariableUsageItem | null {
  if (node.type !== 'stock' && node.type !== 'flow') return null;
  return {
    id: node.id,
    name: node.name,
    label: node.label,
    type: node.type,
  };
}

export function collectGlobalVariableUsage(model: ModelDocument): Record<string, GlobalVariableUsage> {
  const globals = model.global_variables ?? [];
  const usageById: Record<string, GlobalVariableUsage> = {};
  const idsByName = new Map<string, string[]>();

  for (const variable of globals) {
    usageById[variable.id] = { stock: [], flow: [], total: 0 };
    const ids = idsByName.get(variable.name) ?? [];
    ids.push(variable.id);
    idsByName.set(variable.name, ids);
  }

  for (const node of model.nodes) {
    const equation = equationForNode(node);
    if (!equation) continue;
    const item = usageItem(node);
    if (!item) continue;

    const symbols = identifierSet(equation);
    for (const symbol of symbols) {
      const globalIds = idsByName.get(symbol);
      if (!globalIds?.length) continue;
      for (const id of globalIds) {
        const usage = usageById[id];
        if (!usage) continue;
        if (item.type === 'stock') usage.stock.push(item);
        if (item.type === 'flow') usage.flow.push(item);
        usage.total += 1;
      }
    }
  }

  return usageById;
}
