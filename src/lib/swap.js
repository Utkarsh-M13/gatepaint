// Pure wire-transfer logic for swapping one gate for another. No React here.
//
// When a new gate is dropped on top of an existing gate, the old gate is
// removed and the new one takes its place. Its wiring moves across:
//   - every wire FROM the old gate's output is re-pointed to the new gate's
//     output, so fan-out is preserved;
//   - every wire INTO the old gate maps onto the new gate's input port of the
//     same index, but only if that port exists on the new gate. A wire to a
//     port the new gate does not have (e.g. dropping a one-input NOT onto a
//     wired two-input AND) is dropped.
// Wire ids are kept stable; only the from/to endpoints change. The result is a
// fresh array, and every wire in it still refers to live nodes.
export function transferWiresForSwap(oldId, newId, newPortCount, wires) {
  const result = [];
  for (const wire of wires) {
    if (wire.from === oldId) {
      result.push({ ...wire, from: newId });
      continue;
    }
    if (wire.to === oldId) {
      // Keep the input wire only if the new gate has that port.
      if (wire.toPort < newPortCount) {
        result.push({ ...wire, to: newId });
      }
      continue;
    }
    result.push(wire);
  }
  return result;
}
