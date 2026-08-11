import { describe, it, expect } from 'vitest';
import { LEVELS } from './levels.js';
import { targetOf } from './lib/winCheck.js';
import { renderCircuitPixels } from './lib/renderCircuit.js';
import { GRID_SIZE } from './engine/bits.js';
import { isValidCmpNode } from './lib/savedStore.js';

// The intended painting for each level, keyed by id, as a per-pixel predicate.
// These are computed independently of the circuits, so matching them proves the
// builders produced the shape each level is supposed to teach.
const CENTER = (GRID_SIZE - 1) / 2; // 7.5
const bit = (v, i) => (v >> i) & 1;

const PREDICATES = {
  stripes: (x) => bit(x, 1) === 0,
  'left-half': (x) => x < 8,
  checkerboard: (x, y) => (x + y) % 2 === 1,
  plaid: (x, y) => bit(x, 1) !== bit(y, 1),
  corner: (x, y) => x >= 8 && y < 8,
  quadrants: (x, y) => bit(x, 3) !== bit(y, 3),
  lattice: (x, y) => bit(x, 1) === 0 || bit(y, 1) === 0,
  'three-corners': (x, y) => !(x >= 8 && y >= 8),
  'top-left': (x, y) => x < 8 && y < 8,
  'inverse-check': (x, y) => (x & 1) === (y & 1),
  'column-band': (x) => x >= 4 && x <= 11,
  window: (x, y) => x >= 4 && x <= 11 && y >= 4 && y <= 11,
  triangle: (x, y) => x <= y,
  circle: (x, y) => (x - CENTER) ** 2 + (y - CENTER) ** 2 <= 36,
};

describe('the campaign', () => {
  it('has 10 to 14 levels with unique ids', () => {
    expect(LEVELS.length).toBeGreaterThanOrEqual(10);
    expect(LEVELS.length).toBeLessThanOrEqual(14);
    const ids = new Set(LEVELS.map((l) => l.id));
    expect(ids.size).toBe(LEVELS.length);
  });

  it('every level carries a name, a hint, and a solution with an OUTPUT', () => {
    for (const level of LEVELS) {
      expect(typeof level.name, level.id).toBe('string');
      expect(level.name.length, level.id).toBeGreaterThan(0);
      expect(typeof level.hint, level.id).toBe('string');
      expect(level.hint.length, level.id).toBeGreaterThan(0);
      expect(Array.isArray(level.solution.nodes)).toBe(true);
      expect(Array.isArray(level.solution.wires)).toBe(true);
      expect(level.solution.nodes.some((n) => n.type === 'OUTPUT'), level.id).toBe(true);
    }
  });

  it('every CMP node in a solution is well-formed', () => {
    for (const level of LEVELS) {
      for (const node of level.solution.nodes) {
        if (node.type === 'CMP') {
          expect(isValidCmpNode(node), `${level.id} CMP ${node.id}`).toBe(true);
        }
      }
    }
  });

  it('has an id for every predicate and vice versa', () => {
    const ids = LEVELS.map((l) => l.id).sort();
    expect(ids).toEqual(Object.keys(PREDICATES).sort());
  });
});

describe('every solution renders exactly to its intended target', () => {
  for (const level of LEVELS) {
    it(`${level.id} paints the shape it teaches`, () => {
      const pixels = renderCircuitPixels(level.solution);
      const predicate = PREDICATES[level.id];
      expect(pixels).toHaveLength(GRID_SIZE * GRID_SIZE);
      for (let y = 0; y < GRID_SIZE; y += 1) {
        for (let x = 0; x < GRID_SIZE; x += 1) {
          const i = y * GRID_SIZE + x;
          expect(pixels[i], `${level.id} (${x}, ${y})`).toBe(predicate(x, y));
        }
      }
    });

    it(`${level.id} round-trips through targetOf`, () => {
      // The target the win check derives must equal the painting exactly, so a
      // player rebuilding the solution circuit wins.
      const target = targetOf(level);
      const pixels = renderCircuitPixels(level.solution);
      expect(target).toEqual(pixels);
    });
  }
});
