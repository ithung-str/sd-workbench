import { describe, expect, it } from 'vitest';
import { generateTemplateCards } from './dashboardTemplates';
import { teacupModel, bathtubInventoryModel, supplyChainModel } from './sampleModels';

describe('generateTemplateCards', () => {
  it('blank template returns empty array', () => {
    expect(generateTemplateCards(teacupModel, 'blank')).toEqual([]);
  });

  it('overview template creates KPI + line per stock', () => {
    const cards = generateTemplateCards(bathtubInventoryModel, 'overview');
    // bathtub has 1 stock: inventory
    expect(cards).toHaveLength(2);
    expect(cards[0].type).toBe('kpi');
    expect(cards[0].variable).toBe('inventory');
    expect(cards[1].type).toBe('line');
    expect(cards[1].variable).toBe('inventory');
  });

  it('overview template scales with multiple stocks', () => {
    const cards = generateTemplateCards(supplyChainModel, 'overview');
    // supply chain has 3 stocks: raw_materials, work_in_progress, finished_goods
    expect(cards).toHaveLength(6); // 3 KPI + 3 line
    const kpis = cards.filter((c) => c.type === 'kpi');
    const lines = cards.filter((c) => c.type === 'line');
    expect(kpis).toHaveLength(3);
    expect(lines).toHaveLength(3);
  });

  it('all_variables template creates line per simulable node', () => {
    const cards = generateTemplateCards(teacupModel, 'all_variables');
    // teacup has: stock_temperature, aux_room_temperature, aux_characteristic_time, flow_temperature_change
    // 4 simulable nodes (clouds excluded)
    expect(cards).toHaveLength(4);
    expect(cards.every((c) => c.type === 'line')).toBe(true);
    const variables = cards.map((c) => c.variable);
    expect(variables).toContain('temperature');
    expect(variables).toContain('room_temperature');
    expect(variables).toContain('characteristic_time');
    expect(variables).toContain('temperature_change');
  });

  it('all_variables template excludes cloud and text nodes', () => {
    const cards = generateTemplateCards(bathtubInventoryModel, 'all_variables');
    // bathtub has: 1 stock + 2 flows + 2 clouds = 3 simulable
    expect(cards).toHaveLength(3);
    const variables = cards.map((c) => c.variable);
    expect(variables).toContain('inventory');
    expect(variables).toContain('inflow');
    expect(variables).toContain('outflow');
  });
});
