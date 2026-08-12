import { useEffect, useState } from 'react';
import { GRID_SIZE, INPUT_LABELS } from '../engine/bits.js';
import { describePixel, X_READOUT, Y_READOUT } from '../lib/numberExplainer.js';

const AXIS_INDEXES = Array.from({ length: GRID_SIZE }, (_, i) => i);
// Start on the center pixel so the modal is never blank on open.
const CENTER = Math.floor(GRID_SIZE / 2);

// One bit chip: lit amber at 1, dim at 0, labeled underneath with the input
// name so it lines up with the workspace wires that read the same bit.
function BitChip({ label, value }) {
  return (
    <span className={value ? 'explainer-chip explainer-chip-on' : 'explainer-chip'}>
      <span className="explainer-chip-value">{value}</span>
      <span className="explainer-chip-label">{label}</span>
    </span>
  );
}

// "How the number works": an interactive explainer built on the real engine.
// A small GRID_SIZE x GRID_SIZE grid lets the player pick any pixel; the
// readout below shows its coordinate, its x/y binary, the eight input bits
// bitsOf(x, y) produces, and a short reading of what the high bits mean
// spatially. This is the same idea the always-on LED readout teaches, just
// slowed down and explained.
function NumberExplainer({ onClose }) {
  const [selected, setSelected] = useState({ x: CENTER, y: CENTER });

  // Escape closes the explainer. Captured so it wins over the app-wide
  // handler (file menu, wiring, selection), the same trick LevelSelector and
  // the gallery modal use: a capture-phase listener on window runs before
  // App's own bubble-phase Escape effect.
  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose]);

  const info = describePixel(selected.x, selected.y);

  return (
    <div className="gallery-modal-backdrop" onClick={onClose}>
      <div
        className="gallery-modal number-explainer"
        role="dialog"
        aria-label="How the number works"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="gallery-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
        <div className="gallery-modal-name">How the number works</div>
        <div className="number-explainer-body">
          <div
            className="number-explainer-grid"
            style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}
          >
            {AXIS_INDEXES.map((y) =>
              AXIS_INDEXES.map((x) => {
                const isSelected = x === selected.x && y === selected.y;
                return (
                  <button
                    type="button"
                    key={`${x}-${y}`}
                    className={
                      isSelected
                        ? 'number-explainer-cell is-selected'
                        : 'number-explainer-cell'
                    }
                    aria-label={`column ${x}, row ${y}`}
                    onMouseEnter={() => setSelected({ x, y })}
                    onClick={() => setSelected({ x, y })}
                  />
                );
              })
            )}
          </div>

          <div className="number-explainer-readout">
            <p className="number-explainer-coord">{info.columnRow}</p>
            <p className="number-explainer-binary">
              x = {info.xBinary}&emsp;y = {info.yBinary}
            </p>
            <div className="number-explainer-chips">
              <span className="number-explainer-chip-group">
                {X_READOUT.map((label) => (
                  <BitChip key={label} label={label} value={info.bits[label]} />
                ))}
              </span>
              <span className="number-explainer-chip-gap" aria-hidden="true" />
              <span className="number-explainer-chip-group">
                {Y_READOUT.map((label) => (
                  <BitChip key={label} label={label} value={info.bits[label]} />
                ))}
              </span>
            </div>
            <div className="number-explainer-reading">
              {info.lines.map((line) => (
                <p key={line}>{line}</p>
              ))}
              <p>
                These bits ({INPUT_LABELS.join(', ')}) are exactly the inputs your circuit
                reads.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default NumberExplainer;
