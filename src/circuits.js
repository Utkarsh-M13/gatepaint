// Hardcoded circuits for Phase 2/3 verification. Pure data, no React.
//
// Inputs are ordinary nodes in the workspace now, dragged in from the palette.
// The presets below place the input nodes they actually use on the left, the
// gate in the middle, and the output on the right.

import { INPUT_LABELS } from './engine/bits.js';
import {
  OUTPUT_HOME,
  WORLD_HEIGHT,
  INPUT_SIZE,
} from './lib/geometry.js';

const INPUT_X = 60;
const GATE_X = 300;
const GATE_Y = 180;
// Kept close to the right edge of the viewBox so the OUTPUT node sits near
// the right edge of the actual visible workspace area.
const OUTPUT_X = 556;
const OUTPUT_Y = 180;

const OUTPUT_NODE = { id: 'out', type: 'OUTPUT', label: 'out', x: OUTPUT_X, y: OUTPUT_Y };

// One INPUT node at a given height on the left edge of the workspace.
function inputNode(label, y) {
  return { id: `in-${label}`, type: 'INPUT', label, x: INPUT_X, y };
}

// `NOT x1` -> on when x1 is 0. Should paint two-wide vertical stripes:
// x1 is the twos bit, so it is 0 for two columns, then 1 for two columns.
export const NOT_X1_CIRCUIT = {
  nodes: [
    inputNode('x1', 188),
    { id: 'g1', type: 'NOT', label: 'NOT', x: GATE_X, y: GATE_Y },
    OUTPUT_NODE,
  ],
  wires: [
    { id: 'w1', from: 'in-x1', to: 'g1', toPort: 0 },
    { id: 'w2', from: 'g1', to: 'out', toPort: 0 },
  ],
};

// `NOT x3` -> on when x3 is 0. x3 is the eights bit, 0 for x in 0..7, so the
// left half of the canvas should be solid.
export const NOT_X3_CIRCUIT = {
  nodes: [
    inputNode('x3', 188),
    { id: 'g1', type: 'NOT', label: 'NOT', x: GATE_X, y: GATE_Y },
    OUTPUT_NODE,
  ],
  wires: [
    { id: 'w1', from: 'in-x3', to: 'g1', toPort: 0 },
    { id: 'w2', from: 'g1', to: 'out', toPort: 0 },
  ],
};

// `x0 XOR y0` -> on when exactly one of the ones-bits is set, which
// alternates every pixel in both directions: a checkerboard.
export const XOR_CHECKERBOARD_CIRCUIT = {
  nodes: [
    inputNode('x0', 140),
    inputNode('y0', 236),
    { id: 'g1', type: 'XOR', label: 'XOR', x: GATE_X, y: GATE_Y },
    OUTPUT_NODE,
  ],
  wires: [
    { id: 'w1', from: 'in-x0', to: 'g1', toPort: 0 },
    { id: 'w2', from: 'in-y0', to: 'g1', toPort: 1 },
    { id: 'w3', from: 'g1', to: 'out', toPort: 0 },
  ],
};

// The starting sandbox lays all INPUT_LABELS input nodes (x0..x3, y0..y3) in a
// tidy column to the left of OUTPUT_HOME, evenly spaced and vertically centered
// on the world, so both the initial load and File > New open framed on the full
// input set next to OUTPUT. Derived from INPUT_LABELS so it generalizes with
// GRID_BITS. fitNodesToWorld clamps these into bounds and re-pins OUTPUT.
const START_INPUT_X = OUTPUT_HOME.x - 380;
const START_INPUT_GAP = 56;

function startInputNodes() {
  const count = INPUT_LABELS.length;
  const top = Math.round(
    WORLD_HEIGHT / 2 - ((count - 1) * START_INPUT_GAP) / 2 - INPUT_SIZE.height / 2
  );
  return INPUT_LABELS.map((label, i) => ({
    id: `in-${label}`,
    type: 'INPUT',
    label,
    x: START_INPUT_X,
    y: top + i * START_INPUT_GAP,
  }));
}

// The starting sandbox: every input node already placed, plus OUTPUT. The
// player wires them up and drags in gates; the palette can still add more
// inputs, so duplicates are harmless.
export const EMPTY_CIRCUIT = {
  nodes: [...startInputNodes(), OUTPUT_NODE],
  wires: [],
};

// Default circuit shown on load. The sandbox starts blank; the presets above
// stay exported so they can be dropped in when verifying the engine.
export const DEFAULT_CIRCUIT = EMPTY_CIRCUIT;

// The complete set of node types the engine understands. Used to validate a
// loaded circuit file before it replaces the live one.
export const KNOWN_NODE_TYPES = new Set([
  'INPUT',
  'AND',
  'OR',
  'NOT',
  'XOR',
  'NAND',
  'NOR',
  'XNOR',
  'CMP',
  'OUTPUT',
]);
