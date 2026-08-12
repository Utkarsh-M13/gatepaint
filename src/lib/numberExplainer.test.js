import { describe, expect, it } from 'vitest';
import { describePixel, X_READOUT, Y_READOUT } from './numberExplainer.js';

describe('describePixel', () => {
  it('reads the label order high bit to low bit', () => {
    expect(X_READOUT).toEqual(['x3', 'x2', 'x1', 'x0']);
    expect(Y_READOUT).toEqual(['y3', 'y2', 'y1', 'y0']);
  });

  it('reports the friendly column/row line', () => {
    const info = describePixel(5, 2);
    expect(info.columnRow).toBe('column 5, row 2');
  });

  it('computes binary strings high bit first from the real bitsOf', () => {
    const info = describePixel(5, 2);
    expect(info.xBinary).toBe('0101');
    expect(info.yBinary).toBe('0010');
  });

  it('reads x3 as the left/right half split', () => {
    expect(describePixel(0, 0).lines[0]).toMatch(/left half/);
    expect(describePixel(15, 0).lines[0]).toMatch(/right half/);
  });

  it('reads y3 as the top/bottom half split', () => {
    expect(describePixel(0, 0).lines[1]).toMatch(/top half/);
    expect(describePixel(0, 15).lines[1]).toMatch(/bottom half/);
  });

  it('matches bitsOf exactly for a corner pixel', () => {
    const info = describePixel(15, 15);
    expect(info.xBinary).toBe('1111');
    expect(info.yBinary).toBe('1111');
  });
});
