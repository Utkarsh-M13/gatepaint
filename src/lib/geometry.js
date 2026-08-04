// Pure layout helpers for drawing nodes and wires in the SVG workspace.
// No React here, just numbers, so Workspace/GateNode/Wire can all share it.

import { GRID_BITS } from '../engine/bits.js';

// Fallback workspace viewBox, used only for the first render before the SVG
// element has been measured. At runtime the viewBox is set to the element's
// own pixel size, so one user unit is one CSS pixel and nothing is stretched.
export const VIEW_WIDTH = 640;
export const VIEW_HEIGHT = 420;

// The fixed placeable world. It is generously larger than any panel (about
// 3-4x the fallback view each way) so gates can be spread out like a Figma
// board. Nodes clamp to these bounds, not to the moving visible view, and the
// background grid covers this whole area. One source of truth: changing these
// resizes the world everywhere (clamp, grid, home framing) with no other edit.
export const WORLD_WIDTH = 2400;
export const WORLD_HEIGHT = 1600;

// How much the background grid overhangs the world on each side, so panning a
// little past the world edge still shows grid rather than a hard cut.
export const WORLD_MARGIN = 400;

// Background grid spacing, in world units. A fine line every GRID_CELL, with a
// heavier rule every GRID_MAJOR cells, the usual graph-paper cadence.
export const GRID_CELL = 24;
export const GRID_MAJOR = 5;

// Gap between the right edge of the view and the OUTPUT node, kept for any
// callers that still want an edge margin. OUTPUT itself now lives at a fixed
// world coordinate (OUTPUT_HOME below), not the moving view edge.
export const OUTPUT_MARGIN = 24;

// Node boxes are sized about 30% larger than the original v1 dimensions so
// the gate boxes, and especially their pins, are easier to grab.
export const INPUT_SIZE = { width: 60, height: 32 };
export const OUTPUT_SIZE = { width: 78, height: 42 };
export const GATE_SIZE = { width: 84, height: 52 };

// The fixed home of the OUTPUT node in world coordinates. Right of world
// center (so inputs and gates have room to its left) and vertically centered,
// kept clear of the very corner so it reads well. This is a stable world
// coordinate, not tied to the view, so OUTPUT never chases the panel edge.
export const OUTPUT_HOME = {
  x: Math.round(WORLD_WIDTH * 0.62),
  y: Math.round((WORLD_HEIGHT - OUTPUT_SIZE.height) / 2),
};

// Fraction of the view width where OUTPUT's center sits at the home framing,
// so OUTPUT reads on the right with empty working room to its left.
export const HOME_OUTPUT_VIEW_FRACTION = 0.72;

// The pan that frames the HOME region: it places OUTPUT's center at
// HOME_OUTPUT_VIEW_FRACTION across the view and vertically centered. Screen s
// maps from world w by s = pan + zoom*w, so pan = targetScreen - zoom*w. Pure,
// so the initial framing, resetZoom and New/Load all share it and it is unit
// tested. Zoom defaults to 1 (the home zoom).
export function getHomePan(view, zoom = 1) {
  const cx = OUTPUT_HOME.x + OUTPUT_SIZE.width / 2;
  const cy = OUTPUT_HOME.y + OUTPUT_SIZE.height / 2;
  return {
    x: view.width * HOME_OUTPUT_VIEW_FRACTION - zoom * cx,
    y: view.height / 2 - zoom * cy,
  };
}

// The comparator block is a plain rectangle, sized to fit GRID_BITS input
// pins down its left edge, one constant digit aligned with each pin, and the
// operator control plus up/down stepper stacked on the right. The height is
// derived from GRID_BITS so a smaller grid gives a shorter block with no other
// edits. CMP_PIN_GAP is the vertical spacing the pins want; CMP_PAD is the
// extra room above and below them. The width holds three columns across: the
// pin and its bit label, the digit cell, then the operator and stepper group.
export const CMP_WIDTH = 140;
export const CMP_PIN_GAP = 26;
export const CMP_PAD = 30;
export const CMP_SIZE = {
  width: CMP_WIDTH,
  height: GRID_BITS * CMP_PIN_GAP + CMP_PAD,
};

// Schematic shape constants, shared by the drawing in GateNode and the pin
// math below so a pin can never drift off the symbol it belongs to.
//
// BUBBLE_R is the inversion bubble on NOT and NAND. The body of those two is
// drawn 2*BUBBLE_R shorter so the bubble still ends at the box's right edge.
export const BUBBLE_R = 5;
// How far the concave left edge of OR/XOR bows into the body at mid height.
export const OR_CONCAVE_DEPTH = 12;
// Gap between the XOR body and its extra detached curve, which is drawn at
// the left edge of the box while the body starts XOR_TAIL_GAP further right.
export const XOR_TAIL_GAP = 7;

// Where the two input pins sit down the height of a node, as fractions.
export const PORT_FRACTIONS = [0.28, 0.72];

// The block types a palette drop can swap in place. The combinational gates
// plus the comparator; INPUT and OUTPUT are fixtures, not swappable.
export const GATE_TYPES = new Set([
  'AND',
  'OR',
  'NOT',
  'XOR',
  'NAND',
  'NOR',
  'XNOR',
  'CMP',
]);

// True when a node type is one of the swappable gates.
export function isGateType(type) {
  return GATE_TYPES.has(type);
}

// True for the shield shapes with the curved concave left edge: OR and XOR
// plus their inverted twins NOR and XNOR.
function hasCurvedLeftEdge(type) {
  return type === 'OR' || type === 'XOR' || type === 'NOR' || type === 'XNOR';
}

// How far the body's left edge is inset from the box. XOR and XNOR are inset,
// to leave room for the detached curve they both draw.
export function getBodyInset(type) {
  return type === 'XOR' || type === 'XNOR' ? XOR_TAIL_GAP : 0;
}

// Size of a node's box, keyed by its type.
export function getNodeSize(node) {
  if (node.type === 'INPUT') return INPUT_SIZE;
  if (node.type === 'OUTPUT') return OUTPUT_SIZE;
  if (node.type === 'CMP') return CMP_SIZE;
  return GATE_SIZE;
}

// A node's bounding box as { x, y, width, height }. The box is the same
// rectangle used for clamping, hit-testing and marquee intersection.
export function getNodeBox(node) {
  const { width, height } = getNodeSize(node);
  return { x: node.x, y: node.y, width, height };
}

// Axis-aligned rectangle overlap test. Both args are { x, y, width, height }.
// Touching edges do not count as an overlap, which matches how a marquee that
// merely grazes a node's edge should not sweep it in.
export function rectsOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

// The bounding box that encloses every node in the list, or null for an empty
// list. Used to center a pasted group under the cursor.
export function getNodesBounds(nodes) {
  if (!nodes.length) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const node of nodes) {
    const box = getNodeBox(node);
    minX = Math.min(minX, box.x);
    minY = Math.min(minY, box.y);
    maxX = Math.max(maxX, box.x + box.width);
    maxY = Math.max(maxY, box.y + box.height);
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

// How many input ports a node has. INPUT nodes have none (they are sources).
// NOT and OUTPUT read a single port. A comparator reads one port per grid bit.
// AND/OR/XOR/NAND/NOR/XNOR read two.
export function getPortCount(node) {
  if (node.type === 'INPUT') return 0;
  if (node.type === 'NOT' || node.type === 'OUTPUT') return 1;
  if (node.type === 'CMP') return GRID_BITS;
  return 2;
}

// Position of the single output pin. Every symbol is drawn so its rightmost
// point lands on the right edge of the box: the semicircle of AND, the point
// of OR/XOR, the bubble of NOT and NAND, the end of an INPUT tag. So this is
// uniform, and pins stay welded to the drawn shape.
export function getOutputPinPos(node) {
  const { width, height } = getNodeSize(node);
  return { x: node.x + width, y: node.y + height / 2 };
}

// Zoom about an arbitrary point, keeping the workspace point under (cx, cy)
// fixed on screen. (cx, cy) are in SVG-viewport coordinates, the same space as
// pan (s = pan + zoom*w). Holding the point under the cursor fixed across the
// change means (c - pan0)/z0 = (c - pan1)/z1, so pan1 = c - z1*(c - pan0)/z0.
// Returns the unchanged zoom/pan when the clamp pins the scale, so callers can
// cheaply detect a no-op. Pure, so it is shared by the buttons, the keyboard
// and ctrl+wheel and unit-tested on its own.
export function zoomAboutPoint(zoom, pan, factor, cx, cy, min, max) {
  const next = Math.min(Math.max(zoom * factor, min), max);
  if (next === zoom) return { zoom, pan };
  return {
    zoom: next,
    pan: {
      x: cx - (next * (cx - pan.x)) / zoom,
      y: cy - (next * (cy - pan.y)) / zoom,
    },
  };
}

// Where the ray from (cx, cy) toward (tx, ty) crosses the border of `rect`,
// inset by `margin` on every side. (cx, cy) is assumed inside the rect; the
// first border the ray hits going outward is returned. Used to pin the
// off-screen OUTPUT marker to the panel edge along the line to OUTPUT.
export function projectPointToRectEdge(cx, cy, tx, ty, rect, margin = 0) {
  const dx = tx - cx;
  const dy = ty - cy;
  const left = rect.x + margin;
  const right = rect.x + rect.width - margin;
  const top = rect.y + margin;
  const bottom = rect.y + rect.height - margin;
  let t = Infinity;
  if (dx > 0) t = Math.min(t, (right - cx) / dx);
  else if (dx < 0) t = Math.min(t, (left - cx) / dx);
  if (dy > 0) t = Math.min(t, (bottom - cy) / dy);
  else if (dy < 0) t = Math.min(t, (top - cy) / dy);
  if (!Number.isFinite(t)) return { x: cx, y: cy };
  return { x: cx + dx * t, y: cy + dy * t };
}

// Off-screen marker for a node (used for OUTPUT). Projects the node's box
// through the current pan/zoom into SVG-viewport (== panel pixel) space. If
// that box overlaps the panel the node is on screen, so returns null (no
// marker). Otherwise returns the panel-edge point on the line from the panel
// center to the node's projected center, plus the angle (degrees) of that line
// so the marker can point toward the node.
export function getOffscreenIndicator(node, pan, zoom, view, margin = 18) {
  if (!node) return null;
  const size = getNodeSize(node);
  const box = {
    x: pan.x + zoom * node.x,
    y: pan.y + zoom * node.y,
    width: size.width * zoom,
    height: size.height * zoom,
  };
  const panel = { x: 0, y: 0, width: view.width, height: view.height };
  if (rectsOverlap(box, panel)) return null;
  const tx = box.x + box.width / 2;
  const ty = box.y + box.height / 2;
  const cx = view.width / 2;
  const cy = view.height / 2;
  const edge = projectPointToRectEdge(cx, cy, tx, ty, panel, margin);
  const angle = (Math.atan2(ty - cy, tx - cx) * 180) / Math.PI;
  return { x: edge.x, y: edge.y, angle };
}

// Position of input pin `port` (0 or 1) on the left edge of the shape.
// A single-port node gets its pin centered; a two-port node spreads them.
//
// For OR and XOR the left edge is not straight, it is a quadratic curve from
// the top left corner to the bottom left corner bowing right. That curve is
// parameterised so its y is linear in t, which makes the x offset at a given
// height fraction f exactly 2*f*(1-f)*depth. So the pins sit slightly inside
// the curve, on it, the way they do on a real schematic.
export function getInputPinPos(node, port) {
  const { height } = getNodeSize(node);
  const count = getPortCount(node);
  let fraction;
  if (node.type === 'CMP') {
    // One pin per grid bit, spread evenly down the straight left edge. Port 0
    // (the least significant bit) sits at the top. The comparator's constant
    // digits reuse these same y positions so digit i lines up with pin i.
    fraction = (port + 1) / (count + 1);
  } else {
    fraction = count <= 1 ? 0.5 : PORT_FRACTIONS[port === 1 ? 1 : 0];
  }
  const y = node.y + height * fraction;
  const inset = getBodyInset(node.type);
  const bow = hasCurvedLeftEdge(node.type)
    ? 2 * fraction * (1 - fraction) * OR_CONCAVE_DEPTH
    : 0;
  return { x: node.x + inset + bow, y };
}

// Finds the pin nearest to a workspace point within `radius`, or null. Used by
// drag-to-connect to resolve which pin the pointer was released over. Checks
// every node's output pin (all but OUTPUT) and each of its input pins, and
// returns the closest hit as { nodeId, kind: 'output'|'input', port }. Purely
// geometric, so it stays correct under any zoom/pan once the point has been
// converted to workspace coordinates.
export function findPinAtPoint(nodes, point, radius = 14) {
  let best = null;
  let bestDistSq = radius * radius;
  for (const node of nodes) {
    if (node.type !== 'OUTPUT') {
      const p = getOutputPinPos(node);
      const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
      if (d <= bestDistSq) {
        bestDistSq = d;
        best = { nodeId: node.id, kind: 'output', port: null };
      }
    }
    const count = getPortCount(node);
    for (let port = 0; port < count; port++) {
      const p = getInputPinPos(node, port);
      const d = (p.x - point.x) ** 2 + (p.y - point.y) ** 2;
      if (d <= bestDistSq) {
        bestDistSq = d;
        best = { nodeId: node.id, kind: 'input', port };
      }
    }
  }
  return best;
}

// Finds the topmost gate whose box contains a workspace point, or null. Only
// the swappable gate types count; INPUT and OUTPUT are skipped. Nodes later in
// the list draw on top, so the scan runs from the end to return the one the
// user would see under the cursor. Used by the palette drop to decide a swap.
export function findGateAtPoint(nodes, point) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const node = nodes[i];
    if (!isGateType(node.type)) continue;
    const box = getNodeBox(node);
    if (
      point.x >= box.x &&
      point.x <= box.x + box.width &&
      point.y >= box.y &&
      point.y <= box.y + box.height
    ) {
      return node;
    }
  }
  return null;
}
