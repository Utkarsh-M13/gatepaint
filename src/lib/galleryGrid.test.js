import { describe, it, expect } from 'vitest';
import { computeGridCapacity } from './galleryGrid.js';

describe('computeGridCapacity', () => {
  it('floors the available space into whole cells', () => {
    expect(computeGridCapacity(236, 220, 112, 130)).toEqual({ cols: 2, rows: 1 });
  });

  it('never returns less than 1x1, even in a tiny area', () => {
    expect(computeGridCapacity(10, 10, 112, 130)).toEqual({ cols: 1, rows: 1 });
  });

  it('never returns less than 1x1 for zero or negative space', () => {
    expect(computeGridCapacity(0, 0, 112, 130)).toEqual({ cols: 1, rows: 1 });
    expect(computeGridCapacity(-50, -50, 112, 130)).toEqual({ cols: 1, rows: 1 });
  });

  it('grows with more available space', () => {
    expect(computeGridCapacity(560, 390, 112, 130)).toEqual({ cols: 5, rows: 3 });
  });

  it('fits exactly on a boundary', () => {
    expect(computeGridCapacity(336, 260, 112, 130)).toEqual({ cols: 3, rows: 2 });
  });
});
