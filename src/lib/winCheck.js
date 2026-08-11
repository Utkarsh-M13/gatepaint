// Pure win-check helpers for the Levels page. No React. A level's target is
// the boolean pixel array of its solution circuit; the live circuit wins when
// its painting matches that target exactly.

import { renderCircuitPixels } from './renderCircuit.js';

// The goal painting for a level: render its solution once. Callers memoize
// this so the 256 evaluations only run when the level changes.
export function targetOf(level) {
  return renderCircuitPixels(level.solution);
}

// True when the two pixel arrays are the same length and agree at every cell.
// Values are coerced to booleans so a mix of true/1 never trips a match.
export function pixelsEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (Boolean(a[i]) !== Boolean(b[i])) return false;
  }
  return true;
}

// How many cells of `pixels` match `target`, for the live match indicator.
export function matchCount(pixels, target) {
  if (!Array.isArray(pixels) || !Array.isArray(target)) return 0;
  const n = Math.min(pixels.length, target.length);
  let count = 0;
  for (let i = 0; i < n; i += 1) {
    if (Boolean(pixels[i]) === Boolean(target[i])) count += 1;
  }
  return count;
}

// A circuit is "basic gates only" when it carries no comparator (CMP) block:
// only INPUT/OUTPUT and the logic gates. This is the gated-bonus condition.
export function usesOnlyBasicGates(circuit) {
  const nodes = circuit && Array.isArray(circuit.nodes) ? circuit.nodes : [];
  return nodes.every((node) => node.type !== 'CMP');
}

// The full live result for a circuit against a precomputed target array:
//   solved  = painting equals the target exactly (earns the star)
//   gated   = solved AND the circuit uses no CMP block (earns the blue badge)
//   matched = matching cell count, total = grid cell count (for the indicator)
export function evaluateWin(circuit, target) {
  const pixels = renderCircuitPixels(circuit);
  const total = Array.isArray(target) ? target.length : 0;
  const matched = matchCount(pixels, target);
  const solved = total > 0 && matched === total;
  const gated = solved && usesOnlyBasicGates(circuit);
  return { solved, gated, matched, total };
}
