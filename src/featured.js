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
import { GRID_SIZE, valueToTarget } from './engine/bits.js';

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
  let cmpCount = 0;
  let wireCount = 0;

  // Layout: a fixed left inset, then one column per depth. Computed rather than
  // a fixed table so deep OR trees (the shape circuits) keep spreading right
  // instead of piling into the last column. Everything stays inside the 2400 x
  // 1600 world, and the app re-pins OUTPUT and clamps into view on load anyway.
  const COL_LEFT = 40;
  const COL_STEP = 120;
  const MAX_COL = 18;
  const ROW_TOP = 24;
  const ROW_STEP = 44;

  function place(id, depth) {
    depthOf.set(id, depth);
    const row = rowsInCol.get(depth) || 0;
    rowsInCol.set(depth, row + 1);
    const node = nodes.find((n) => n.id === id);
    node.x = COL_LEFT + Math.min(depth, MAX_COL) * COL_STEP;
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

  // A comparator block. `op` is 'LT'|'EQ'|'GT', `value` is the integer constant
  // it compares against (packed into a GRID_BITS binary target), and `labels`
  // are the input labels wired into ports 0..GRID_BITS-1 (port i is bit i, the
  // 2**i place). For the standard grid `labels` is x0..x3 or y0..y3, so the
  // block compares the whole column or row to the constant.
  function cmp(op, value, labels) {
    const id = `c${cmpCount}`;
    cmpCount += 1;
    nodes.push({ id, type: 'CMP', label: 'CMP', op, target: valueToTarget(value), x: 0, y: 0 });
    const srcIds = labels.map((l) => input(l));
    const depth = Math.max(...srcIds.map((s) => depthOf.get(s) ?? 0)) + 1;
    place(id, depth);
    srcIds.forEach((src, port) => {
      wires.push({ id: `w${wireCount}`, from: src, to: id, toPort: port });
      wireCount += 1;
    });
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

  return { input, gate, cmp, build };
}

// A band-building layer over makeBuilder. Every shape below is a union (OR) of
// axis-aligned bands, and each band is an intersection (AND) of a row range and
// a column range. The ranges themselves are comparator blocks:
//
//   x >= L   is  CMP(GT, L-1)  wired from x0..x3  (V > L-1  is  V >= L)
//   x <= R   is  CMP(LT, R+1)  wired from x0..x3  (V < R+1  is  V <= R)
//   x == k   is  CMP(EQ, k)
//
// and the same for y from y0..y3. A range hugging the edge (L <= 0 or R >= the
// last column) drops the bound it does not need, so no comparator is ever asked
// for an out-of-range constant.
const X_BITS = ['x0', 'x1', 'x2', 'x3'];
const Y_BITS = ['y0', 'y1', 'y2', 'y3'];
const LAST = GRID_SIZE - 1;

function makeShapeBuilder() {
  const b = makeBuilder();

  const and = (a, c) => b.gate('AND', a, c);
  const or = (a, c) => b.gate('OR', a, c);
  // OR (or AND) a list into a left-leaning tree. A single id passes through.
  const orAll = (ids) => ids.reduce(or);

  const geX = (l) => b.cmp('GT', l - 1, X_BITS);
  const leX = (r) => b.cmp('LT', r + 1, X_BITS);
  const geY = (l) => b.cmp('GT', l - 1, Y_BITS);
  const leY = (r) => b.cmp('LT', r + 1, Y_BITS);
  const eqY = (k) => b.cmp('EQ', k, Y_BITS);

  // The comparator sub-result for L <= axis <= R, dropping a bound that the grid
  // makes trivially true. Returns null when the whole axis is unconstrained.
  function rangeX(l, r) {
    const parts = [];
    if (l > 0) parts.push(geX(l));
    if (r < LAST) parts.push(leX(r));
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0];
    return and(parts[0], parts[1]);
  }

  // The row selector for a group of rows: a single EQ when it is one row, an
  // AND of two comparators when it is a span.
  function rowsY(y0, y1) {
    if (y0 === y1) return eqY(y0);
    return and(geY(y0), leY(y1));
  }

  // One band: these rows intersected with this column range.
  function band(y0, y1, l, r) {
    const yPart = rowsY(y0, y1);
    const xPart = rangeX(l, r);
    return xPart === null ? yPart : and(yPart, xPart);
  }

  return { b, and, or, orAll, band };
}

// Per-row [L, R] column span of a filled disk of radius r centered at
// (7.5, 7.5): every x with (x - 7.5)^2 + (y - 7.5)^2 <= r^2. Rows with no
// pixels are omitted.
function diskRows(r) {
  const c = (GRID_SIZE - 1) / 2; // 7.5 on the default grid
  const rows = [];
  for (let y = 0; y < GRID_SIZE; y += 1) {
    const inside = r * r - (y - c) * (y - c);
    if (inside < 0) continue;
    const hw = Math.sqrt(inside);
    const L = Math.ceil(c - hw);
    const R = Math.floor(c + hw);
    if (L <= R) rows.push({ y, L, R });
  }
  return rows;
}

// Per-row [L, R] span of an L1 ball (a diamond) of radius r centered at
// (7.5, 7.5): every x with |x - 7.5| + |y - 7.5| <= r.
function diamondRows(r) {
  const c = (GRID_SIZE - 1) / 2;
  const rows = [];
  for (let y = 0; y < GRID_SIZE; y += 1) {
    const half = r - Math.abs(y - c);
    if (half < 0) continue;
    const L = Math.ceil(c - half);
    const R = Math.floor(c + half);
    if (L <= R) rows.push({ y, L, R });
  }
  return rows;
}

// Collapse consecutive rows that share the same [L, R] into a single band so
// the circuit uses a row-span comparator instead of one EQ per row.
function groupRows(rows) {
  const groups = [];
  for (const row of rows) {
    const last = groups[groups.length - 1];
    if (last && last.L === row.L && last.R === row.R && last.y1 === row.y - 1) {
      last.y1 = row.y;
    } else {
      groups.push({ y0: row.y, y1: row.y, L: row.L, R: row.R });
    }
  }
  return groups;
}

// Emits the bands for a list of per-row [L, R] spans into builder `s` and
// returns the OR of them: one filled shape as a single sub-result id.
function fillShape(s, rows) {
  const groups = groupRows(rows);
  const bands = groups.map((g) => s.band(g.y0, g.y1, g.L, g.R));
  return s.orAll(bands);
}

// A filled disk of radius r, built from comparator bands.
function buildDisk(r) {
  const s = makeShapeBuilder();
  return s.b.build(fillShape(s, diskRows(r)));
}

// A ring (circle outline): the disk of radius rOuter with the disk of radius
// rInner punched out, done by XOR-ing the two filled disks. Because the inner
// disk sits entirely inside the outer one, the XOR leaves exactly the annulus.
function buildRing(rOuter, rInner) {
  const s = makeShapeBuilder();
  const outer = fillShape(s, diskRows(rOuter));
  const inner = fillShape(s, diskRows(rInner));
  return s.b.build(s.b.gate('XOR', outer, inner));
}

// A filled diamond (L1 ball) of radius r, built from comparator bands.
function buildDiamond(r) {
  const s = makeShapeBuilder();
  return s.b.build(fillShape(s, diamondRows(r)));
}

// A right triangle: the lower-left region where the column index is at most the
// row index (x <= y). Row k lights columns 0..k, so each band is
// (y == k) AND (x <= k). The x <= k bound needs no lower comparator, and the
// full-width top row (x <= LAST) needs no comparator at all.
function buildTriangle() {
  const s = makeShapeBuilder();
  const rows = [];
  for (let y = 0; y < GRID_SIZE; y += 1) rows.push({ y, L: 0, R: y });
  return s.b.build(fillShape(s, rows));
}

// A bullseye: filled disks of radius 6, 4, and 2 XOR-combined. XOR toggles
// membership, so a pixel is on in the outer band (in disk6, outside disk4) and
// in the center dot (inside disk2), and off in the gap between them.
function buildBullseye() {
  const s = makeShapeBuilder();
  const d6 = fillShape(s, diskRows(6));
  const d4 = fillShape(s, diskRows(4));
  const d2 = fillShape(s, diskRows(2));
  return s.b.build(s.b.gate('XOR', s.b.gate('XOR', d6, d4), d2));
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
  // Comparator-built shapes. Each is a union of column/row ranges, and every
  // range is a CMP block wired from the four x-bits or the four y-bits.
  { id: 'circle', name: 'Circle', circuit: buildDisk(6) },
  { id: 'ring', name: 'Ring', circuit: buildRing(6, 4) },
  { id: 'diamond', name: 'Diamond', circuit: buildDiamond(6) },
  { id: 'triangle', name: 'Triangle', circuit: buildTriangle() },
  { id: 'bullseye', name: 'Bullseye', circuit: buildBullseye() },
];

export default FEATURED_CIRCUITS;
