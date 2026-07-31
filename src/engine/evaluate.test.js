import { describe, it, expect } from 'vitest';
import { evaluate } from './evaluate.js';
import { bitsOf, GRID_SIZE } from './bits.js';

// Small helpers so the circuits below read like circuits.
const input = (id, label) => ({ id, type: 'INPUT', label, x: 0, y: 0 });
const gate = (id, type) => ({ id, type, label: type, x: 0, y: 0 });
const output = (id = 'out') => ({ id, type: 'OUTPUT', label: 'OUT', x: 0, y: 0 });
const wire = (id, from, to, toPort = 0) => ({ id, from, to, toPort });

describe('evaluate: NOT x1', () => {
  const nodes = [input('i', 'x1'), gate('n', 'NOT'), output()];
  const wires = [wire('w1', 'i', 'n', 0), wire('w2', 'n', 'out', 0)];

  it('is on exactly when x1 is 0', () => {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      for (let y = 0; y < GRID_SIZE; y += 1) {
        const bits = bitsOf(x, y);
        expect(evaluate(nodes, wires, bits)).toBe(bits.x1 === 0);
      }
    }
  });

  it('paints two-wide vertical stripes on the first row', () => {
    const row = Array.from({ length: GRID_SIZE }, (_, x) =>
      evaluate(nodes, wires, bitsOf(x, 0)) ? 1 : 0
    );
    expect(row).toEqual([1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0, 1, 1, 0, 0]);
  });

  it('ignores a stray wire on the unused NOT port 1', () => {
    const extra = [...nodes, input('j', 'x0')];
    const extraWires = [...wires, wire('w3', 'j', 'n', 1)];
    expect(evaluate(extra, extraWires, bitsOf(1, 0))).toBe(true);
    expect(evaluate(extra, extraWires, bitsOf(3, 0))).toBe(false);
  });
});

describe('evaluate: x0 XOR y0', () => {
  const nodes = [input('ix', 'x0'), input('iy', 'y0'), gate('g', 'XOR'), output()];
  const wires = [
    wire('w1', 'ix', 'g', 0),
    wire('w2', 'iy', 'g', 1),
    wire('w3', 'g', 'out', 0),
  ];

  it('matches the XOR truth table on all four bit combinations', () => {
    const cases = [
      [0, 0, false],
      [1, 0, true],
      [0, 1, true],
      [1, 1, false],
    ];
    for (const [x0, y0, expected] of cases) {
      expect(evaluate(nodes, wires, { x0, y0 })).toBe(expected);
    }
  });

  it('paints a checkerboard across the whole grid', () => {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      for (let y = 0; y < GRID_SIZE; y += 1) {
        expect(evaluate(nodes, wires, bitsOf(x, y))).toBe((x + y) % 2 === 1);
      }
    }
  });
});

describe('evaluate: gate truth tables', () => {
  const combos = [
    [0, 0],
    [0, 1],
    [1, 0],
    [1, 1],
  ];

  const run = (type, a, b) => {
    const nodes = [input('a', 'x0'), input('b', 'y0'), gate('g', type), output()];
    const wires = [
      wire('w1', 'a', 'g', 0),
      wire('w2', 'b', 'g', 1),
      wire('w3', 'g', 'out', 0),
    ];
    return evaluate(nodes, wires, { x0: a, y0: b });
  };

  it('AND', () => {
    expect(combos.map(([a, b]) => run('AND', a, b))).toEqual([false, false, false, true]);
  });

  it('OR', () => {
    expect(combos.map(([a, b]) => run('OR', a, b))).toEqual([false, true, true, true]);
  });

  it('XOR', () => {
    expect(combos.map(([a, b]) => run('XOR', a, b))).toEqual([false, true, true, false]);
  });

  it('NAND', () => {
    expect(combos.map(([a, b]) => run('NAND', a, b))).toEqual([true, true, true, false]);
  });
});

describe('evaluate: multi-gate chains', () => {
  // NOT(x0 AND y0), built as two gates in series. The NOT must see the AND
  // result, so the walk has to reach the AND before the NOT resolves.
  const nodes = [
    input('a', 'x0'),
    input('b', 'y0'),
    gate('and', 'AND'),
    gate('not', 'NOT'),
    output(),
  ];
  // Wires listed out of dependency order on purpose: the engine sorts it out.
  const wires = [
    wire('w3', 'not', 'out', 0),
    wire('w2', 'and', 'not', 0),
    wire('w1a', 'a', 'and', 0),
    wire('w1b', 'b', 'and', 1),
  ];

  it('evaluates the chain in the right order (NAND behaviour)', () => {
    expect(evaluate(nodes, wires, { x0: 0, y0: 0 })).toBe(true);
    expect(evaluate(nodes, wires, { x0: 1, y0: 0 })).toBe(true);
    expect(evaluate(nodes, wires, { x0: 0, y0: 1 })).toBe(true);
    expect(evaluate(nodes, wires, { x0: 1, y0: 1 })).toBe(false);
  });

  it('handles fan-out from one source into both ports of a gate', () => {
    // x0 XOR x0 is always off, and it only works if fan-out is allowed.
    const fanNodes = [input('a', 'x0'), gate('g', 'XOR'), output()];
    const fanWires = [
      wire('w1', 'a', 'g', 0),
      wire('w2', 'a', 'g', 1),
      wire('w3', 'g', 'out', 0),
    ];
    expect(evaluate(fanNodes, fanWires, { x0: 0 })).toBe(false);
    expect(evaluate(fanNodes, fanWires, { x0: 1 })).toBe(false);
  });

  it('reuses a shared subresult consistently', () => {
    // (x0 AND y0) OR (x0 AND y0), one AND feeding both OR ports.
    const shared = [
      input('a', 'x0'),
      input('b', 'y0'),
      gate('and', 'AND'),
      gate('or', 'OR'),
      output(),
    ];
    const sharedWires = [
      wire('w1', 'a', 'and', 0),
      wire('w2', 'b', 'and', 1),
      wire('w3', 'and', 'or', 0),
      wire('w4', 'and', 'or', 1),
      wire('w5', 'or', 'out', 0),
    ];
    expect(evaluate(shared, sharedWires, { x0: 1, y0: 1 })).toBe(true);
    expect(evaluate(shared, sharedWires, { x0: 1, y0: 0 })).toBe(false);
  });
});

describe('evaluate: cycles', () => {
  it('does not hang on a self-loop and returns off', () => {
    const nodes = [gate('n', 'NOT'), output()];
    const wires = [wire('w1', 'n', 'n', 0), wire('w2', 'n', 'out', 0)];
    expect(evaluate(nodes, wires, bitsOf(3, 3))).toBe(false);
  });

  it('does not hang on a two-gate loop and returns off', () => {
    const nodes = [input('a', 'x0'), gate('g1', 'OR'), gate('g2', 'OR'), output()];
    const wires = [
      wire('w1', 'a', 'g1', 0),
      wire('w2', 'g2', 'g1', 1),
      wire('w3', 'g1', 'g2', 0),
      wire('w4', 'g2', 'out', 0),
    ];
    expect(evaluate(nodes, wires, { x0: 1 })).toBe(false);
  });

  it('returns off even when the cycle sits behind an inverter', () => {
    // A NOT loop would oscillate forever in hardware, so it must read as off.
    const nodes = [gate('n1', 'NOT'), gate('n2', 'NOT'), output()];
    const wires = [
      wire('w1', 'n2', 'n1', 0),
      wire('w2', 'n1', 'n2', 0),
      wire('w3', 'n1', 'out', 0),
    ];
    expect(evaluate(nodes, wires, {})).toBe(false);
  });
});

describe('evaluate: degenerate circuits', () => {
  it('returns false when there is no output node', () => {
    expect(evaluate([input('a', 'x0')], [], { x0: 1 })).toBe(false);
  });

  it('returns false when the output is not driven', () => {
    expect(evaluate([input('a', 'x0'), output()], [], { x0: 1 })).toBe(false);
  });

  it('treats an unwired gate port as off', () => {
    // OR with only port 0 wired behaves like a pass-through.
    const nodes = [input('a', 'x0'), gate('g', 'OR'), output()];
    const wires = [wire('w1', 'a', 'g', 0), wire('w2', 'g', 'out', 0)];
    expect(evaluate(nodes, wires, { x0: 1 })).toBe(true);
    expect(evaluate(nodes, wires, { x0: 0 })).toBe(false);

    // AND with only port 0 wired is always off.
    const andNodes = [input('a', 'x0'), gate('g', 'AND'), output()];
    expect(evaluate(andNodes, wires, { x0: 1 })).toBe(false);
  });

  it('treats a missing bit value as off instead of crashing', () => {
    const nodes = [input('a', 'x2'), output()];
    const wires = [wire('w1', 'a', 'out', 0)];
    expect(evaluate(nodes, wires, {})).toBe(false);
    expect(evaluate(nodes, wires, undefined)).toBe(false);
  });

  it('ignores wires pointing at nodes that do not exist', () => {
    const nodes = [input('a', 'x0'), output()];
    const wires = [wire('w1', 'ghost', 'out', 0), wire('w2', 'a', 'nowhere', 0)];
    expect(evaluate(nodes, wires, { x0: 1 })).toBe(false);
  });

  it('survives empty or malformed arguments', () => {
    expect(evaluate([], [], {})).toBe(false);
    expect(evaluate(null, null, null)).toBe(false);
    expect(evaluate([output()], null, {})).toBe(false);
  });

  it('always returns a real boolean, never 0 or 1', () => {
    const nodes = [input('a', 'x0'), output()];
    const wires = [wire('w1', 'a', 'out', 0)];
    expect(evaluate(nodes, wires, { x0: 1 })).toBe(true);
    expect(evaluate(nodes, wires, { x0: 0 })).toBe(false);
  });
});
