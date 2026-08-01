import { describe, it, expect } from 'vitest';
import { FEATURED_CIRCUITS } from './featured.js';
import { renderCircuitPixels } from './lib/renderCircuit.js';
import { GRID_SIZE } from './engine/bits.js';

// Look up a featured entry by its id so a test reads by intent.
function circuitById(id) {
  const entry = FEATURED_CIRCUITS.find((e) => e.id === id);
  if (!entry) throw new Error(`no featured circuit ${id}`);
  return entry.circuit;
}

// The intended boolean for each pixel, per circuit, so the rendered painting
// can be checked against the geometry it is supposed to be.
function expectMatches(circuit, predicate) {
  const pixels = renderCircuitPixels(circuit);
  expect(pixels).toHaveLength(GRID_SIZE * GRID_SIZE);
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const i = y * GRID_SIZE + x;
      expect(pixels[i], `pixel (${x}, ${y})`).toBe(predicate(x, y));
    }
  }
}

describe('featured circuits render their intended paintings', () => {
  it('Vertical Stripes is NOT x1: on when x1 (the twos bit) is 0', () => {
    expectMatches(circuitById('vertical-stripes'), (x) => ((x >> 1) & 1) === 0);
  });

  it('Left Half is NOT x3: on for the left half, x < 8', () => {
    expectMatches(circuitById('left-half'), (x) => x < 8);
  });

  it('Checkerboard is x0 XOR y0: on when x + y is odd', () => {
    expectMatches(circuitById('checkerboard'), (x, y) => (x + y) % 2 === 1);
  });

  it('Quadrants is x3 XOR y3: on when exactly one half-bit is set', () => {
    expectMatches(
      circuitById('quadrants'),
      (x, y) => ((x >> 3) & 1) !== ((y >> 3) & 1)
    );
  });

  it('Plaid is x1 XOR y1: coarse 2x2-block checkerboard', () => {
    expectMatches(
      circuitById('plaid'),
      (x, y) => ((x >> 1) & 1) !== ((y >> 1) & 1)
    );
  });

  it('Outer Frame is the border: on when x or y is 0 or GRID_SIZE-1', () => {
    const last = GRID_SIZE - 1;
    expectMatches(
      circuitById('outer-frame'),
      (x, y) => x === 0 || x === last || y === 0 || y === last
    );
  });
});

describe('featured set shape', () => {
  it('has at least six entries so pagination spans two pages', () => {
    expect(FEATURED_CIRCUITS.length).toBeGreaterThanOrEqual(6);
  });

  it('every entry carries an id, name, and a well-formed circuit', () => {
    for (const entry of FEATURED_CIRCUITS) {
      expect(typeof entry.id).toBe('string');
      expect(typeof entry.name).toBe('string');
      expect(Array.isArray(entry.circuit.nodes)).toBe(true);
      expect(Array.isArray(entry.circuit.wires)).toBe(true);
      expect(entry.circuit.nodes.some((n) => n.type === 'OUTPUT')).toBe(true);
    }
  });
});
