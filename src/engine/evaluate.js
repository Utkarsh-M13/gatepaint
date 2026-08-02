// The evaluation engine. Pure, no React, no DOM.
//
// evaluate(nodes, wires, bits) -> boolean
//
// nodes: [{ id, type: 'INPUT'|'AND'|'OR'|'NOT'|'XOR'|'NAND'|'NOR'|'XNOR'|'CMP'|'OUTPUT', label, x, y }]
// wires: [{ id, from: nodeId, to: nodeId, toPort: 0..GRID_BITS-1 }]
// bits:  { x0..x3, y0..y3 } as 0/1 (see bits.js)
//
// INPUT nodes take their value from bits[label]. Every other node pulls its
// value from whatever wires feed its input ports. The OUTPUT node's value is
// the result. Anything unwired, unknown, or part of a cycle evaluates to off.

import { GRID_BITS } from './bits.js';

const GATE_TYPES = new Set(['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR', 'XNOR']);

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
    case 'NOR':
      return !(a || b);
    case 'XNOR':
      return a === b;
    default:
      return false;
  }
}

// The target constant packed into a single integer: bit i is target[i], the
// 2**i place, so index 0 is the least significant bit. A missing or short
// array counts the missing bits as 0.
function targetValue(target) {
  if (!Array.isArray(target)) return 0;
  let value = 0;
  for (let i = 0; i < GRID_BITS; i += 1) {
    if (target[i]) value += 1 << i;
  }
  return value;
}

export function evaluate(nodes, wires, bits) {
  if (!Array.isArray(nodes) || nodes.length === 0) return false;
  const wireList = Array.isArray(wires) ? wires : [];
  const bitValues = bits || {};

  const byId = new Map();
  for (const node of nodes) {
    if (node && node.id !== undefined) byId.set(node.id, node);
  }

  // sources[nodeId][port] = source nodeId. The array grows to hold as many
  // ports as a node needs (2 for a gate, GRID_BITS for a comparator); ports
  // never wired stay undefined and read as off. Later wires to the same port
  // win, matching the "an input pin holds one wire, replace on reconnect" rule.
  const sources = new Map();
  for (const wire of wireList) {
    if (!wire || !byId.has(wire.to) || !byId.has(wire.from)) continue;
    const port = Number.isInteger(wire.toPort) && wire.toPort >= 0 ? wire.toPort : 0;
    if (!sources.has(wire.to)) sources.set(wire.to, []);
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
    const ports = sources.get(nodeId) || [];
    let result = false;

    if (node.type === 'INPUT') {
      result = bitValues[node.label] === 1 || bitValues[node.label] === true;
    } else if (node.type === 'OUTPUT') {
      result = valueOf(ports[0]);
    } else if (node.type === 'CMP') {
      // Read the wired bits into a value V (port i is the 2**i place, an
      // unwired port counting as 0), then compare it to the packed target.
      let value = 0;
      for (let i = 0; i < GRID_BITS; i += 1) {
        if (valueOf(ports[i])) value += 1 << i;
      }
      const target = targetValue(node.target);
      if (node.op === 'EQ') result = value === target;
      else if (node.op === 'GT') result = value > target;
      else result = value < target; // LT is the default
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
