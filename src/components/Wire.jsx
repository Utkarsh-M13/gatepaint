import { getOutputPinPos, getInputPinPos } from '../lib/geometry.js';

// Draws a path from the source node's output pin to the target node's
// input pin (toPort picks which one). A smooth horizontal bezier reads
// clearly even when wires cross.
//
// The visible path is 1.5px wide, too thin to click reliably, so a second,
// invisible path with a fat stroke sits underneath and takes the pointer
// events instead. Clicking either selects the wire.
function Wire({ wire, nodesById, isSelected, onSelect }) {
  const fromNode = nodesById.get(wire.from);
  const toNode = nodesById.get(wire.to);
  if (!fromNode || !toNode) return null;

  const start = getOutputPinPos(fromNode);
  const end = getInputPinPos(toNode, wire.toPort === 1 ? 1 : 0);
  const dx = Math.max(Math.abs(end.x - start.x) / 2, 24);
  const c1x = start.x + dx;
  const c2x = end.x - dx;

  const d = `M ${start.x} ${start.y} C ${c1x} ${start.y}, ${c2x} ${end.y}, ${end.x} ${end.y}`;

  return (
    <g
      className="wire-group"
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onSelect(wire.id);
      }}
    >
      <path d={d} className="wire-hit" />
      <path d={d} className={isSelected ? 'wire wire-selected' : 'wire'} />
    </g>
  );
}

export default Wire;
