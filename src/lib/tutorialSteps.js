// Pure, testable predicates that drive the interactive tutorial's
// auto-advance. Each action step watches the live nodes/wires and moves on the
// moment its predicate turns true, so the user advances by actually building
// the circuit, not by clicking Next. No React here, so the whole advance logic
// is unit-testable against small hand-built fixtures.

// The gate types, everything that is neither an INPUT nor the OUTPUT. Kept as
// its own set so "any gate" stays correct as new gate types are added.
const GATE_TYPES = new Set(['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR', 'XNOR', 'CMP']);

// True when the node is a gate (not an INPUT, not the OUTPUT).
export function isGateNode(node) {
  return !!node && GATE_TYPES.has(node.type);
}

// Step 2 predicate: the workspace holds at least one gate node. The tutorial
// asks for a NOT but accepts any gate, so a curious player is never stuck.
export function hasGateNode(nodes) {
  return Array.isArray(nodes) && nodes.some(isGateNode);
}

// Step 3 predicate: a wire runs from an INPUT node into a gate's input. That
// is the "click x0's output, then the gate's input" connection.
export function inputWiredToGate(nodes, wires) {
  if (!Array.isArray(nodes) || !Array.isArray(wires)) return false;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  return wires.some((wire) => {
    const from = byId.get(wire.from);
    const to = byId.get(wire.to);
    return !!from && from.type === 'INPUT' && isGateNode(to);
  });
}

// Step 4 predicate: the OUTPUT node has an incoming wire, so the circuit
// actually feeds a result to the canvas.
export function outputIsFed(nodes, wires) {
  if (!Array.isArray(nodes) || !Array.isArray(wires)) return false;
  const out = nodes.find((node) => node.type === 'OUTPUT');
  if (!out) return false;
  return wires.some((wire) => wire.to === out.id);
}

// The ordered tutorial. Each step names the real element it anchors to (by its
// data-tutorial attribute), the bubble copy, and how it advances:
//   - 'button' steps (welcome, finish) advance on the bubble's own button.
//   - 'auto' steps advance when `predicate(nodes, wires)` becomes true, and
//     may also be skipped forward. Every predicate takes (nodes, wires) so the
//     component can call them uniformly.
export const TUTORIAL_STEPS = [
  {
    id: 'welcome',
    target: 'workspace',
    body: "Hey! Let's paint your first pixels together. It takes about a minute.",
    advance: 'button',
    buttonLabel: "Let's go",
  },
  {
    id: 'drag-not',
    target: 'palette-not',
    body: 'Grab a NOT gate from the palette and drop it into the workspace.',
    advance: 'auto',
    predicate: hasGateNode,
  },
  {
    id: 'wire-input',
    target: 'workspace',
    body: "Now connect x0 to it. Click the dot on x0, then the dot on the NOT gate.",
    advance: 'auto',
    predicate: inputWiredToGate,
  },
  {
    id: 'wire-output',
    target: 'output',
    body: "Almost there. Wire the NOT gate across to OUTPUT the same way.",
    advance: 'auto',
    predicate: outputIsFed,
  },
  {
    id: 'celebrate',
    target: 'canvas',
    body: 'Look up at the canvas. You just painted stripes from a single gate. Nice work.',
    advance: 'button',
    buttonLabel: 'Nice',
  },
  {
    id: 'number',
    target: 'canvas',
    body: "One last thing. Every pixel is really just a number. Want to see how that works?",
    advance: 'button',
    buttonLabel: 'Show me',
    openNumber: true,
  },
];
