import { X_LABELS, Y_LABELS, GRID_BITS } from '../engine/bits.js';
import { gateSymbol } from '../lib/symbols.js';
import { getNodeSize, INPUT_SIZE } from '../lib/geometry.js';

// The palette. Gates first, then the coordinate bits. Each item starts a
// pointer drag; App tracks the drag and drops a new node into the workspace
// when the pointer is released over it.
//
// The input list is derived from the engine's labels, so it follows GRID_BITS
// automatically.

const PALETTE_GATES = ['AND', 'OR', 'NOT', 'XOR', 'NAND', 'NOR', 'XNOR'];
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

// The comparator icon: a small rounded block with a '<' glyph, a row of
// constant digits, and short pin ticks on the left, one per grid bit. A
// schematic miniature of the CMP block, drawn in its own tidy viewBox rather
// than scaled from the full node so it stays legible at palette size.
function CmpIcon() {
  const w = 46;
  const h = 34;
  const pinTicks = Array.from({ length: GRID_BITS }, (_, i) => {
    const y = (h * (i + 1)) / (GRID_BITS + 1);
    return <line key={i} x1={0} y1={y} x2={6} y2={y} className="palette-cmp-pin" />;
  });
  return (
    <svg
      className="palette-icon gate-node-cmp"
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      aria-hidden="true"
    >
      {pinTicks}
      <line x1={w - 6} y1={h / 2} x2={w} y2={h / 2} className="palette-cmp-pin" />
      <rect x={6} y={2} width={w - 12} height={h - 4} rx={3} className="gate-node-box" />
      <text
        x={w / 2}
        y={h / 2 - 4}
        className="cmp-op-text"
        textAnchor="middle"
        dominantBaseline="central"
      >
        &lt;
      </text>
      <text
        x={w / 2}
        y={h / 2 + 8}
        className="palette-cmp-digits"
        textAnchor="middle"
        dominantBaseline="central"
      >
        0000
      </text>
    </svg>
  );
}

function PaletteItem({ type, label, onDragStart }) {
  const isInput = type === 'INPUT';
  const isCmp = type === 'CMP';
  return (
    <li>
      <button
        type="button"
        className={isInput ? 'palette-item palette-item-input' : 'palette-item'}
        data-tutorial={type === 'NOT' ? 'palette-not' : undefined}
        onPointerDown={(event) => {
          event.preventDefault();
          onDragStart({ type, label }, event);
        }}
      >
        {isInput ? (
          <InputIcon label={label} />
        ) : (
          <>
            {isCmp ? <CmpIcon /> : <GateIcon type={type} />}
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
      <h3 className="palette-heading">Compare</h3>
      <ul className="palette-list">
        <PaletteItem type="CMP" label="CMP" onDragStart={onPaletteDragStart} />
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
