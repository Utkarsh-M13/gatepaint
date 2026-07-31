import { describe, it, expect } from 'vitest';
import { GRID_BITS, GRID_SIZE, INPUT_LABELS, bitsOf } from './bits.js';

describe('bits', () => {
  it('GRID_BITS is 4 and GRID_SIZE follows from it', () => {
    expect(GRID_BITS).toBe(4);
    expect(GRID_SIZE).toBe(16);
  });

  it('derives input labels from GRID_BITS', () => {
    expect(INPUT_LABELS).toEqual(['x0', 'x1', 'x2', 'x3', 'y0', 'y1', 'y2', 'y3']);
  });

  it('bitsOf(5, 2) decomposes both coordinates', () => {
    expect(bitsOf(5, 2)).toEqual({
      x0: 1, x1: 0, x2: 1, x3: 0,
      y0: 0, y1: 1, y2: 0, y3: 0,
    });
  });

  it('bitsOf(0, 0) is all zeros', () => {
    expect(bitsOf(0, 0)).toEqual({
      x0: 0, x1: 0, x2: 0, x3: 0,
      y0: 0, y1: 0, y2: 0, y3: 0,
    });
  });

  it('bitsOf(15, 15) is all ones', () => {
    expect(bitsOf(15, 15)).toEqual({
      x0: 1, x1: 1, x2: 1, x3: 1,
      y0: 1, y1: 1, y2: 1, y3: 1,
    });
  });

  it('bitsOf(8, 1) puts the eights bit on x3 and the ones bit on y0', () => {
    const b = bitsOf(8, 1);
    expect(b.x3).toBe(1);
    expect(b.x0).toBe(0);
    expect(b.y0).toBe(1);
    expect(b.y3).toBe(0);
  });

  it('every value is 0 or 1 across the whole grid', () => {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      for (let y = 0; y < GRID_SIZE; y += 1) {
        for (const v of Object.values(bitsOf(x, y))) {
          expect(v === 0 || v === 1).toBe(true);
        }
      }
    }
  });
});
