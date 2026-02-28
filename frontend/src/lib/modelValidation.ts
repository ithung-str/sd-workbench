import type { ModelDocument, ValidationIssue } from '../types/model';

export function localValidate(model: ModelDocument): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const names = new Set<string>();
  for (const variable of model.global_variables ?? []) {
    if (!variable.name.trim()) {
      issues.push({
        code: 'EMPTY_GLOBAL_NAME',
        message: 'Global variable name is required',
        severity: 'error',
        field: 'global_variables.name',
        symbol: variable.id,
      });
      continue;
    }
    if (names.has(variable.name)) {
      issues.push({
        code: 'DUPLICATE_VARIABLE_NAME',
        message: `Duplicate variable name '${variable.name}'`,
        severity: 'error',
        field: 'global_variables.name',
        symbol: variable.name,
      });
    }
    names.add(variable.name);
    if (!variable.equation.trim()) {
      issues.push({
        code: 'EMPTY_GLOBAL_EQUATION',
        message: `Global variable '${variable.name}' must have an equation`,
        severity: 'error',
        field: 'global_variables.equation',
        symbol: variable.name,
      });
    }
  }
  for (const node of model.nodes) {
    if (node.type === 'text' || node.type === 'cloud' || node.type === 'cld_symbol') {
      continue;
    }
    if (!node.name.trim()) {
      issues.push({ code: 'EMPTY_NAME', message: 'Node name is required', severity: 'error', node_id: node.id, field: 'name' });
    }
    if (names.has(node.name)) {
      issues.push({ code: 'DUPLICATE_VARIABLE_NAME', message: `Duplicate variable name '${node.name}'`, severity: 'error', node_id: node.id, field: 'name', symbol: node.name });
    }
    names.add(node.name);
    if (!node.equation.trim()) {
      issues.push({ code: 'EMPTY_EQUATION', message: 'Equation is required', severity: 'error', node_id: node.id, field: 'equation' });
    }
    if (node.type === 'lookup') {
      if (!node.points || node.points.length < 2) {
        issues.push({ code: 'LOOKUP_POINTS_REQUIRED', message: 'Lookup needs at least 2 points', severity: 'error', node_id: node.id, field: 'points' });
      } else {
        const xs = node.points.map((p) => p.x);
        for (let i = 1; i < xs.length; i += 1) {
          if (xs[i] <= xs[i - 1]) {
            issues.push({ code: 'LOOKUP_X_ORDER', message: 'Lookup x values must be strictly increasing', severity: 'error', node_id: node.id, field: 'points' });
            break;
          }
        }
      }
    }
    if (node.type === 'stock' && node.initial_value === '') {
      issues.push({ code: 'MISSING_INITIAL_VALUE', message: 'Stock requires initial value', severity: 'error', node_id: node.id, field: 'initial_value' });
    }
  }
  return issues;
}
