import { describe, expect, it } from 'vitest';
import type { ModelDocument } from '../types/model';
import { collectGlobalVariableUsage } from './globalVariableUsage';

const model: ModelDocument = {
  id: 'm1',
  name: 'usage-test',
  version: 1,
  nodes: [
    {
      id: 'stock_1',
      type: 'stock',
      name: 'inventory',
      label: 'Inventory',
      equation: 'demand_rate * order_size',
      initial_value: 10,
      position: { x: 0, y: 0 },
    },
    {
      id: 'flow_1',
      type: 'flow',
      name: 'inflow',
      label: 'Inflow',
      equation: 'order_size + 1',
      position: { x: 100, y: 100 },
    },
    {
      id: 'aux_1',
      type: 'aux',
      name: 'demand_rate',
      label: 'Demand Rate',
      equation: '5',
      position: { x: 200, y: 200 },
    },
  ],
  edges: [],
  outputs: [],
  global_variables: [
    { id: 'g1', name: 'order_size', equation: '2' },
    { id: 'g2', name: 'unused_global', equation: '10' },
  ],
};

describe('collectGlobalVariableUsage', () => {
  it('returns stock and flow usages for globals', () => {
    const usage = collectGlobalVariableUsage(model);

    expect(usage.g1.total).toBe(2);
    expect(usage.g1.stock.map((row) => row.id)).toEqual(['stock_1']);
    expect(usage.g1.flow.map((row) => row.id)).toEqual(['flow_1']);
    expect(usage.g2.total).toBe(0);
    expect(usage.g2.stock).toHaveLength(0);
    expect(usage.g2.flow).toHaveLength(0);
  });
});
