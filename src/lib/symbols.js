// Schematic symbol path generation, shared by the workspace GateNode and the
// palette icons so both draw the exact same IEEE distinctive shapes. No React
// here, just SVG path strings built from the geometry constants.

import { getNodeSize, getBodyInset, BUBBLE_R, OR_CONCAVE_DEPTH } from './geometry.js';

// A small circle as a closed subpath, used for the inversion bubble on NOT
// and NAND. Drawn as part of the body path so the bubble picks up the same
// fill, the same hairline, and the same selected highlight.
function bubbleSubpath(cx, cy, r) {
  return (
    `M ${cx - r} ${cy}` +
    ` A ${r} ${r} 0 1 0 ${cx + r} ${cy}` +
    ` A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`
  );
}

// The classic distinctive-shape schematic symbols, drawn to fill the node's
// box exactly. Every shape's rightmost point is the right edge of the box,
// bubble included, which is what keeps the output pin on the shape.
//
// Returns { body, tail, labelX }. `tail` is the extra detached curve behind
// XOR, drawn unfilled as its own path. `labelX` is where the type label sits.
export function gateSymbol(node) {
  const { width, height } = getNodeSize(node);
  const { x, y, type } = node;
  const midY = y + height / 2;

  if (type === 'NOT') {
    // Triangle pointing right, with the bubble on its tip.
    const tipX = x + width - 2 * BUBBLE_R;
    const body =
      `M ${x} ${y} L ${tipX} ${midY} L ${x} ${y + height} Z ` +
      bubbleSubpath(x + width - BUBBLE_R, midY, BUBBLE_R);
    // The triangle narrows toward the tip, so the label is nudged left into
    // the wide part rather than centered on the bounding box.
    return { body, tail: null, labelX: x + (tipX - x) * 0.37 };
  }

  if (type === 'AND' || type === 'NAND') {
    // Flat left side, semicircular right side: the D shape.
    const inverted = type === 'NAND';
    const bodyWidth = inverted ? width - 2 * BUBBLE_R : width;
    const radius = height / 2;
    const arcX = x + bodyWidth - radius;
    let body =
      `M ${x} ${y} L ${arcX} ${y}` +
      ` A ${radius} ${radius} 0 0 1 ${arcX} ${y + height}` +
      ` L ${x} ${y + height} Z`;
    if (inverted) {
      body += ' ' + bubbleSubpath(x + width - BUBBLE_R, midY, BUBBLE_R);
    }
    return { body, tail: null, labelX: x + bodyWidth / 2 };
  }

  // OR/NOR and XOR/XNOR: concave left edge, two convex curves meeting in a
  // point on the right. XOR and XNOR are the same shield pushed right to leave
  // room for the detached curve behind them. NOR and XNOR are the inverted
  // twins: the shield is drawn shorter and an inversion bubble sits on the tip,
  // the same bubble NAND and NOT use.
  const inverted = type === 'NOR' || type === 'XNOR';
  const inset = getBodyInset(type);
  const leftX = x + inset;
  const tipX = inverted ? x + width - 2 * BUBBLE_R : x + width;
  const bodyWidth = tipX - leftX;
  const c1x = leftX + bodyWidth * 0.55;
  const c2x = tipX - bodyWidth * 0.28;
  let body =
    `M ${leftX} ${y}` +
    ` Q ${leftX + OR_CONCAVE_DEPTH} ${midY} ${leftX} ${y + height}` +
    ` C ${c1x} ${y + height}, ${c2x} ${y + height * 0.82}, ${tipX} ${midY}` +
    ` C ${c2x} ${y + height * 0.18}, ${c1x} ${y}, ${leftX} ${y} Z`;
  if (inverted) {
    body += ' ' + bubbleSubpath(x + width - BUBBLE_R, midY, BUBBLE_R);
  }
  const tail =
    type === 'XOR' || type === 'XNOR'
      ? `M ${x} ${y} Q ${x + OR_CONCAVE_DEPTH} ${midY} ${x} ${y + height}`
      : null;
  return { body, tail, labelX: (leftX + OR_CONCAVE_DEPTH + tipX) / 2 };
}
