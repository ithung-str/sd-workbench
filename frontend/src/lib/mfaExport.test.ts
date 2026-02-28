import { describe, expect, it } from 'vitest';
import { bathtubInventoryModel, cloneModel } from './sampleModels';
import { buildMfaYamlDocument, mfaYamlString } from './mfaExport';
import type { SimulateResponse } from '../types/model';

describe('mfaExport', () => {
  it('builds links from flow endpoints and picks nearest time slice', () => {
    const model = cloneModel(bathtubInventoryModel);
    const results: SimulateResponse = {
      ok: true,
      warnings: [],
      metadata: { engine: 'pysd', row_count: 3, variables_returned: ['time', 'inflow', 'outflow', 'inventory'] },
      series: {
        time: [0, 1, 2],
        inflow: [3, 4, 5],
        outflow: [1, 2, 3],
        inventory: [10, 12, 14],
      },
    };

    const doc = buildMfaYamlDocument(model, results, 1.4);
    expect(doc.links.length).toBe(2);
    expect(doc.links.find((l) => l.id === 'cloud_2-Inventory')?.value).toBe(4);
    expect(doc.links.find((l) => l.id === 'Inventory-cloud_3')?.value).toBe(2);

    const yaml = mfaYamlString(doc);
    expect(yaml).toContain('title: Material Flow Analysis (t=1)');
    expect(yaml).toContain('source: cloud_2');
    expect(yaml).toContain('target: Inventory');
    expect(yaml).toContain('id: Inventory');
    expect(yaml).toContain('stock: 12');
    expect(yaml).not.toContain('id: cloud_2\n    title: cloud_2\n    name: cloud_2\n    stock:');
  });
});
