import { useMemo } from 'react';
import { GRID_SIZE } from '../engine/bits.js';
import { renderCircuitPixels } from '../lib/renderCircuit.js';

// A tiny rendered preview of a circuit's painting: a GRID_SIZE x GRID_SIZE
// grid of cells, on cells painted with --paint and off cells the dark --bg,
// exactly the colors OutputCanvas uses. Reusable at any pixel size. The 256
// evaluations are memoized on the circuit reference so a re-render is free.
function CircuitThumbnail({ circuit, size = 88 }) {
  const pixels = useMemo(() => renderCircuitPixels(circuit), [circuit]);

  return (
    <div
      className="circuit-thumb"
      style={{
        width: size,
        height: size,
        gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
        gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
      }}
    >
      {pixels.map((on, i) => (
        <span
          // The grid is a fixed row-major sweep, so the index is a stable key.
          key={i}
          className={on ? 'thumb-px thumb-on' : 'thumb-px thumb-off'}
        />
      ))}
    </div>
  );
}

export default CircuitThumbnail;
