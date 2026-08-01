import { describe, it, expect } from 'vitest';
import { transferWiresForSwap } from './swap.js';

describe('transferWiresForSwap', () => {
  it('re-points every wire from the old output to the new output (fan-out kept)', () => {
    const wires = [
      { id: 'w1', from: 'old', to: 'a', toPort: 0 },
      { id: 'w2', from: 'old', to: 'b', toPort: 1 },
    ];
    const result = transferWiresForSwap('old', 'new', 2, wires);
    expect(result).toEqual([
      { id: 'w1', from: 'new', to: 'a', toPort: 0 },
      { id: 'w2', from: 'new', to: 'b', toPort: 1 },
    ]);
  });

  it('maps incoming wires onto the new gate input ports by index', () => {
    const wires = [
      { id: 'w1', from: 'x', to: 'old', toPort: 0 },
      { id: 'w2', from: 'y', to: 'old', toPort: 1 },
    ];
    const result = transferWiresForSwap('old', 'new', 2, wires);
    expect(result).toEqual([
      { id: 'w1', from: 'x', to: 'new', toPort: 0 },
      { id: 'w2', from: 'y', to: 'new', toPort: 1 },
    ]);
  });

  it('drops incoming wires to ports the new gate does not have', () => {
    // Dropping a one-input NOT (newPortCount = 1) onto a wired two-input AND.
    const wires = [
      { id: 'w1', from: 'x', to: 'old', toPort: 0 },
      { id: 'w2', from: 'y', to: 'old', toPort: 1 },
    ];
    const result = transferWiresForSwap('old', 'new', 1, wires);
    expect(result).toEqual([{ id: 'w1', from: 'x', to: 'new', toPort: 0 }]);
  });

  it('leaves wires unrelated to the swapped gate untouched', () => {
    const wires = [{ id: 'w1', from: 'p', to: 'q', toPort: 0 }];
    const result = transferWiresForSwap('old', 'new', 2, wires);
    expect(result).toEqual(wires);
  });

  it('handles a gate that is both a source and a sink', () => {
    const wires = [
      { id: 'w1', from: 'src', to: 'old', toPort: 0 },
      { id: 'w2', from: 'old', to: 'sink', toPort: 0 },
    ];
    const result = transferWiresForSwap('old', 'new', 1, wires);
    expect(result).toEqual([
      { id: 'w1', from: 'src', to: 'new', toPort: 0 },
      { id: 'w2', from: 'new', to: 'sink', toPort: 0 },
    ]);
  });
});
