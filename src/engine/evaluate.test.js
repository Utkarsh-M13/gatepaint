import { describe, it, expect } from 'vitest';
import { evaluate } from './evaluate.js';
import { bitsOf, GRID_SIZE, GRID_BITS } from './bits.js';

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

  it('NOR', () => {
    // NOR is on only when both inputs are off.
    expect(combos.map(([a, b]) => run('NOR', a, b))).toEqual([true, false, false, false]);
  });

  it('XNOR', () => {
    // XNOR is on when the two inputs match.
    expect(combos.map(([a, b]) => run('XNOR', a, b))).toEqual([true, false, false, true]);
  });
});

describe('evaluate: CMP comparator', () => {
  // A binary constant array (index 0 = LSB) built from an integer.
  const targetOf = (n) => Array.from({ length: GRID_BITS }, (_, i) => (n >> i) & 1);

  const output = (id = 'out') => ({ id, type: 'OUTPUT', label: 'OUT', x: 0, y: 0 });
  const input = (id, label) => ({ id, type: 'INPUT', label, x: 0, y: 0 });
  const wire = (id, from, to, toPort = 0) => ({ id, from, to, toPort });

  // Builds a circuit of one CMP feeding OUTPUT, with the listed ports each
  // wired to input x{port}. Wiring port i to x{i} for every bit makes the
  // comparator's value V exactly equal to the x coordinate.
  function cmpCircuit(op, target, wiredPorts) {
    const nodes = [output(), { id: 'c', type: 'CMP', op, target, x: 0, y: 0 }];
    const wires = [wire('wo', 'c', 'out', 0)];
    for (const p of wiredPorts) {
      nodes.push(input(`i${p}`, `x${p}`));
      wires.push(wire(`w${p}`, `i${p}`, 'c', p));
    }
    return { nodes, wires };
  }

  const allPorts = Array.from({ length: GRID_BITS }, (_, i) => i);
  const FULL = GRID_SIZE - 1; // every target bit set, e.g. 15 at GRID_BITS = 4

  it('LT is on when the wired value is below the target', () => {
    const { nodes, wires } = cmpCircuit('LT', targetOf(5), allPorts);
    for (let x = 0; x < GRID_SIZE; x += 1) {
      expect(evaluate(nodes, wires, bitsOf(x, 0))).toBe(x < 5);
    }
  });

  it('EQ is on only at the target', () => {
    const { nodes, wires } = cmpCircuit('EQ', targetOf(5), allPorts);
    for (let x = 0; x < GRID_SIZE; x += 1) {
      expect(evaluate(nodes, wires, bitsOf(x, 0))).toBe(x === 5);
    }
  });

  it('GT is on when the wired value is above the target', () => {
    const { nodes, wires } = cmpCircuit('GT', targetOf(5), allPorts);
    for (let x = 0; x < GRID_SIZE; x += 1) {
      expect(evaluate(nodes, wires, bitsOf(x, 0))).toBe(x > 5);
    }
  });

  it('handles an all-zero target on every operator', () => {
    const zero = targetOf(0);
    const lt = cmpCircuit('LT', zero, allPorts);
    const eq = cmpCircuit('EQ', zero, allPorts);
    const gt = cmpCircuit('GT', zero, allPorts);
    for (let x = 0; x < GRID_SIZE; x += 1) {
      expect(evaluate(lt.nodes, lt.wires, bitsOf(x, 0))).toBe(false); // nothing < 0
      expect(evaluate(eq.nodes, eq.wires, bitsOf(x, 0))).toBe(x === 0);
      expect(evaluate(gt.nodes, gt.wires, bitsOf(x, 0))).toBe(x > 0);
    }
  });

  it('handles a full-scale target on every operator', () => {
    const full = targetOf(FULL);
    const lt = cmpCircuit('LT', full, allPorts);
    const eq = cmpCircuit('EQ', full, allPorts);
    const gt = cmpCircuit('GT', full, allPorts);
    for (let x = 0; x < GRID_SIZE; x += 1) {
      expect(evaluate(lt.nodes, lt.wires, bitsOf(x, 0))).toBe(x < FULL);
      expect(evaluate(eq.nodes, eq.wires, bitsOf(x, 0))).toBe(x === FULL);
      expect(evaluate(gt.nodes, gt.wires, bitsOf(x, 0))).toBe(false); // nothing > full
    }
  });

  it('treats unwired ports as 0', () => {
    // Only the two low ports are wired, so the value is the low two bits of x.
    const { nodes, wires } = cmpCircuit('EQ', targetOf(2), [0, 1]);
    for (let x = 0; x < GRID_SIZE; x += 1) {
      expect(evaluate(nodes, wires, bitsOf(x, 0))).toBe((x & 3) === 2);
    }
  });

  it('is EQ-true when the target equals the wired value', () => {
    const { nodes, wires } = cmpCircuit('EQ', targetOf(9), allPorts);
    expect(evaluate(nodes, wires, bitsOf(9, 0))).toBe(true);
    expect(evaluate(nodes, wires, bitsOf(8, 0))).toBe(false);
  });

  it('defaults a missing target to 0 without crashing', () => {
    const { nodes, wires } = cmpCircuit('EQ', undefined, allPorts);
    expect(evaluate(nodes, wires, bitsOf(0, 0))).toBe(true);
    expect(evaluate(nodes, wires, bitsOf(1, 0))).toBe(false);
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
