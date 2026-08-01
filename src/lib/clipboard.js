// Pure clipboard helpers for copy/cut/paste in the workspace. No React here,
// just data transforms, so they can be unit-tested in isolation.

// Builds a clipboard payload from a selection: deep copies of the selected
// nodes (never OUTPUT) plus the wires whose BOTH endpoints are inside the
// selection. A wire with only one endpoint selected is dropped, since its
// other end would not exist in the pasted copy. Returns null when nothing
// copyable is selected.
export function buildClipboard(nodes, wires, selectedIds) {
  const selNodes = nodes.filter(
    (node) => selectedIds.has(node.id) && node.type !== 'OUTPUT'
  );
  if (selNodes.length === 0) return null;
  const selSet = new Set(selNodes.map((node) => node.id));
  const selWires = wires.filter(
    (wire) => selSet.has(wire.from) && selSet.has(wire.to)
  );
  return {
    nodes: selNodes.map((node) => ({ ...node })),
    wires: selWires.map((wire) => ({ ...wire })),
  };
}

// Produces a fresh set of nodes and wires from a clipboard payload: every node
// gets a brand new id and is shifted by { dx, dy }, and the internal wires are
// remapped onto the new ids so the copied sub-circuit stays wired together.
// `nextId(prefix)` mints unique ids. Returns { nodes, wires, newNodeIds }.
export function remapClipboard(clipboard, nextId, offset) {
  const idMap = new Map();
  const nodes = clipboard.nodes.map((node) => {
    const id = nextId('n');
    idMap.set(node.id, id);
    return { ...node, id, x: node.x + offset.dx, y: node.y + offset.dy };
  });
  const wires = clipboard.wires.map((wire) => ({
    ...wire,
    id: nextId('w'),
    from: idMap.get(wire.from),
    to: idMap.get(wire.to),
  }));
  return { nodes, wires, newNodeIds: nodes.map((node) => node.id) };
}
