// Pure bit decomposition helpers. No React, no side effects.

// The one constant that controls grid size.
// GRID_BITS = 4 gives a 16x16 canvas with inputs x0..x3 and y0..y3.
// Changing it to 3 gives 8x8 with x0..x2 and y0..y2, and nothing else needs editing.
export const GRID_BITS = 4;

export const GRID_SIZE = 2 ** GRID_BITS;

// Input labels derived from GRID_BITS, e.g. ['x0','x1','x2','x3'].
export const X_LABELS = Array.from({ length: GRID_BITS }, (_, i) => `x${i}`);
export const Y_LABELS = Array.from({ length: GRID_BITS }, (_, i) => `y${i}`);
export const INPUT_LABELS = [...X_LABELS, ...Y_LABELS];

// bitsOf(5, 2) -> { x0:1, x1:0, x2:1, x3:0, y0:0, y1:1, y2:0, y3:0 }
// Bit i is the 2**i place, so x0 is the ones bit and x3 is the eights bit.
export function bitsOf(x, y) {
  const bits = {};
  for (let i = 0; i < GRID_BITS; i += 1) {
    bits[`x${i}`] = (x >> i) & 1;
    bits[`y${i}`] = (y >> i) & 1;
  }
  return bits;
}

// The largest value a GRID_BITS binary constant can hold, e.g. 15 at 4 bits.
export const MAX_TARGET = 2 ** GRID_BITS - 1;

// Packs a binary constant array (index i is bit i, the 2**i place) into its
// integer value. A missing or short array counts the missing bits as 0.
export function targetToValue(target) {
  if (!Array.isArray(target)) return 0;
  let value = 0;
  for (let i = 0; i < GRID_BITS; i += 1) {
    if (target[i]) value += 1 << i;
  }
  return value;
}

// Unpacks an integer into a length-GRID_BITS binary constant array of 0/1.
export function valueToTarget(value) {
  return Array.from({ length: GRID_BITS }, (_, i) => (value >> i) & 1);
}

// Steps a binary constant up or down by `delta` (typically +1 or -1) and
// returns the new array, clamped to 0..MAX_TARGET so it never wraps past
// either end. At the top a +1 is a no-op; at the bottom a -1 is a no-op.
export function stepTarget(target, delta) {
  const next = Math.min(Math.max(targetToValue(target) + delta, 0), MAX_TARGET);
  return valueToTarget(next);
}
