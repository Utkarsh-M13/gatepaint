import { describe, it, expect } from 'vitest';
import { buildClipboard, remapClipboard } from './clipboard.js';

const node = (id, type = 'AND', x = 0, y = 0) => ({ id, type, label: type, x, y });
const wire = (id, from, to, toPort = 0) => ({ id, from, to, toPort });

describe('buildClipboard', () => {
  it('copies selected non-OUTPUT nodes and only fully-internal wires', () => {
    const nodes = [node('a', 'INPUT'), node('b', 'AND'), node('c', 'AND'), node('out', 'OUTPUT')];
    const wires = [
      wire('w1', 'a', 'b'), // both selected -> kept
      wire('w2', 'b', 'out'), // out not selected -> dropped
      wire('w3', 'c', 'b'), // c not selected -> dropped
    ];
    const clip = buildClipboard(nodes, wires, new Set(['a', 'b']));
    expect(clip.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(clip.wires.map((w) => w.id)).toEqual(['w1']);
  });

  it('never copies OUTPUT and returns null when only OUTPUT is selected', () => {
    const nodes = [node('out', 'OUTPUT')];
    expect(buildClipboard(nodes, [], new Set(['out']))).toBeNull();
  });

  it('returns null for an empty selection', () => {
    expect(buildClipboard([node('a')], [], new Set())).toBeNull();
  });

  it('deep copies so later mutation of the source does not leak', () => {
    const nodes = [node('a', 'AND', 5, 5)];
    const clip = buildClipboard(nodes, [], new Set(['a']));
    nodes[0].x = 999;
    expect(clip.nodes[0].x).toBe(5);
  });
});

describe('remapClipboard', () => {
  it('assigns fresh ids, offsets positions, and rewires internal edges', () => {
    const clip = {
      nodes: [node('a', 'INPUT', 10, 20), node('b', 'AND', 30, 40)],
      wires: [wire('w1', 'a', 'b', 1)],
    };
    let n = 0;
    const nextId = (p) => `${p}-${(n += 1)}`;
    const out = remapClipboard(clip, nextId, { dx: 24, dy: 24 });

    expect(out.nodes[0].id).not.toBe('a');
    expect(out.nodes[1].id).not.toBe('b');
    expect(out.nodes[0]).toMatchObject({ x: 34, y: 44 });
    expect(out.nodes[1]).toMatchObject({ x: 54, y: 64 });
    // The wire now points at the two new ids, keeping its port.
    expect(out.wires[0].from).toBe(out.nodes[0].id);
    expect(out.wires[0].to).toBe(out.nodes[1].id);
    expect(out.wires[0].toPort).toBe(1);
    expect(out.newNodeIds).toEqual(out.nodes.map((nd) => nd.id));
  });

  it('mints distinct ids on repeated pastes', () => {
    const clip = { nodes: [node('a')], wires: [] };
    let n = 0;
    const nextId = (p) => `${p}-${(n += 1)}`;
    const first = remapClipboard(clip, nextId, { dx: 0, dy: 0 });
    const second = remapClipboard(clip, nextId, { dx: 0, dy: 0 });
    expect(first.nodes[0].id).not.toBe(second.nodes[0].id);
  });
});
