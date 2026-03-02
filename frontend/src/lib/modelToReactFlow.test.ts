import { describe, expect, it } from 'vitest';
import {
  mapNodeType,
  computeFlowDirections,
  buildNodeData,
  computeHandles,
  maskFunctionInternals,
  subtitleForNode,
  toReactFlowNodes,
  toReactFlowEdges,
} from './modelToReactFlow';
import type { NodeModel, EdgeModel, StockNode, AuxNode, FlowNode, TextNode, CloudNode, CldSymbolNode, LookupNode } from '../types/model';

// ---------------------------------------------------------------------------
// mapNodeType
// ---------------------------------------------------------------------------

describe('mapNodeType', () => {
  it('maps known types to React Flow node types', () => {
    expect(mapNodeType('stock')).toBe('stockNode');
    expect(mapNodeType('flow')).toBe('flowNode');
    expect(mapNodeType('lookup')).toBe('lookupNode');
    expect(mapNodeType('text')).toBe('textNode');
    expect(mapNodeType('cloud')).toBe('cloudNode');
    expect(mapNodeType('cld_symbol')).toBe('cldSymbolNode');
  });

  it('defaults to auxNode for aux and unknown types', () => {
    expect(mapNodeType('aux')).toBe('auxNode');
    expect(mapNodeType('unknown')).toBe('auxNode');
    expect(mapNodeType('')).toBe('auxNode');
  });
});

// ---------------------------------------------------------------------------
// computeFlowDirections
// ---------------------------------------------------------------------------

describe('computeFlowDirections', () => {
  const stock: StockNode = { id: 's1', type: 'stock', name: 'stock', label: 'Stock', equation: '0', initial_value: 0, position: { x: 100, y: 100 } };
  const flowRight: FlowNode = { id: 'f1', type: 'flow', name: 'flow', label: 'Flow', equation: '0', position: { x: 300, y: 100 } };
  const flowLeft: FlowNode = { id: 'f2', type: 'flow', name: 'flow2', label: 'Flow2', equation: '0', position: { x: 50, y: 100 } };

  it('sets right when flow is to the right of stock (stock→flow)', () => {
    const edges: EdgeModel[] = [{ id: 'e1', type: 'flow_link', source: 's1', target: 'f1' }];
    const result = computeFlowDirections([stock, flowRight], edges);
    expect(result.get('f1')).toBe('right');
  });

  it('sets left when flow is to the left of stock (stock→flow)', () => {
    const edges: EdgeModel[] = [{ id: 'e1', type: 'flow_link', source: 's1', target: 'f2' }];
    const result = computeFlowDirections([stock, flowLeft], edges);
    expect(result.get('f2')).toBe('left');
  });

  it('sets right when target stock is to the right (flow→stock)', () => {
    const stockRight: StockNode = { ...stock, id: 's2', position: { x: 500, y: 100 } };
    const edges: EdgeModel[] = [{ id: 'e1', type: 'flow_link', source: 'f1', target: 's2' }];
    const result = computeFlowDirections([flowRight, stockRight], edges);
    expect(result.get('f1')).toBe('right');
  });

  it('ignores non-flow_link edges', () => {
    const edges: EdgeModel[] = [{ id: 'e1', type: 'influence', source: 's1', target: 'f1' }];
    const result = computeFlowDirections([stock, flowRight], edges);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// maskFunctionInternals / subtitleForNode
// ---------------------------------------------------------------------------

describe('maskFunctionInternals', () => {
  it('masks function arguments with (...)', () => {
    expect(maskFunctionInternals('PULSE(10, 5, 1)')).toBe('PULSE(...)');
    expect(maskFunctionInternals('DELAY1(x, 3)')).toBe('DELAY1(...)');
  });

  it('leaves non-function text untouched', () => {
    expect(maskFunctionInternals('a + b * 2')).toBe('a + b * 2');
  });

  it('handles nested functions', () => {
    expect(maskFunctionInternals('STEP(PULSE(1,2), 3)')).toBe('STEP(...)');
  });
});

describe('subtitleForNode', () => {
  it('truncates to 64 chars', () => {
    const longEq = 'a'.repeat(100);
    const result = subtitleForNode('x', longEq, true);
    expect(result.length).toBe(64);
  });

  it('shows name = equation format', () => {
    expect(subtitleForNode('rate', '5', true)).toBe('rate = 5');
  });
});

// ---------------------------------------------------------------------------
// buildNodeData
// ---------------------------------------------------------------------------

describe('buildNodeData', () => {
  const flowDirs = new Map<string, 'left' | 'right'>([['f1', 'left']]);

  it('returns text payload for text nodes', () => {
    const node: TextNode = { id: 't1', type: 'text', text: 'Hello', position: { x: 0, y: 0 } };
    const data = buildNodeData(node, false, flowDirs);
    expect(data).toHaveProperty('text', 'Hello');
  });

  it('returns empty-ish payload for cloud nodes', () => {
    const node: CloudNode = { id: 'c1', type: 'cloud', position: { x: 0, y: 0 } };
    const data = buildNodeData(node, false, flowDirs);
    expect(data).not.toHaveProperty('label');
  });

  it('returns symbol payload for cld_symbol nodes', () => {
    const node: CldSymbolNode = { id: 'cs1', type: 'cld_symbol', symbol: 'R', position: { x: 0, y: 0 } };
    const data = buildNodeData(node, false, flowDirs);
    expect(data).toHaveProperty('symbol', 'R');
  });

  it('returns label + subtitle for stock nodes', () => {
    const node: StockNode = { id: 's1', type: 'stock', name: 'pop', label: 'Population', equation: '100', initial_value: 100, position: { x: 0, y: 0 } };
    const data = buildNodeData(node, false, flowDirs);
    expect(data).toHaveProperty('label', 'Population');
    expect(data).toHaveProperty('subtitle', '');
  });

  it('includes flowDirection for flow nodes', () => {
    const node: FlowNode = { id: 'f1', type: 'flow', name: 'rate', label: 'Rate', equation: '5', position: { x: 0, y: 0 } };
    const data = buildNodeData(node, false, flowDirs);
    expect(data).toHaveProperty('flowDirection', 'left');
  });

  it('passes through visualStyle when present', () => {
    const node: AuxNode = { id: 'a1', type: 'aux', name: 'x', label: 'X', equation: '1', position: { x: 0, y: 0 }, style: { fill: '#99CC00' } };
    const data = buildNodeData(node, false, flowDirs);
    expect(data).toHaveProperty('visualStyle');
    expect((data as { visualStyle: { fill: string } }).visualStyle.fill).toBe('#99CC00');
  });
});

// ---------------------------------------------------------------------------
// computeHandles
// ---------------------------------------------------------------------------

describe('computeHandles', () => {
  const stock: StockNode = { id: 's1', type: 'stock', name: 's', label: 'S', equation: '0', initial_value: 0, position: { x: 100, y: 100 } };
  const flow: FlowNode = { id: 'f1', type: 'flow', name: 'f', label: 'F', equation: '0', position: { x: 300, y: 100 } };
  const aux: AuxNode = { id: 'a1', type: 'aux', name: 'a', label: 'A', equation: '1', position: { x: 300, y: 300 } };

  it('keeps existing explicit handles', () => {
    const edge: EdgeModel = { id: 'e1', type: 'influence', source: 's1', target: 'a1', source_handle: 'right', target_handle: 'left' };
    const result = computeHandles(edge, stock, aux);
    expect(result).toEqual({ sourceHandle: 'right', targetHandle: 'left' });
  });

  it('routes stock→flow with centered flow-in handle', () => {
    const edge: EdgeModel = { id: 'e1', type: 'flow_link', source: 's1', target: 'f1' };
    const result = computeHandles(edge, stock, flow);
    expect(result.sourceHandle).toBe('right');
    expect(result.targetHandle).toBe('flow-in');
  });

  it('routes flow→stock with centered flow-out handle', () => {
    const edge: EdgeModel = { id: 'e1', type: 'flow_link', source: 'f1', target: 's1' };
    const stockRight: StockNode = { ...stock, position: { x: 500, y: 100 } };
    const result = computeHandles(edge, flow, stockRight);
    expect(result.sourceHandle).toBe('flow-out');
    expect(result.targetHandle).toBe('left');
  });

  it('routes influence to flow node using var handles', () => {
    const auxAbove: AuxNode = { ...aux, position: { x: 300, y: 50 } };
    const edge: EdgeModel = { id: 'e1', type: 'influence', source: 'a1', target: 'f1' };
    const result = computeHandles(edge, auxAbove, flow);
    expect(result.targetHandle).toBe('var-top');
  });

  it('picks horizontal handles when dx > dy', () => {
    const edge: EdgeModel = { id: 'e1', type: 'influence', source: 's1', target: 'a1' };
    const auxRight: AuxNode = { ...aux, position: { x: 400, y: 110 } };
    const result = computeHandles(edge, stock, auxRight);
    expect(result.sourceHandle).toBe('right');
    expect(result.targetHandle).toBe('left');
  });

  it('picks vertical handles when dy > dx', () => {
    const edge: EdgeModel = { id: 'e1', type: 'influence', source: 's1', target: 'a1' };
    const auxBelow: AuxNode = { ...aux, position: { x: 110, y: 400 } };
    const result = computeHandles(edge, stock, auxBelow);
    expect(result.sourceHandle).toBe('bottom');
    expect(result.targetHandle).toBe('top');
  });
});

// ---------------------------------------------------------------------------
// toReactFlowNodes / toReactFlowEdges integration
// ---------------------------------------------------------------------------

describe('toReactFlowNodes', () => {
  it('converts model nodes to React Flow nodes with correct types', () => {
    const nodes: NodeModel[] = [
      { id: 's1', type: 'stock', name: 'pop', label: 'Pop', equation: '100', initial_value: 100, position: { x: 10, y: 20 } },
      { id: 'a1', type: 'aux', name: 'rate', label: 'Rate', equation: '5', position: { x: 100, y: 200 } },
      { id: 't1', type: 'text', text: 'Note', position: { x: 0, y: 0 } },
    ];
    const result = toReactFlowNodes(nodes, [], null, false);
    expect(result).toHaveLength(3);
    expect(result[0].type).toBe('stockNode');
    expect(result[0].position).toEqual({ x: 10, y: 20 });
    expect(result[1].type).toBe('auxNode');
    expect(result[2].type).toBe('textNode');
  });

  it('marks selected node', () => {
    const nodes: NodeModel[] = [
      { id: 's1', type: 'stock', name: 'x', label: 'X', equation: '0', initial_value: 0, position: { x: 0, y: 0 } },
    ];
    const result = toReactFlowNodes(nodes, [], { kind: 'node', id: 's1' }, false);
    expect(result[0].selected).toBe(true);
  });
});

describe('toReactFlowEdges', () => {
  const stock: StockNode = { id: 's1', type: 'stock', name: 's', label: 'S', equation: '0', initial_value: 0, position: { x: 100, y: 100 } };
  const aux: AuxNode = { id: 'a1', type: 'aux', name: 'a', label: 'A', equation: '1', position: { x: 300, y: 100 } };

  it('converts influence edge with dashed style and custom edge type', () => {
    const edges: EdgeModel[] = [{ id: 'e1', type: 'influence', source: 'a1', target: 's1' }];
    const result = toReactFlowEdges(edges, [stock, aux]);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('influence');
    expect(result[0].style?.strokeDasharray).toBe('4 5');
  });

  it('converts flow_link edge with flowPipe type', () => {
    const flow: FlowNode = { id: 'f1', type: 'flow', name: 'f', label: 'F', equation: '0', position: { x: 200, y: 100 } };
    const edges: EdgeModel[] = [{ id: 'e1', type: 'flow_link', source: 's1', target: 'f1' }];
    const result = toReactFlowEdges(edges, [stock, flow]);
    expect(result[0].type).toBe('flowPipe');
    expect(result[0].markerEnd).toBeUndefined();
  });

  it('computes handles based on positions', () => {
    const edges: EdgeModel[] = [{ id: 'e1', type: 'influence', source: 'a1', target: 's1' }];
    const result = toReactFlowEdges(edges, [stock, aux]);
    // aux is to the right of stock; so source should be left (going left toward stock)
    expect(result[0].sourceHandle).toBe('left');
    expect(result[0].targetHandle).toBe('right');
  });

  it('passes waypoints through in edge data', () => {
    const edges: EdgeModel[] = [{
      id: 'e1', type: 'flow_link', source: 's1', target: 'a1',
      layout: { waypoints: [{ x: 200, y: 200 }] },
    }];
    const result = toReactFlowEdges(edges, [stock, aux]);
    expect(result[0].data?.waypoints).toEqual([{ x: 200, y: 200 }]);
  });
});
