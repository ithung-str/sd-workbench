import { describe, it, expect } from 'vitest';
import { parseCSV } from './csvParser';

describe('parseCSV', () => {
  it('parses a simple CSV string', async () => {
    const csv = 'Name,Age,Score\nAlice,30,95.5\nBob,25,87.2\n';
    const file = new File([csv], 'test.csv', { type: 'text/csv' });
    const table = await parseCSV(file);

    expect(table.name).toBe('test');
    expect(table.source).toBe('csv');
    expect(table.columns).toHaveLength(3);
    expect(table.columns[0]).toEqual({ key: 'Name', label: 'Name', type: 'string' });
    expect(table.columns[1]).toEqual({ key: 'Age', label: 'Age', type: 'number' });
    expect(table.columns[2]).toEqual({ key: 'Score', label: 'Score', type: 'number' });
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toEqual(['Alice', 30, 95.5]);
    expect(table.rows[1]).toEqual(['Bob', 25, 87.2]);
  });

  it('handles missing values as null', async () => {
    const csv = 'A,B\n1,\n,hello\n';
    const file = new File([csv], 'gaps.csv', { type: 'text/csv' });
    const table = await parseCSV(file);

    expect(table.rows[0]).toEqual([1, null]);
    expect(table.rows[1]).toEqual([null, 'hello']);
  });

  it('auto-detects number columns', async () => {
    const csv = 'id,value\n1,100\n2,200\n3,300\n';
    const file = new File([csv], 'numbers.csv', { type: 'text/csv' });
    const table = await parseCSV(file);

    expect(table.columns[0].type).toBe('number');
    expect(table.columns[1].type).toBe('number');
  });

  it('marks mixed columns as string', async () => {
    const csv = 'label,value\nfoo,100\nbar,baz\n';
    const file = new File([csv], 'mixed.csv', { type: 'text/csv' });
    const table = await parseCSV(file);

    expect(table.columns[0].type).toBe('string');
    expect(table.columns[1].type).toBe('string');
  });
});
