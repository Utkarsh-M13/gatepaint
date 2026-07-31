// The evaluation engine. Pure, no React, no DOM.
//
// evaluate(nodes, wires, bits) -> boolean
//
// nodes: [{ id, type: 'INPUT'|'AND'|'OR'|'NOT'|'XOR'|'NAND'|'OUTPUT', label, x, y }]
// wires: [{ id, from: nodeId, to: nodeId, toPort: 0|1 }]
// bits:  { x0..x3, y0..y3 } as 0/1 (see bits.js)
//
// INPUT nodes take their value from bits[label]. Every other node pulls its
// value from whatever wires feed its input ports. The OUTPUT node's value is
// the result. Anything unwired, unknown, or part of a cycle evaluates to off.

const GATE_TYPES = new Set(['AND', 'OR', 'NOT', 'XOR', 'NAND']);

function applyGate(type, a, b) {
  switch (type) {
    case 'AND':
      return a && b;
    case 'OR':
      return a || b;
    case 'NOT':
      // NOT reads port 0 only, port 1 is ignored.
      return !a;
    case 'XOR':
      return a !== b;
    case 'NAND':
      return !(a && b);
    default:
      return false;
  }
}

export function evaluate(nodes, wires, bits) {
  if (!Array.isArray(nodes) || nodes.length === 0) return false;
  const wireList = Array.isArray(wires) ? wires : [];
  const bitValues = bits || {};

  const byId = new Map();
  for (const node of nodes) {
    if (node && node.id !== undefined) byId.set(node.id, node);
  }

  // sources[nodeId][port] = source nodeId. Later wires to the same port win,
  // which matches the "an input pin holds one wire, replace on reconnect" rule.
  const sources = new Map();
  for (const wire of wireList) {
    if (!wire || !byId.has(wire.to) || !byId.has(wire.from)) continue;
    const port = wire.toPort === 1 ? 1 : 0;
    if (!sources.has(wire.to)) sources.set(wire.to, [undefined, undefined]);
    sources.get(wire.to)[port] = wire.from;
  }

  const outputNode = nodes.find((node) => node && node.type === 'OUTPUT');
  if (!outputNode) return false;

  // Depth-first topological walk with memoization. The visiting set catches
  // cycles, so a looped circuit terminates instead of recursing forever.
  const done = new Map();
  const visiting = new Set();
  let sawCycle = false;

  function valueOf(nodeId) {
    if (nodeId === undefined || !byId.has(nodeId)) return false;
    if (done.has(nodeId)) return done.get(nodeId);
    if (visiting.has(nodeId)) {
      sawCycle = true;
      return false;
    }

    visiting.add(nodeId);
    const node = byId.get(nodeId);
    const ports = sources.get(nodeId) || [undefined, undefined];
    let result = false;

    if (node.type === 'INPUT') {
      result = bitValues[node.label] === 1 || bitValues[node.label] === true;
    } else if (node.type === 'OUTPUT') {
      result = valueOf(ports[0]);
    } else if (GATE_TYPES.has(node.type)) {
      result = applyGate(node.type, valueOf(ports[0]), valueOf(ports[1]));
    }

    visiting.delete(nodeId);
    done.set(nodeId, result);
    return result;
  }

  const result = valueOf(outputNode.id);
  // A cycle anywhere in the driving circuit means the value is meaningless.
  // Treat the whole output as off rather than returning a made-up answer.
  if (sawCycle) return false;
  return result;
}

export default evaluate;
