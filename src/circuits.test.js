import { describe, it, expect } from 'vitest';
import { DEFAULT_CIRCUIT, EMPTY_CIRCUIT } from './circuits.js';
import { INPUT_LABELS } from './engine/bits.js';

describe('starting circuit', () => {
  it('DEFAULT_CIRCUIT is the empty sandbox', () => {
    expect(DEFAULT_CIRCUIT).toBe(EMPTY_CIRCUIT);
  });

  it('places every input label plus a single OUTPUT node', () => {
    const inputs = EMPTY_CIRCUIT.nodes.filter((n) => n.type === 'INPUT');
    const outputs = EMPTY_CIRCUIT.nodes.filter((n) => n.type === 'OUTPUT');
    expect(inputs.map((n) => n.label).sort()).toEqual([...INPUT_LABELS].sort());
    expect(outputs).toHaveLength(1);
    expect(EMPTY_CIRCUIT.nodes).toHaveLength(INPUT_LABELS.length + 1);
    expect(EMPTY_CIRCUIT.wires).toEqual([]);
  });

  it('gives every input a unique id and no wires to start', () => {
    const ids = EMPTY_CIRCUIT.nodes.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
