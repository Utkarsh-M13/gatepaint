import { describe, it, expect } from 'vitest';
import {
  isGateNode,
  hasGateNode,
  inputWiredToGate,
  outputIsFed,
  TUTORIAL_STEPS,
} from './tutorialSteps.js';

// Small hand-built fixtures matching the real starting state: the 8 inputs and
// OUTPUT already placed, no gates and no wires yet.
const INPUTS = ['x0', 'x1', 'x2', 'x3', 'y0', 'y1', 'y2', 'y3'].map((label) => ({
  id: `in-${label}`,
  type: 'INPUT',
  label,
}));
const OUTPUT = { id: 'out', type: 'OUTPUT', label: 'out' };
const START_NODES = [...INPUTS, OUTPUT];

describe('isGateNode', () => {
  it('is true for every gate type', () => {
    for (const type of ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR', 'XNOR', 'CMP']) {
      expect(isGateNode({ id: 'g', type })).toBe(true);
    }
  });

  it('is false for INPUT, OUTPUT, and junk', () => {
    expect(isGateNode({ type: 'INPUT' })).toBe(false);
    expect(isGateNode({ type: 'OUTPUT' })).toBe(false);
    expect(isGateNode(null)).toBe(false);
    expect(isGateNode({ type: 'NOPE' })).toBe(false);
  });
});

describe('hasGateNode', () => {
  it('is false for the starting inputs+output only', () => {
    expect(hasGateNode(START_NODES)).toBe(false);
  });

  it('turns true once any gate is added', () => {
    const withNot = [...START_NODES, { id: 'g1', type: 'NOT' }];
    expect(hasGateNode(withNot)).toBe(true);
  });

  it('tolerates a missing array', () => {
    expect(hasGateNode(undefined)).toBe(false);
  });
});

describe('inputWiredToGate', () => {
  const nodes = [...START_NODES, { id: 'g1', type: 'NOT' }];

  it('is false with no wires', () => {
    expect(inputWiredToGate(nodes, [])).toBe(false);
  });

  it('is true when an INPUT feeds a gate input', () => {
    const wires = [{ id: 'w1', from: 'in-x0', to: 'g1', toPort: 0 }];
    expect(inputWiredToGate(nodes, wires)).toBe(true);
  });

  it('is false when a gate feeds OUTPUT but no input feeds a gate', () => {
    const wires = [{ id: 'w1', from: 'g1', to: 'out', toPort: 0 }];
    expect(inputWiredToGate(nodes, wires)).toBe(false);
  });

  it('tolerates bad args', () => {
    expect(inputWiredToGate(undefined, undefined)).toBe(false);
  });
});

describe('outputIsFed', () => {
  const nodes = [...START_NODES, { id: 'g1', type: 'NOT' }];

  it('is false with no wire into OUTPUT', () => {
    const wires = [{ id: 'w1', from: 'in-x0', to: 'g1', toPort: 0 }];
    expect(outputIsFed(nodes, wires)).toBe(false);
  });

  it('is true once a wire lands on OUTPUT', () => {
    const wires = [{ id: 'w2', from: 'g1', to: 'out', toPort: 0 }];
    expect(outputIsFed(nodes, wires)).toBe(true);
  });

  it('is false when there is no OUTPUT node', () => {
    expect(outputIsFed(INPUTS, [{ id: 'w', from: 'in-x0', to: 'nope', toPort: 0 }])).toBe(false);
  });

  it('tolerates bad args', () => {
    expect(outputIsFed(undefined, undefined)).toBe(false);
  });
});

describe('TUTORIAL_STEPS', () => {
  it('has six steps in order with the right advance kinds', () => {
    expect(TUTORIAL_STEPS.map((s) => s.id)).toEqual([
      'welcome',
      'drag-not',
      'wire-input',
      'wire-output',
      'celebrate',
      'number',
    ]);
    expect(TUTORIAL_STEPS[0].advance).toBe('button');
    expect(TUTORIAL_STEPS[1].advance).toBe('auto');
    expect(TUTORIAL_STEPS[2].advance).toBe('auto');
    expect(TUTORIAL_STEPS[3].advance).toBe('auto');
    expect(TUTORIAL_STEPS[4].advance).toBe('button');
    expect(TUTORIAL_STEPS[5].advance).toBe('button');
    // The final step hands off to the number explainer.
    expect(TUTORIAL_STEPS[5].openNumber).toBe(true);
  });

  it('gives every auto step a predicate and every step a target', () => {
    for (const step of TUTORIAL_STEPS) {
      expect(typeof step.target).toBe('string');
      if (step.advance === 'auto') expect(typeof step.predicate).toBe('function');
    }
  });
});
