import { describe, it, expect } from 'vitest';
import { renderCircuitPixels } from './renderCircuit.js';
import { XOR_CHECKERBOARD_CIRCUIT, EMPTY_CIRCUIT } from '../circuits.js';
import { GRID_SIZE, bitsOf } from '../engine/bits.js';
import { evaluate } from '../engine/evaluate.js';

describe('renderCircuitPixels', () => {
  it('returns one boolean per pixel, row-major', () => {
    const pixels = renderCircuitPixels(XOR_CHECKERBOARD_CIRCUIT);
    expect(pixels).toHaveLength(GRID_SIZE * GRID_SIZE);
    expect(pixels.every((p) => typeof p === 'boolean')).toBe(true);
  });

  it('matches evaluate cell for cell on a known preset (checkerboard)', () => {
    const pixels = renderCircuitPixels(XOR_CHECKERBOARD_CIRCUIT);
    for (let y = 0; y < GRID_SIZE; y += 1) {
      for (let x = 0; x < GRID_SIZE; x += 1) {
        const expected = evaluate(
          XOR_CHECKERBOARD_CIRCUIT.nodes,
          XOR_CHECKERBOARD_CIRCUIT.wires,
          bitsOf(x, y)
        );
        expect(pixels[y * GRID_SIZE + x]).toBe(expected);
      }
    }
  });

  it('is all off for the empty circuit and tolerates junk input', () => {
    expect(renderCircuitPixels(EMPTY_CIRCUIT).some(Boolean)).toBe(false);
    expect(renderCircuitPixels(null)).toHaveLength(GRID_SIZE * GRID_SIZE);
    expect(renderCircuitPixels({}).some(Boolean)).toBe(false);
  });
});
