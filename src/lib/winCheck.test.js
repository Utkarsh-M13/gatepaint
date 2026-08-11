import { describe, it, expect } from 'vitest';
import {
  targetOf,
  pixelsEqual,
  matchCount,
  usesOnlyBasicGates,
  evaluateWin,
} from './winCheck.js';
import { LEVELS } from '../levels.js';
import { renderCircuitPixels } from './renderCircuit.js';
import { GRID_SIZE } from '../engine/bits.js';

// A gates-only circuit painting the checkerboard: x0 XOR y0 -> OUTPUT. No CMP.
const CHECKER_GATES = {
  nodes: [
    { id: 'x0', type: 'INPUT', label: 'x0', x: 0, y: 0 },
    { id: 'y0', type: 'INPUT', label: 'y0', x: 0, y: 40 },
    { id: 'g', type: 'XOR', label: 'XOR', x: 100, y: 20 },
    { id: 'out', type: 'OUTPUT', label: 'out', x: 200, y: 20 },
  ],
  wires: [
    { id: 'w1', from: 'x0', to: 'g', toPort: 0 },
    { id: 'w2', from: 'y0', to: 'g', toPort: 1 },
    { id: 'w3', from: 'g', to: 'out', toPort: 0 },
  ],
};

// The checkerboard level's own solution (also gates-only) and a comparator
// level's solution (contains CMP nodes), for the gated tests.
const checkerLevel = LEVELS.find((l) => l.id === 'checkerboard');
const circleLevel = LEVELS.find((l) => l.id === 'circle');

describe('pixelsEqual', () => {
  it('is true for identical arrays and false otherwise', () => {
    expect(pixelsEqual([true, false, true], [true, false, true])).toBe(true);
    expect(pixelsEqual([true, false], [true, true])).toBe(false);
    expect(pixelsEqual([true], [true, false])).toBe(false);
    expect(pixelsEqual(null, [true])).toBe(false);
  });

  it('coerces truthy/falsey so 1/0 match true/false', () => {
    expect(pixelsEqual([1, 0, 1], [true, false, true])).toBe(true);
  });
});

describe('matchCount', () => {
  it('counts matching cells', () => {
    expect(matchCount([true, false, true], [true, true, true])).toBe(2);
    expect(matchCount([], [])).toBe(0);
  });
});

describe('usesOnlyBasicGates', () => {
  it('is true when there is no CMP node', () => {
    expect(usesOnlyBasicGates(CHECKER_GATES)).toBe(true);
  });

  it('is false when a CMP node is present', () => {
    expect(usesOnlyBasicGates(circleLevel.solution)).toBe(false);
  });

  it('tolerates junk', () => {
    expect(usesOnlyBasicGates(null)).toBe(true);
    expect(usesOnlyBasicGates({})).toBe(true);
  });
});

describe('evaluateWin', () => {
  const target = targetOf(checkerLevel);

  it('is solved when the painting equals the target', () => {
    const result = evaluateWin(CHECKER_GATES, target);
    expect(result.solved).toBe(true);
    expect(result.matched).toBe(GRID_SIZE * GRID_SIZE);
    expect(result.total).toBe(GRID_SIZE * GRID_SIZE);
  });

  it('is not solved when the painting differs', () => {
    // The empty circuit paints all-off, which is not the checkerboard.
    const result = evaluateWin({ nodes: [], wires: [] }, target);
    expect(result.solved).toBe(false);
    expect(result.matched).toBeLessThan(result.total);
  });

  it('earns gated when solved with only basic gates', () => {
    const result = evaluateWin(CHECKER_GATES, target);
    expect(result.solved).toBe(true);
    expect(result.gated).toBe(true);
  });

  it('does not earn gated when solved with a CMP present', () => {
    // The circle level's own solution solves it but uses comparators.
    const circleTarget = targetOf(circleLevel);
    const result = evaluateWin(circleLevel.solution, circleTarget);
    expect(result.solved).toBe(true);
    expect(result.gated).toBe(false);
  });

  it('never earns gated when not solved, even with only gates', () => {
    const result = evaluateWin({ nodes: [], wires: [] }, target);
    expect(result.gated).toBe(false);
  });
});

describe('targetOf', () => {
  it('equals the solution painting', () => {
    expect(targetOf(checkerLevel)).toEqual(renderCircuitPixels(checkerLevel.solution));
  });
});
