// Pure circuit-to-pixels helper. No React. Shared by the gallery thumbnails
// and the verification tests so a thumbnail always draws exactly what the
// engine would paint on the live canvas.
//
// renderCircuitPixels(circuit) -> boolean[] of length GRID_SIZE * GRID_SIZE,
// row-major (y outer, x inner) to match how OutputCanvas lays out its grid.

import { GRID_SIZE, bitsOf } from '../engine/bits.js';
import { evaluate } from '../engine/evaluate.js';

export function renderCircuitPixels(circuit) {
  const nodes = circuit && Array.isArray(circuit.nodes) ? circuit.nodes : [];
  const wires = circuit && Array.isArray(circuit.wires) ? circuit.wires : [];
  const pixels = [];
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      pixels.push(evaluate(nodes, wires, bitsOf(x, y)));
    }
  }
  return pixels;
}

export default renderCircuitPixels;
