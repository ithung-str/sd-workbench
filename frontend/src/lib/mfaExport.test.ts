import { describe, expect, it } from 'vitest';
import { bathtubInventoryModel, cloneModel } from './sampleModels';
import { buildMfaYamlDocument, mfaYamlString } from './mfaExport';
import type { SimulateResponse } from '../types/model';

const baseResults: SimulateResponse = {
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

describe('mfaExport', () => {
  it('emits spec-compliant yaml fields for full time series', () => {
    const model = cloneModel(bathtubInventoryModel);
    const doc = buildMfaYamlDocument(model, baseResults, {
      requestedTime: 1,
      anchorDate: '2021-01-01',
      timeUnit: 'day',
      missingValueRule: 'carry_forward',
    });

    expect(doc.title).toBe('Bathtub Inventory');
    expect(doc.groups).toEqual([]);
    expect(doc.diagramStyle.timeSeriesEnabled).toBe(true);
    expect(doc.diagramStyle.selectedTimePoint).toBe('2021-01-02');
    expect(doc.diagramStyle.timeSeriesMissingValueRule).toBe('carry_forward');

    const stock = doc.nodes.find((n) => n.id === 'stock_inventory');
    expect(stock?.title).toBe('Inventory');
    expect(stock?.stock).toBe(12);
    expect(stock?.stockSeries?.['2021-01-01']).toBe(10);
    expect(stock?.stockSeries?.['2021-01-03']).toBe(14);

    const link = doc.links.find((l) => l.id === 'cloud_source_flow_inflow_to_stock_inventory');
    expect(link?.source).toBe('cloud_source_flow_inflow');
    expect(link?.target).toBe('stock_inventory');
    expect(link?.value).toBe(4);
    expect(link?.valueSeries?.['2021-01-01']).toBe(3);

    const yaml = mfaYamlString(doc);
    expect(yaml).toContain('groups: []');
    expect(yaml).toContain('diagramStyle:');
    expect(yaml).toContain('timeSeriesEnabled: true');
    expect(yaml).toContain('timeSeriesMissingValueRule: carry_forward');
    expect(yaml).not.toContain('\n    name:');
  });

  it('maps non-day time with year and month units', () => {
    const model = cloneModel(bathtubInventoryModel);
    const yearlyResults: SimulateResponse = {
      ...baseResults,
      series: {
        ...baseResults.series,
        time: [2021, 2022],
        inflow: [3, 4],
        outflow: [1, 2],
        inventory: [10, 12],
      },
      metadata: { engine: 'pysd', row_count: 2, variables_returned: ['time', 'inflow', 'outflow', 'inventory'] },
    };

    const yearly = buildMfaYamlDocument(model, yearlyResults, {
      requestedTime: 2022,
      timeUnit: 'year',
      missingValueRule: 'carry_forward',
    });
    const yearlyStock = yearly.nodes.find((n) => n.id === 'stock_inventory');
    expect(yearlyStock?.stockSeries?.['2021-01-01']).toBe(10);
    expect(yearlyStock?.stockSeries?.['2022-01-01']).toBe(12);
    expect(yearly.diagramStyle.selectedTimePoint).toBe('2022-01-01');

    const monthly = buildMfaYamlDocument(model, baseResults, {
      anchorDate: '2020-01-01',
      timeUnit: 'month',
      missingValueRule: 'carry_forward',
    });
    const monthlyStock = monthly.nodes.find((n) => n.id === 'stock_inventory');
    expect(monthlyStock?.stockSeries?.['2020-01-01']).toBe(10);
    expect(monthlyStock?.stockSeries?.['2020-02-01']).toBe(12);
    expect(monthlyStock?.stockSeries?.['2020-03-01']).toBe(14);
  });

  it('applies missing value rules for stock and flow series', () => {
    const model = cloneModel(bathtubInventoryModel);
    const sparseResults: SimulateResponse = {
      ...baseResults,
      series: {
        ...baseResults.series,
        inflow: [3, Number.NaN, 9],
        inventory: [10, Number.NaN, 20],
      },
    };

    const carry = buildMfaYamlDocument(model, sparseResults, {
      anchorDate: '2021-01-01',
      timeUnit: 'day',
      missingValueRule: 'carry_forward',
    });
    const carryStock = carry.nodes.find((n) => n.id === 'stock_inventory');
    const carryLink = carry.links.find((l) => l.id === 'cloud_source_flow_inflow_to_stock_inventory');
    expect(carryStock?.stockSeries?.['2021-01-02']).toBe(10);
    expect(carryLink?.valueSeries?.['2021-01-02']).toBe(3);

    const fallback = buildMfaYamlDocument(model, sparseResults, {
      anchorDate: '2021-01-01',
      timeUnit: 'day',
      missingValueRule: 'fallback_scalar',
    });
    const fallbackStock = fallback.nodes.find((n) => n.id === 'stock_inventory');
    const fallbackLink = fallback.links.find((l) => l.id === 'cloud_source_flow_inflow_to_stock_inventory');
    expect(fallbackStock?.stockSeries?.['2021-01-02']).toBe(10);
    expect(fallbackLink?.valueSeries?.['2021-01-02']).toBe(3);

    const exact = buildMfaYamlDocument(model, sparseResults, {
      anchorDate: '2021-01-01',
      timeUnit: 'day',
      missingValueRule: 'exact',
    });
    const exactStock = exact.nodes.find((n) => n.id === 'stock_inventory');
    const exactLink = exact.links.find((l) => l.id === 'cloud_source_flow_inflow_to_stock_inventory');
    expect(exactStock?.stockSeries?.['2021-01-02']).toBeUndefined();
    expect(exactLink?.valueSeries?.['2021-01-02']).toBeUndefined();
  });

  it('supports selected time-slice mode without series arrays', () => {
    const model = cloneModel(bathtubInventoryModel);
    const doc = buildMfaYamlDocument(model, baseResults, {
      requestedTime: 1,
      anchorDate: '2021-01-01',
      timeUnit: 'day',
      missingValueRule: 'carry_forward',
      mode: 'time_slice',
    });

    expect(doc.diagramStyle.timeSeriesEnabled).toBe(false);
    const stock = doc.nodes.find((n) => n.id === 'stock_inventory');
    expect(stock?.stock).toBe(12);
    expect(stock?.stockSeries).toBeUndefined();

    const link = doc.links.find((l) => l.id === 'cloud_source_flow_inflow_to_stock_inventory');
    expect(link?.value).toBe(4);
    expect(link?.valueSeries).toBeUndefined();

    const yaml = mfaYamlString(doc);
    expect(yaml).toContain('timeSeriesEnabled: false');
    expect(yaml).not.toContain('stockSeries:');
    expect(yaml).not.toContain('valueSeries:');
  });
});
