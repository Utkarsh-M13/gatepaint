# CLAUDE.md

Project context for Claude Code. Read this first before doing any work in this repo.

## What this is

A browser-based sandbox game where you paint a pixel canvas using logic gates. Every pixel's (x, y) coordinate is fed into a single logic circuit the player builds, and the circuit decides whether that pixel is on or off. Build one circuit, it runs at every pixel, the canvas fills in according to your rule.

Think of it as "paint with boolean algebra." A gate like `NOT x1` paints two-wide vertical stripes across the whole canvas. `x0 XOR y0` gives a checkerboard. The fun is discovering that logic on the coordinate bits is really geometry.

This is a neal.fun-style toy first, a puzzle game later.

## The core idea, precisely

The canvas is 16x16. Each pixel has an x-coordinate (0-15) and a y-coordinate (0-15). Each coordinate is a 4-bit binary number split across separate wires:

- `x0 x1 x2 x3` spell out the column (x0 = ones bit, x3 = eights bit)
- `y0 y1 y2 y3` spell out the row

So every pixel is addressed by 8 input bits total. These 8 bits are the ONLY inputs to the circuit. The player never sets them by hand. The engine feeds each pixel its own 8 bits automatically while rendering.

The player builds a circuit from gates (AND, OR, NOT, XOR, and probably NAND) that takes those 8 bits and outputs one bit: paint this pixel or not.

Why bits matter geometrically: each bit is a meaningful spatial question. The high bit `x3` is "is x in the right half (8-15)." The low bit `x0` is "is x odd." Each bit up doubles the stripe width it controls. Combining bits with gates makes shapes.

## Current scope (v1, sandbox only)

Building the bare sandbox. Deliberately leaving OUT for now:

- No comparator blocks (x<n, x=y). Raw bits + gates only.
- No colors. Black and white, one output bit.
- No levels, no target images, no gate budget, no win check.
- No save/load.
- No drag-to-connect wiring. Click-click only (click output pin, then click input pin).

These are all planned for later. Do not build them into v1 unless asked. Keep v1 small.

## Tech stack

- React SPA, Vite, no backend, all state in memory.
- Plain `useState` / `useReducer` in one top-level component. No Redux/Zustand at this size.
- Output canvas: CSS grid of divs (256 divs, cheap).
- Gate workspace: SVG. Gates are `<g>` elements, wires are `<path>`, dragging updates x/y in state. SVG so every gate and wire is a real hit-testable element and we don't hand-roll hit detection.

## Architecture

Three panels:

```
+------------+--------------------------+
|  PALETTE   |                          |
|  (drag     |     WORKSPACE (SVG)      |
|   gates)   |   inputs -> gates -> out |
|            |                          |
|  INPUTS    +--------------------------+
|  x0..x3    |   CANVAS (16x16 output)  |
|  y0..y3    |   live-renders result    |
+------------+--------------------------+
```

The canvas must stay visible while wiring so the player sees the image change as they connect gates. That live feedback is the whole point.

### Data model

Everything is two lists plus a derived render.

```
nodes: [
  { id, type: 'INPUT'|'AND'|'OR'|'NOT'|'XOR'|'NAND'|'OUTPUT',
    label,        // 'x0', 'y3', etc. for inputs
    x, y }        // position in the SVG workspace
]

wires: [
  { id, from: nodeId, to: nodeId, toPort: 0|1 }   // toPort = which input pin
]
```

- Input nodes: no incoming wires, value set per-pixel by the engine.
- Output node: no outgoing wire, whatever feeds it is what the canvas reads.
- Everything else is a gate.

### The evaluation engine (the heart of it)

One pure function, no React, unit-testable:

```
evaluate(nodes, wires, bits) -> boolean
```

where `bits` is the 8 input values keyed by label (x0..x3, y0..y3). It does a topological walk from inputs to output, evaluating each gate once its inputs are ready, and returns the output node's value.

Rendering is then trivial:

```
for x in 0..15:
  for y in 0..15:
    on = evaluate(nodes, wires, bitsOf(x, y))
    paint pixel (x, y) = on
```

256 evaluations per change. Instant. `bitsOf(5, 2)` returns { x0:1, x1:0, x2:1, x3:0, y0:0, y1:1, y2:0, y3:0 }.

This function IS the game. The React parts just move it around and show results. Keep it pure and separate from any component.

### Component tree

```
<App>              // owns nodes, wires state
  <Palette/>       // draggable gate types
  <Workspace/>     // SVG: renders nodes + wires, drag + click-click wiring
    <GateNode/>    // one gate, draggable, has ports
    <Wire/>        // one path between ports
  <OutputCanvas/>  // 16x16 grid, calls evaluate() per pixel
  <RulesPanel/>    // empty in v1 (sandbox); target image later
```

## Wiring interaction (v1)

Click-click: click an output pin, the app enters "connecting" mode from that pin, then click an input pin to create the wire. Clicking empty space or pressing Escape cancels. An input pin can hold one wire (replace on reconnect); an output pin can fan out to many. Drag-to-connect is a later upgrade, keep the model compatible with adding it.

## Conventions

- Keep `evaluate()` and all pure logic (bit decomposition, topo sort) in a `lib/` or `engine/` folder with no React imports. Test it in isolation.
- Gates with cycles should be rejected or ignored gracefully, do not infinite-loop. A combinational circuit has no cycles; if the player somehow makes one, detect it in the topo sort and treat the output as off.
- Grid size lives in ONE constant (GRID_BITS = 4 -> 16x16). Changing it to 3 gives 8x8 and must not require touching anything else except which input pins exist.

## Build order

1. Static three-panel layout, empty.
2. `evaluate()` + `OutputCanvas` against a hardcoded circuit. Verify `NOT x1` gives two-wide stripes and `x0 XOR y0` gives a checkerboard.
3. Render nodes and wires from state in the SVG workspace.
4. Drag gates from palette into the workspace.
5. Click-click wiring.
6. Delete gates and wires.

Steps 1-2 alone give a screen that paints from a hardcoded circuit, which validates the whole idea before any drag-and-drop.

## Style notes

- No em dashes anywhere in code comments, docs, or UI copy.
- Keep it simple. This is a toy. Resist adding features not in current scope.
