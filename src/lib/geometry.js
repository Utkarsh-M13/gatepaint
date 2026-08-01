// Pure layout helpers for drawing nodes and wires in the SVG workspace.
// No React here, just numbers, so Workspace/GateNode/Wire can all share it.

// Fallback workspace viewBox, used only for the first render before the SVG
// element has been measured. At runtime the viewBox is set to the element's
// own pixel size, so one user unit is one CSS pixel and nothing is stretched.
export const VIEW_WIDTH = 640;
export const VIEW_HEIGHT = 420;

// Gap between the right edge of the view and the OUTPUT node, which is
// re-pinned to that edge whenever the view is resized.
export const OUTPUT_MARGIN = 24;

// Node boxes are sized about 30% larger than the original v1 dimensions so
// the gate boxes, and especially their pins, are easier to grab.
export const INPUT_SIZE = { width: 60, height: 32 };
export const OUTPUT_SIZE = { width: 78, height: 42 };
export const GATE_SIZE = { width: 84, height: 52 };

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

// True for the two shapes with the curved concave left edge.
function hasCurvedLeftEdge(type) {
  return type === 'OR' || type === 'XOR';
}

// How far the body's left edge is inset from the box. Only XOR is inset, to
// leave room for its detached curve.
export function getBodyInset(type) {
  return type === 'XOR' ? XOR_TAIL_GAP : 0;
}

// Size of a node's box, keyed by its type.
export function getNodeSize(node) {
  if (node.type === 'INPUT') return INPUT_SIZE;
  if (node.type === 'OUTPUT') return OUTPUT_SIZE;
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
// NOT and OUTPUT read a single port. AND/OR/XOR/NAND read two.
export function getPortCount(node) {
  if (node.type === 'INPUT') return 0;
  if (node.type === 'NOT' || node.type === 'OUTPUT') return 1;
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
  const fraction = count <= 1 ? 0.5 : PORT_FRACTIONS[port === 1 ? 1 : 0];
  const y = node.y + height * fraction;
  const inset = getBodyInset(node.type);
  const bow = hasCurvedLeftEdge(node.type)
    ? 2 * fraction * (1 - fraction) * OR_CONCAVE_DEPTH
    : 0;
  return { x: node.x + inset + bow, y };
}
