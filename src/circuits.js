// Hardcoded circuits for Phase 2/3 verification. Pure data, no React.
//
// Inputs are ordinary nodes in the workspace now, dragged in from the palette.
// The presets below place the input nodes they actually use on the left, the
// gate in the middle, and the output on the right.

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

// A blank sandbox: just the output node. The player drags inputs and gates in
// from the palette and wires them up from here.
export const EMPTY_CIRCUIT = {
  nodes: [OUTPUT_NODE],
  wires: [],
};

// Default circuit shown on load. The sandbox starts blank; the presets above
// stay exported so they can be dropped in when verifying the engine.
export const DEFAULT_CIRCUIT = EMPTY_CIRCUIT;
