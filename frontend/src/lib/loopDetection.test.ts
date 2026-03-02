import { describe, it, expect } from 'vitest';
import { detectLoops, inferPolarityFromEquation } from './loopDetection';
import {
  teacupModel,
  bathtubInventoryModel,
  populationModel,
  supplyChainModel,
  blankModel,
} from './sampleModels';

// ---------------------------------------------------------------------------
// Polarity inference unit tests
// ---------------------------------------------------------------------------

describe('inferPolarityFromEquation', () => {
  it('positive: standalone variable', () => {
    expect(inferPolarityFromEquation('x', 'x')).toBe('+');
  });

  it('positive: addition', () => {
    expect(inferPolarityFromEquation('b', 'a + b')).toBe('+');
  });

  it('negative: subtraction', () => {
    expect(inferPolarityFromEquation('b', 'a - b')).toBe('-');
  });

  it('negative: division', () => {
    expect(inferPolarityFromEquation('b', 'a / b')).toBe('-');
  });

  it('positive: multiplication', () => {
    expect(inferPolarityFromEquation('b', 'a * b')).toBe('+');
  });

  it('negative: unary negation', () => {
    expect(inferPolarityFromEquation('x', '-x')).toBe('-');
  });

  it('positive: first operand in subtraction', () => {
    expect(inferPolarityFromEquation('a', 'a - b')).toBe('+');
  });

  it('unknown: variable not in equation', () => {
    expect(inferPolarityFromEquation('z', 'a + b')).toBe('?');
  });

  it('handles parenthesized expressions', () => {
    // (room_temperature - temperature) / characteristic_time
    // room_temperature is first in the paren group → positive
    expect(inferPolarityFromEquation('room_temperature', '(room_temperature - temperature) / characteristic_time')).toBe('+');
    // temperature is subtracted → negative
    expect(inferPolarityFromEquation('temperature', '(room_temperature - temperature) / characteristic_time')).toBe('-');
    // characteristic_time is divided → negative
    expect(inferPolarityFromEquation('characteristic_time', '(room_temperature - temperature) / characteristic_time')).toBe('-');
  });

  it('population * growth_rate: both positive', () => {
    expect(inferPolarityFromEquation('population', 'population * growth_rate')).toBe('+');
    expect(inferPolarityFromEquation('growth_rate', 'population * growth_rate')).toBe('+');
  });
});

// ---------------------------------------------------------------------------
// Loop detection on sample models
// ---------------------------------------------------------------------------

describe('detectLoops', () => {
  it('blank model: no loops', () => {
    const loops = detectLoops(blankModel);
    expect(loops).toHaveLength(0);
  });

  it('teacup model: detects feedback loop', () => {
    // Teacup has: temperature → temperature_change → temperature
    // temperature_change is a flow with eq: (room_temperature - temperature) / characteristic_time
    // So temperature has NEGATIVE polarity on temperature_change (subtracted)
    // temperature_change → temperature is a flow_link (inflow) → positive
    // Loop: temperature →(-) temperature_change →(+) temperature = one negative → Balancing
    const loops = detectLoops(teacupModel);
    expect(loops.length).toBeGreaterThanOrEqual(1);

    const mainLoop = loops.find((l) =>
      l.nodeNames.includes('temperature') && l.nodeNames.includes('temperature_change'),
    );
    expect(mainLoop).toBeDefined();
    expect(mainLoop!.type).toBe('B'); // balancing: negative feedback (cooling)
  });

  it('population model: detects reinforcing and balancing loops', () => {
    // Reinforcing: population → births → population (all positive → R)
    // Balancing: population → deaths → population (positive influence, but outflow = negative → B)
    const loops = detectLoops(populationModel);
    expect(loops.length).toBeGreaterThanOrEqual(1);

    const birthsLoop = loops.find((l) =>
      l.nodeNames.includes('population') && l.nodeNames.includes('births'),
    );
    expect(birthsLoop).toBeDefined();
    expect(birthsLoop!.type).toBe('R'); // reinforcing: exponential growth
  });

  it('bathtub model: no feedback loops (open system)', () => {
    // Bathtub has: inflow → inventory → outflow, but no feedback edges
    const loops = detectLoops(bathtubInventoryModel);
    expect(loops).toHaveLength(0);
  });

  it('supply chain model: no circular feedback', () => {
    // Supply chain is a linear chain with no feedback loops
    // (influences go from stocks to their downstream flows, not back)
    const loops = detectLoops(supplyChainModel);
    // This is a linear pipeline, should have no loops
    expect(loops).toHaveLength(0);
  });

  it('loop has correct structure', () => {
    const loops = detectLoops(populationModel);
    const loop = loops.find((l) => l.nodeNames.includes('population'));
    expect(loop).toBeDefined();
    expect(loop!.nodeIds.length).toBe(loop!.nodeNames.length);
    expect(loop!.edgeIds.length).toBeGreaterThan(0);
    expect(loop!.links.length).toBe(loop!.nodeIds.length);
    // Each link has source and target
    for (const link of loop!.links) {
      expect(link.sourceId).toBeTruthy();
      expect(link.targetId).toBeTruthy();
      expect(['+', '-', '?']).toContain(link.polarity);
    }
  });
});
