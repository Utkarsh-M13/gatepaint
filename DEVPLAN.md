# DEVPLAN.md

Phased development plan. Each phase ends at a state you can actually run and look at. Do not jump ahead. Get each phase working before starting the next.

## Guiding principle

The evaluation engine is pure and separate. Build and verify it before any UI interaction. Everything visual is just a way to feed it and show its output. If the engine is right, the rest is plumbing.

---

## Phase 0: Project setup

Goal: a running empty Vite + React app.

- Scaffold with Vite (React, JS not TS for now, keep it light; TS is fine if preferred).
- One `App` component rendering three empty panels in the layout from CLAUDE.md.
- Basic CSS so the three regions are visible and sized. Canvas region visible alongside workspace.

Done when: `npm run dev` shows the three-panel shell.

---

## Phase 1: The engine (no UI interaction)

Goal: pure logic that turns a circuit + coordinate into a pixel value. This is the most important phase.

- `engine/bits.js`: `bitsOf(x, y)` returns `{ x0..x3, y0..y3 }` as 0/1. `GRID_BITS` constant (4).
- `engine/evaluate.js`: `evaluate(nodes, wires, bits) -> boolean`. Topological walk, gate logic for AND/OR/NOT/XOR/NAND, cycle-safe (no infinite loops; treat cycles as output off).
- Unit tests (or a scratch script) for evaluate:
  - `NOT x1` -> on when x1 is 0.
  - `x0 XOR y0` -> checkerboard truth values.
  - A two-gate chain evaluates in the right order.

Done when: tests pass. No UI needed yet.

---

## Phase 2: Canvas renders a hardcoded circuit

Goal: see a real image from the engine.

- `OutputCanvas`: 16x16 CSS grid. For each pixel call `evaluate` with `bitsOf(x, y)`, paint on/off.
- Hardcode a `nodes`/`wires` circuit in `App` state.
- Manually swap the hardcoded circuit and confirm:
  - `NOT x1` -> two-wide vertical stripes.
  - `NOT x3` -> left half solid.
  - `x0 XOR y0` -> checkerboard.

Done when: changing the hardcoded circuit visibly changes the canvas correctly. This validates the entire concept.

---

## Phase 3: Render nodes and wires in the workspace

Goal: the circuit in state is drawn as SVG. Still no interaction.

- `Workspace` SVG surface.
- `GateNode`: draw a box per node at its (x, y), label it, draw input pins (left) and output pin (right). Inputs x0..x3, y0..y3 shown as source nodes on the left edge. Output node on the right.
- `Wire`: draw a path from a source pin to a target pin.
- Render straight from the hardcoded `nodes`/`wires`.

Done when: the hardcoded circuit is visible as boxes and lines, and matches what the canvas paints.

---

## Phase 4: Drag gates from palette into workspace

Goal: add gates by dragging.

- `Palette`: a list of gate types (AND, OR, NOT, XOR, NAND).
- Drag a palette item onto the workspace -> creates a new gate node at the drop position with a fresh id, no wires yet.
- Dragging an existing gate node moves it (updates x/y in state); wires follow.

Done when: you can populate the workspace with gates and rearrange them, canvas unaffected until wired.

---

## Phase 5: Click-click wiring

Goal: connect pins.

- Click an output pin -> enter connecting mode from that pin (highlight it).
- Click an input pin -> create a wire { from, to, toPort }. Clear connecting mode.
- Click empty space or Escape -> cancel connecting mode.
- Input pin holds at most one wire (replace if reconnected). Output pin fans out freely.
- Canvas re-renders live as wires change.

Done when: you can build `NOT x1` by hand (wire x1 -> NOT input, NOT output -> OUTPUT) and watch stripes appear. Then build a checkerboard by hand.

---

## Phase 6: Delete

Goal: remove mistakes.

- Select a gate and delete it (removes the node and any wires touching it).
- Delete a wire (click it, or click its target pin to detach).

Done when: full sandbox loop works: add, move, wire, rewire, delete, all with live canvas.

---

## v1 complete

At the end of Phase 6 you have a working logic-gate painting sandbox. Stop here and play with it before adding anything.

---

## Later (not in v1, do not build yet)

- Drag-to-connect wiring alongside click-click.
- Comparator blocks (x<n, x=y, x=n) as higher-level primitives that compile down to gates.
- Colors: multi-bit output driving a palette, or RGB channels; multiplexers.
- Puzzle mode: target image, gate budget, win check (evaluate all 256 pixels, compare to target).
- Level progression and a level editor.
- Save/load and share (serialize nodes/wires to a URL).
- Grid size toggle (8x8 / 16x16 / 32x32) exposed in UI.
