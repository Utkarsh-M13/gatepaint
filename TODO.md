# TODO.md

Granular checklist. Work top to bottom. Check items off as you go. Phases map to DEVPLAN.md.

## Phase 0: Setup
- [x] Scaffold Vite + React app
- [x] Create `App` with three-panel layout (palette+inputs left, workspace center, canvas visible)
- [x] Basic CSS for panel sizing and borders
- [x] Confirm `npm run dev` runs

## Phase 1: Engine (pure, no UI)
- [x] `engine/bits.js` with `GRID_BITS = 4` and `bitsOf(x, y)` returning x0..x3, y0..y3
- [x] `engine/evaluate.js` with `evaluate(nodes, wires, bits)`
- [x] Gate logic: AND, OR, NOT, XOR, NAND
- [x] Topological evaluation from inputs to output
- [x] Cycle guard (no infinite loop; cycle -> output off)
- [x] Test: `NOT x1` on when x1 == 0
- [x] Test: `x0 XOR y0` matches checkerboard
- [x] Test: two-gate chain evaluates in order

## Phase 2: Canvas from hardcoded circuit
- [x] `OutputCanvas` renders 16x16 CSS grid
- [x] Per pixel: call `evaluate` with `bitsOf(x, y)`, paint on/off
- [x] Hardcode `NOT x1` circuit, verify two-wide stripes
- [x] Swap to `NOT x3`, verify left half solid
- [x] Swap to `x0 XOR y0`, verify checkerboard

## Phase 3: Render circuit as SVG
- [x] `Workspace` SVG surface
- [x] Source nodes x0..x3, y0..y3 on left edge
- [x] Output node on right
- [x] `GateNode`: box, label, input pins left, output pin right
- [x] `Wire`: path from source pin to target pin
- [x] Render hardcoded nodes/wires, matches canvas

## Phase 4: Drag gates in
- [x] `Palette` lists AND, OR, NOT, XOR, NAND
- [x] Drag palette item onto workspace creates new gate node at drop point
- [x] Drag existing gate node to move it (wires follow)

## Phase 5: Click-click wiring
- [x] Click output pin enters connecting mode (highlight source)
- [x] Click input pin creates wire { from, to, toPort }
- [x] Click empty / Escape cancels connecting mode
- [x] Input pin holds one wire (replace on reconnect)
- [x] Output pin fans out to many
- [x] Canvas re-renders live on wire change
- [x] Build `NOT x1` by hand, stripes appear
- [x] Build checkerboard by hand

## Phase 6: Delete
- [x] Select and delete a gate (removes touching wires)
- [x] Delete a wire
- [x] Full loop works: add, move, wire, rewire, delete, live canvas

## Definition of done (v1)
- [x] Can build any circuit from raw bits + gates via drag and click-click
- [x] Canvas updates live
- [x] No colors, no comparators, no levels (all deferred)
- [x] Grid size controlled by one constant

## Parking lot (later, do not start)
- [ ] Drag-to-connect wiring
- [ ] Comparator blocks (x<n, x=y, x=n)
- [ ] Colors / multiplexers / RGB
- [ ] Puzzle mode: target image + gate budget + win check
- [ ] Levels and level editor
- [ ] Save/load and share-by-URL
- [ ] Grid size toggle in UI

## Requested (user wishlist, 2026-07-31)
- [x] Save and Export, plus a New (clear/reset) action
- [x] Copy and paste for gates/subcircuits
- [x] Multi-select and delete (box select; single select+delete already exists)
- [ ] Recent paintings gallery showing what other people have drawn (needs a backend or shared store; local Featured + Saved shipped, "New" tab is a placeholder)

## Comparator and input follow-ups (requested 2026-07-31)
- [ ] Comparator up/down stepper should roll over (15 -> 0 and 0 -> 15) instead of clamping at the bounds
- [ ] Comparator binary digits should sit next to the input pins, each digit aligned with its matching bit input
- [ ] Always place all 8 input nodes (x0..x3, y0..y3) in the workspace at start, instead of starting empty
