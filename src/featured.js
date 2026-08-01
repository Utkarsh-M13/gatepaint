// The bundled Featured gallery: a fixed set of demo circuits, each a name and
// a { nodes, wires } circuit ready to load into the workspace. Pure data.
//
// The simple ones reuse the presets from circuits.js. The wider ones (the
// frame, the plaid) are built with a tiny layered builder below so the wiring
// is generated rather than typed out by hand, which keeps them correct. Every
// entry's painting is checked against its intended formula in featured.test.js.

import {
  NOT_X1_CIRCUIT,
  NOT_X3_CIRCUIT,
  XOR_CHECKERBOARD_CIRCUIT,
} from './circuits.js';

// A small circuit builder. It lays inputs in a left column and each gate one
// column to the right of its deepest input, so a loaded circuit reads left to
// right instead of arriving as a pile. Positions are approximate; the app
// re-pins OUTPUT and clamps everything into view on load.
function makeBuilder() {
  const nodes = [];
  const wires = [];
  const inputs = new Map();
  const depthOf = new Map();
  const rowsInCol = new Map();
  let gateCount = 0;
  let wireCount = 0;

  const COL_X = [40, 150, 258, 366, 470, 540];
  const ROW_TOP = 24;
  const ROW_STEP = 44;

  function place(id, depth) {
    depthOf.set(id, depth);
    const row = rowsInCol.get(depth) || 0;
    rowsInCol.set(depth, row + 1);
    const node = nodes.find((n) => n.id === id);
    node.x = COL_X[Math.min(depth, COL_X.length - 1)];
    node.y = ROW_TOP + row * ROW_STEP;
  }

  function input(label) {
    if (inputs.has(label)) return inputs.get(label);
    const id = `in-${label}`;
    nodes.push({ id, type: 'INPUT', label, x: 0, y: 0 });
    inputs.set(label, id);
    place(id, 0);
    return id;
  }

  function gate(type, a, b) {
    const id = `g${gateCount}`;
    gateCount += 1;
    nodes.push({ id, type, label: type, x: 0, y: 0 });
    const da = depthOf.get(a) ?? 0;
    const db = b === undefined ? 0 : depthOf.get(b) ?? 0;
    place(id, Math.max(da, db) + 1);
    wires.push({ id: `w${wireCount}`, from: a, to: id, toPort: 0 });
    wireCount += 1;
    if (b !== undefined) {
      wires.push({ id: `w${wireCount}`, from: b, to: id, toPort: 1 });
      wireCount += 1;
    }
    return id;
  }

  // Closes the circuit: adds the OUTPUT node fed by `finalId` and returns the
  // finished { nodes, wires }.
  function build(finalId) {
    const out = { id: 'out', type: 'OUTPUT', label: 'out', x: 556, y: 180 };
    nodes.push(out);
    wires.push({ id: `w${wireCount}`, from: finalId, to: 'out', toPort: 0 });
    wireCount += 1;
    return { nodes, wires };
  }

  return { input, gate, build };
}

// x3 XOR y3: on in exactly two opposite quadrants (top-right and bottom-left).
function buildQuadrants() {
  const b = makeBuilder();
  const g = b.gate('XOR', b.input('x3'), b.input('y3'));
  return b.build(g);
}

// x1 XOR y1: a coarse 2x2-block checkerboard, a plaid weave.
function buildPlaid() {
  const b = makeBuilder();
  const g = b.gate('XOR', b.input('x1'), b.input('y1'));
  return b.build(g);
}

// The border: on when x is 0 or 15, or y is 0 or 15.
//   x == 0  is NOR of x0..x3   (no x bit set)
//   x == 15 is AND of x0..x3   (every x bit set)
// and likewise for y. The four conditions are OR-ed together.
function buildFrame() {
  const b = makeBuilder();

  // AND of a list of node ids into a left-leaning tree.
  const andAll = (ids) => ids.reduce((acc, id) => b.gate('AND', acc, id));
  // OR of a list, same shape.
  const orAll = (ids) => ids.reduce((acc, id) => b.gate('OR', acc, id));

  const xs = ['x0', 'x1', 'x2', 'x3'].map((l) => b.input(l));
  const ys = ['y0', 'y1', 'y2', 'y3'].map((l) => b.input(l));

  const xAll1 = andAll(xs); // x == 15
  const xAny = orAll(xs);
  const xAll0 = b.gate('NOT', xAny); // x == 0

  const yAll1 = andAll(ys); // y == 15
  const yAny = orAll(ys);
  const yAll0 = b.gate('NOT', yAny); // y == 0

  const border = orAll([xAll0, xAll1, yAll0, yAll1]);
  return b.build(border);
}

export const FEATURED_CIRCUITS = [
  { id: 'vertical-stripes', name: 'Vertical Stripes', circuit: NOT_X1_CIRCUIT },
  { id: 'left-half', name: 'Left Half', circuit: NOT_X3_CIRCUIT },
  { id: 'checkerboard', name: 'Checkerboard', circuit: XOR_CHECKERBOARD_CIRCUIT },
  { id: 'quadrants', name: 'Quadrants', circuit: buildQuadrants() },
  { id: 'outer-frame', name: 'Outer Frame', circuit: buildFrame() },
  { id: 'plaid', name: 'Plaid', circuit: buildPlaid() },
];

export default FEATURED_CIRCUITS;
