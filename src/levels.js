// The campaign: an ordered set of levels the player solves in the Levels page.
// Each level is a name, a one-line teaching hint, and a solution circuit. The
// target painting is DERIVED from the solution via renderCircuitPixels (see
// src/lib/winCheck.js), so a solution is guaranteed solvable: it is one known
// way to paint the goal.
//
// The solutions are built with the same builders the Featured gallery uses
// (makeBuilder / makeShapeBuilder and a few shape helpers exported from
// featured.js) so every circuit is valid and its painting is exact. Difficulty
// ramps from a single gate, through combining gates, to comparator shapes. The
// gated bonus (solve with zero CMP blocks) is meant to be hard on the
// comparator levels, and that is intended.

import {
  NOT_X1_CIRCUIT,
  NOT_X3_CIRCUIT,
  XOR_CHECKERBOARD_CIRCUIT,
} from './circuits.js';
import {
  makeBuilder,
  buildDisk,
  buildTriangle,
} from './featured.js';
import { GRID_SIZE } from './engine/bits.js';

const X_BITS = ['x0', 'x1', 'x2', 'x3'];
const Y_BITS = ['y0', 'y1', 'y2', 'y3'];
const LAST = GRID_SIZE - 1;

// x1 XOR y1: a coarse 2x2-block checkerboard (a plaid weave).
function buildPlaid() {
  const b = makeBuilder();
  return b.build(b.gate('XOR', b.input('x1'), b.input('y1')));
}

// The top-right quadrant: the right half (x3 set) intersected with the top
// half (y3 clear). AND of x3 and NOT y3.
function buildCorner() {
  const b = makeBuilder();
  const notY3 = b.gate('NOT', b.input('y3'));
  return b.build(b.gate('AND', b.input('x3'), notY3));
}

// x3 XOR y3: the two opposite quadrants (top-right and bottom-left).
function buildQuadrants() {
  const b = makeBuilder();
  return b.build(b.gate('XOR', b.input('x3'), b.input('y3')));
}

// A lattice: the union of the vertical stripes (NOT x1) and the horizontal
// stripes (NOT y1). OR of the two, so a pixel lights if either stripe covers
// it.
function buildLattice() {
  const b = makeBuilder();
  const vert = b.gate('NOT', b.input('x1'));
  const horiz = b.gate('NOT', b.input('y1'));
  return b.build(b.gate('OR', vert, horiz));
}

// NAND(x3, y3): everything except the bottom-right quadrant (where both high
// bits are set). NAND is AND then invert, so three corners stay lit.
function buildThreeCorners() {
  const b = makeBuilder();
  return b.build(b.gate('NAND', b.input('x3'), b.input('y3')));
}

// NOR(x3, y3): lit only in the top-left quadrant, where both high bits are
// clear. NOR is true only when every input is off.
function buildTopLeft() {
  const b = makeBuilder();
  return b.build(b.gate('NOR', b.input('x3'), b.input('y3')));
}

// XNOR(x0, y0): the inverse checkerboard. XNOR is equality, so a pixel lights
// where the two ones-bits agree (both 0 or both 1), the opposite of the plain
// checkerboard.
function buildInverseCheck() {
  const b = makeBuilder();
  return b.build(b.gate('XNOR', b.input('x0'), b.input('y0')));
}

// A vertical band of columns L..R across the full height, built from
// comparators on the x-bits. A bound hugging the edge is dropped.
function buildColumnBand(l, r) {
  const b = makeBuilder();
  const parts = [];
  if (l > 0) parts.push(b.cmp('GT', l - 1, X_BITS)); // x >= l
  if (r < LAST) parts.push(b.cmp('LT', r + 1, X_BITS)); // x <= r
  const out = parts.length === 2 ? b.gate('AND', parts[0], parts[1]) : parts[0];
  return b.build(out);
}

// A centered rectangle: columns l..r intersected with rows t..btm, each a
// comparator range on its axis, joined with AND.
function buildBox(l, r, t, btm) {
  const b = makeBuilder();
  const xParts = [];
  if (l > 0) xParts.push(b.cmp('GT', l - 1, X_BITS));
  if (r < LAST) xParts.push(b.cmp('LT', r + 1, X_BITS));
  const yParts = [];
  if (t > 0) yParts.push(b.cmp('GT', t - 1, Y_BITS));
  if (btm < LAST) yParts.push(b.cmp('LT', btm + 1, Y_BITS));
  const all = [...xParts, ...yParts];
  const out = all.reduce((acc, id) => b.gate('AND', acc, id));
  return b.build(out);
}

// The ordered campaign. Ids are stable strings; progress is keyed by them.
export const LEVELS = [
  // Single-gate ideas: one gate on one bit is already a shape.
  {
    id: 'stripes',
    name: 'Vertical Stripes',
    hint: 'NOT on the twos bit x1 paints two-wide vertical stripes.',
    solution: NOT_X1_CIRCUIT,
  },
  {
    id: 'left-half',
    name: 'Left Half',
    hint: 'x3 is the high bit: NOT x3 lights the whole left half.',
    solution: NOT_X3_CIRCUIT,
  },
  {
    id: 'checkerboard',
    name: 'Checkerboard',
    hint: 'x0 XOR y0 is on when exactly one ones-bit is set: a checker.',
    solution: XOR_CHECKERBOARD_CIRCUIT,
  },
  {
    id: 'plaid',
    name: 'Plaid',
    hint: 'XOR the twos bits x1 and y1 for a chunky 2x2 checker.',
    solution: buildPlaid(),
  },
  // Combining gates: AND narrows, OR unions, XOR splits.
  {
    id: 'corner',
    name: 'Top-Right Corner',
    hint: 'AND x3 with NOT y3 to keep only the top-right quadrant.',
    solution: buildCorner(),
  },
  {
    id: 'quadrants',
    name: 'Opposite Quadrants',
    hint: 'x3 XOR y3 lights the two quadrants where the halves disagree.',
    solution: buildQuadrants(),
  },
  {
    id: 'lattice',
    name: 'Lattice',
    hint: 'OR is union: NOT x1 OR NOT y1 overlays both stripe sets.',
    solution: buildLattice(),
  },
  // The inverted gates.
  {
    id: 'three-corners',
    name: 'Three Corners',
    hint: 'NAND x3 y3 is AND then flipped: all but the bottom-right block.',
    solution: buildThreeCorners(),
  },
  {
    id: 'top-left',
    name: 'Top-Left Block',
    hint: 'NOR is true only when both are off: just the top-left quadrant.',
    solution: buildTopLeft(),
  },
  {
    id: 'inverse-check',
    name: 'Inverse Checker',
    hint: 'XNOR is equality: x0 XNOR y0 lights where the bits agree.',
    solution: buildInverseCheck(),
  },
  // Comparators: compare a whole coordinate to a number to pick ranges.
  {
    id: 'column-band',
    name: 'Column Band',
    hint: 'A comparator picks a range: keep columns 4 through 11.',
    solution: buildColumnBand(4, 11),
  },
  {
    id: 'window',
    name: 'Window',
    hint: 'AND a column range with a row range to box off the center.',
    solution: buildBox(4, 11, 4, 11),
  },
  {
    id: 'triangle',
    name: 'Triangle',
    hint: 'Row by row, light columns up to the row index: x <= y.',
    solution: buildTriangle(),
  },
  {
    id: 'circle',
    name: 'Circle',
    hint: 'A stack of column ranges, one per row, fills a disk.',
    solution: buildDisk(6),
  },
];

export default LEVELS;
