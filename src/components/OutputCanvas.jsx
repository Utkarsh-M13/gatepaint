import { useState } from 'react';
import { GRID_SIZE, X_LABELS, Y_LABELS, bitsOf } from '../engine/bits.js';
import { evaluate } from '../engine/evaluate.js';

const AXIS_INDEXES = Array.from({ length: GRID_SIZE }, (_, i) => i);

// High bit to low bit, x then y, e.g. x3 x2 x1 x0 y3 y2 y1 y0 for the
// default 4-bit grid. Derived from the label lists so it still makes sense
// if GRID_BITS changes.
const X_READOUT = [...X_LABELS].reverse();
const Y_READOUT = [...Y_LABELS].reverse();

// One 7-segment digit: a dim "ghost" 8 behind the real 0/1, DSEG7 style.
// The ghost is always drawn so the ungrouped segments read as switched off
// rather than simply missing. Under it sits the name of the input bit that
// digit shows, so the number and the wires in the workspace line up.
function LedDigit({ value, label }) {
  return (
    <span className="led-cell">
      <span className="led-digit">
        <span className="led-ghost" aria-hidden="true">8</span>
        <span className="led-value">{value}</span>
      </span>
      <span className="led-label">{label}</span>
    </span>
  );
}

// How to play. Deliberately short: three beats, act / read / experiment.
// Wears the same panel treatment as the app's other panels so it reads as
// its own instrument on the sidebar rather than loose caption text.
function HowToPlay() {
  return (
    <section className="panel howto-panel">
      <h3 className="panel-title">Instructions</h3>
      <div className="panel-body howto">
        <p>
          Drag in an input and a gate. Click an output pin, then an input pin,
          to wire them. Feed <b>OUTPUT</b> and the canvas paints itself.
        </p>
        <p>
          Hover a pixel. The readout writes its position in binary. The left
          digits are <b>{X_READOUT.join(' ')}</b>, the column 0 to {GRID_SIZE - 1}.
          The right digits are <b>{Y_READOUT.join(' ')}</b>, the row.
        </p>
        <p>Those eight bits are the inputs. Rewire them, repaint the picture.</p>
      </div>
    </section>
  );
}

// The bit readout strip. Shows the hovered pixel's 8 input bits as a
// segment-display number, plus a plain-text coordinate hint. Dim and blank
// when nothing is hovered, this is what teaches the core idea: a pixel IS
// its bit pattern.
function ReadoutStrip({ hovered }) {
  const active = Boolean(hovered);
  const bits = active ? bitsOf(hovered.x, hovered.y) : null;
  const hint = active ? `x = ${hovered.x}   y = ${hovered.y}` : 'hover a pixel';

  return (
    <div className={active ? 'readout-strip readout-active' : 'readout-strip'}>
      <div className="readout-digits">
        <span className="readout-group">
          {X_READOUT.map((label) => (
            <LedDigit key={label} label={label} value={active ? bits[label] : 0} />
          ))}
        </span>
        <span className="readout-gap" aria-hidden="true" />
        <span className="readout-group">
          {Y_READOUT.map((label) => (
            <LedDigit key={label} label={label} value={active ? bits[label] : 0} />
          ))}
        </span>
      </div>
      <div className="readout-hint">{hint}</div>
    </div>
  );
}

// 16x16 (GRID_SIZE x GRID_SIZE) CSS grid of divs, with axis numbers along
// the top and left edges. Each pixel is evaluated independently from the
// circuit in nodes/wires. Row 0 is drawn at the top, so y runs top to
// bottom, x runs left to right, matching bitsOf(x, y).
function OutputCanvas({ nodes, wires }) {
  const [hovered, setHovered] = useState(null);

  const pixels = [];
  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const on = evaluate(nodes, wires, bitsOf(x, y));
      pixels.push(
        <div
          key={`${x}-${y}`}
          className={on ? 'pixel pixel-on' : 'pixel pixel-off'}
          onMouseEnter={() => setHovered({ x, y })}
        />
      );
    }
  }

  return (
    <div className="canvas-block">
      <div className="canvas-grid-wrap">
        <div className="axis-corner">
          <span className="axis-title axis-title-x">x</span>
          <span className="axis-title axis-title-y">y</span>
        </div>
        <div
          className="axis-x"
          style={{ gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)` }}
        >
          {AXIS_INDEXES.map((i) => (
            <span key={`x-${i}`} className="axis-number">
              {i}
            </span>
          ))}
        </div>
        <div
          className="axis-y"
          style={{ gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)` }}
        >
          {AXIS_INDEXES.map((i) => (
            <span key={`y-${i}`} className="axis-number">
              {i}
            </span>
          ))}
        </div>
        <div
          className="output-canvas"
          onMouseLeave={() => setHovered(null)}
          style={{
            gridTemplateColumns: `repeat(${GRID_SIZE}, 1fr)`,
            gridTemplateRows: `repeat(${GRID_SIZE}, 1fr)`,
          }}
        >
          {pixels}
        </div>
      </div>
      <aside className="canvas-side">
        <ReadoutStrip hovered={hovered} />
        <HowToPlay />
      </aside>
    </div>
  );
}

export default OutputCanvas;
