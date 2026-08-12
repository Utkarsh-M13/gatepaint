// Pure helpers for the "How the number works" explainer. No React, so the
// plain-language reading is easy to unit test on its own. Reads bit values
// through bitsOf from the engine rather than reimplementing the bit math.
import { GRID_SIZE, GRID_BITS, X_LABELS, Y_LABELS, bitsOf } from '../engine/bits.js';

// High bit to low bit, matching the LED readout in OutputCanvas so the
// explainer's chip row reads the same way: x3 x2 x1 x0, y3 y2 y1 y0.
export const X_READOUT = [...X_LABELS].reverse();
export const Y_READOUT = [...Y_LABELS].reverse();

// Turns a bits object (as returned by bitsOf) into a binary string, high bit
// first, e.g. { x0:1, x1:0, x2:1, x3:0 } -> "0101".
function binaryString(bits, labels) {
  return labels.map((label) => bits[label]).join('');
}

// Builds the full plain-language explanation for one selected pixel: the
// friendly coordinate line, both axes as binary strings, and a couple of
// sentences reading the high bits spatially. Everything here is derived from
// GRID_BITS/GRID_SIZE and the real bitsOf output, so it holds even if the
// grid size ever changes.
export function describePixel(x, y) {
  const bits = bitsOf(x, y);
  const half = GRID_SIZE / 2;
  const topXBit = `x${GRID_BITS - 1}`;
  const topYBit = `y${GRID_BITS - 1}`;

  const xLine = bits[topXBit]
    ? `${topXBit} = 1 means x is in the right half (${half} to ${GRID_SIZE - 1}).`
    : `${topXBit} = 0 means x is in the left half (0 to ${half - 1}).`;
  const yLine = bits[topYBit]
    ? `${topYBit} = 1 means y is in the bottom half (${half} to ${GRID_SIZE - 1}).`
    : `${topYBit} = 0 means y is in the top half (0 to ${half - 1}).`;

  return {
    x,
    y,
    bits,
    columnRow: `column ${x}, row ${y}`,
    xBinary: binaryString(bits, X_READOUT),
    yBinary: binaryString(bits, Y_READOUT),
    lines: [xLine, yLine],
  };
}
