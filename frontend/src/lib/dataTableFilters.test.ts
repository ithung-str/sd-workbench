import { describe, expect, it } from 'vitest';
import { applyFilters, getUniqueColumnValues, type CardFilter } from './dataTableFilters';
import type { DataTable } from '../types/dataTable';

const TABLE: DataTable = {
  id: 't1',
  name: 'Test',
  source: 'csv',
  description: '',
  tags: [],
  columns: [
    { key: 'name', label: 'Name', type: 'string' },
    { key: 'age', label: 'Age', type: 'number' },
    { key: 'city', label: 'City', type: 'string' },
  ],
  rows: [
    ['Alice', 30, 'Amsterdam'],
    ['Bob', 25, 'Berlin'],
    ['Charlie', 35, 'Amsterdam'],
    ['Diana', 28, 'Copenhagen'],
  ],
  createdAt: '',
  updatedAt: '',
};

describe('applyFilters', () => {
  it('returns all rows when no filters', () => {
    expect(applyFilters(TABLE, [])).toEqual(TABLE.rows);
  });

  it('filters string equals', () => {
    const filters: CardFilter[] = [{ column: 'city', operator: 'equals', value: 'Amsterdam' }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(2);
    expect(result[0][0]).toBe('Alice');
    expect(result[1][0]).toBe('Charlie');
  });

  it('filters string not_equals', () => {
    const filters: CardFilter[] = [{ column: 'city', operator: 'not_equals', value: 'Amsterdam' }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(2);
  });

  it('filters string contains', () => {
    const filters: CardFilter[] = [{ column: 'name', operator: 'contains', value: 'li' }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(2); // Alice, Charlie
  });

  it('filters is_one_of', () => {
    const filters: CardFilter[] = [{ column: 'city', operator: 'is_one_of', value: ['Amsterdam', 'Berlin'] }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(3);
  });

  it('filters numeric >', () => {
    const filters: CardFilter[] = [{ column: 'age', operator: '>', value: '29' }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(2); // Alice(30), Charlie(35)
  });

  it('filters numeric <', () => {
    const filters: CardFilter[] = [{ column: 'age', operator: '<', value: '28' }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(1); // Bob(25)
  });

  it('filters numeric >=', () => {
    const filters: CardFilter[] = [{ column: 'age', operator: '>=', value: '30' }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(2);
  });

  it('filters numeric <=', () => {
    const filters: CardFilter[] = [{ column: 'age', operator: '<=', value: '28' }];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(2); // Bob(25), Diana(28)
  });

  it('combines multiple filters with AND', () => {
    const filters: CardFilter[] = [
      { column: 'city', operator: 'equals', value: 'Amsterdam' },
      { column: 'age', operator: '>', value: '30' },
    ];
    const result = applyFilters(TABLE, filters);
    expect(result).toHaveLength(1); // Charlie
  });
});

describe('getUniqueColumnValues', () => {
  it('returns sorted unique string values', () => {
    const values = getUniqueColumnValues(TABLE, 'city');
    expect(values).toEqual(['Amsterdam', 'Berlin', 'Copenhagen']);
  });

  it('returns empty array for unknown column', () => {
    expect(getUniqueColumnValues(TABLE, 'unknown')).toEqual([]);
  });
});
