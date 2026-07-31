import { X_LABELS, Y_LABELS } from '../engine/bits.js';
import { gateSymbol } from '../lib/symbols.js';
import { getNodeSize, INPUT_SIZE } from '../lib/geometry.js';

// The palette. Gates first, then the coordinate bits. Each item starts a
// pointer drag; App tracks the drag and drops a new node into the workspace
// when the pointer is released over it.
//
// The input list is derived from the engine's labels, so it follows GRID_BITS
// automatically.

const PALETTE_GATES = ['AND', 'OR', 'NOT', 'XOR', 'NAND'];
const PALETTE_INPUTS = [...X_LABELS, ...Y_LABELS];

// Every icon is drawn at a fixed display height, in the same coordinate
// system as the workspace shapes (the node's own box), then scaled down by
// the svg width/height attributes. That is what keeps a palette icon an
// exact miniature of the shape it drags in, not a redrawn approximation.
const ICON_HEIGHT = 24;

function iconSize(nodeSize) {
  const scale = ICON_HEIGHT / nodeSize.height;
  return { width: Math.round(nodeSize.width * scale), height: ICON_HEIGHT };
}

// A gate icon is just the symbol shape, unfilled label, same classes as the
// workspace so it picks up the same fill and hairline in the non-selected
// state. The type label sits outside the icon as normal chip text.
function GateIcon({ type }) {
  const nodeSize = getNodeSize({ type });
  const symbol = gateSymbol({ x: 0, y: 0, type });
  const { width, height } = iconSize(nodeSize);
  return (
    <svg
      className={`palette-icon gate-node-${type.toLowerCase()}`}
      width={width}
      height={height}
      viewBox={`0 0 ${nodeSize.width} ${nodeSize.height}`}
      aria-hidden="true"
    >
      {symbol.tail && <path d={symbol.tail} className="gate-node-tail" />}
      <path d={symbol.body} className="gate-node-box" />
    </svg>
  );
}

// An input icon is the pill tag shape with its label baked in, matching a
// workspace INPUT node exactly, so this icon doubles as the whole chip.
function InputIcon({ label }) {
  const { width, height } = iconSize(INPUT_SIZE);
  return (
    <svg
      className="palette-icon gate-node-input"
      width={width}
      height={height}
      viewBox={`0 0 ${INPUT_SIZE.width} ${INPUT_SIZE.height}`}
      aria-hidden="true"
    >
      <rect
        x={0}
        y={0}
        width={INPUT_SIZE.width}
        height={INPUT_SIZE.height}
        rx={INPUT_SIZE.height / 2}
        className="gate-node-box"
      />
      <text
        x={INPUT_SIZE.width / 2}
        y={INPUT_SIZE.height / 2}
        className="gate-node-label"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {label}
      </text>
    </svg>
  );
}

function PaletteItem({ type, label, onDragStart }) {
  const isInput = type === 'INPUT';
  return (
    <li>
      <button
        type="button"
        className={isInput ? 'palette-item palette-item-input' : 'palette-item'}
        onPointerDown={(event) => {
          event.preventDefault();
          onDragStart({ type, label }, event);
        }}
      >
        {isInput ? (
          <InputIcon label={label} />
        ) : (
          <>
            <GateIcon type={type} />
            <span className="palette-item-label">{label}</span>
          </>
        )}
      </button>
    </li>
  );
}

function Palette({ onPaletteDragStart }) {
  return (
    <div className="palette">
      <p className="panel-hint">Drag items into the workspace.</p>
      <h3 className="palette-heading">Gates</h3>
      <ul className="palette-list">
        {PALETTE_GATES.map((type) => (
          <PaletteItem
            key={type}
            type={type}
            label={type}
            onDragStart={onPaletteDragStart}
          />
        ))}
      </ul>
      <h3 className="palette-heading">Inputs</h3>
      <ul className="palette-list">
        {PALETTE_INPUTS.map((label) => (
          <PaletteItem
            key={label}
            type="INPUT"
            label={label}
            onDragStart={onPaletteDragStart}
          />
        ))}
      </ul>
    </div>
  );
}

export default Palette;
