# worklog.md

Running log of all work done on GatePaint. Newest entries at the bottom. Each entry records what was done, who did it (which model), and how it was verified.

## 2026-07-30: Starting state

- Repo contains planning docs only: CLAUDE.md (project spec), DEVPLAN.md (phased build plan), TODO.md (granular checklist). No code exists.
- Orchestration plan approved: build v1 by delegating DEVPLAN phases to subagents, choosing Opus for the complex/critical tasks and Sonnet for the well-specified ones. Fable orchestrates, verifies each phase's done criteria, and keeps this log.

### Task assignments

| Task | Phases | Model | Status |
|---|---|---|---|
| A. Scaffold + three-panel layout | 0 | Sonnet | done |
| B. Evaluation engine + tests | 1 | Opus | done |
| C. Canvas + SVG circuit render | 2 + 3 | Sonnet | done |
| D. Drag gates + click-click wiring | 4 + 5 | Opus | done |
| E. Delete + full-loop verify | 6 | Sonnet | done |

## Log

### 2026-07-30: Task A complete (Phase 0, Sonnet)

- Scaffolded Vite + React (JS) app in repo root. Rewrote App.jsx with the three-panel layout: Palette + Inputs left column, Workspace over Canvas on the right, all labeled placeholders. CSS grid layout in App.css, minimal resets in index.css.
- Removed Vite demo boilerplate, renamed package to gatepaint.
- Verified: npm install clean, npm run build succeeded. Phase 0 items checked off in TODO.md.

### 2026-07-30: Task B complete (Phase 1, Opus)

- Built the pure evaluation engine: src/engine/bits.js (GRID_BITS = 4, bitsOf, labels all derived from the constant) and src/engine/evaluate.js (memoized topological walk, all five gates, cycle guard returning off, unwired/missing inputs safe).
- Added Vitest with 29 tests across bits.test.js and evaluate.test.js, including full 256-pixel sweeps for NOT x1 stripes and the XOR checkerboard, all gate truth tables, cycle and degenerate-input cases.
- Verified: npm run test passes 29/29 (re-run by orchestrator). Phase 1 items checked off in TODO.md.

### 2026-07-30: Task C complete (Phases 2 + 3, Sonnet)

- OutputCanvas renders a GRID_SIZE-derived 16x16 pixel grid, evaluating each pixel through the engine. Workspace renders the circuit as SVG: GateNode boxes with pins, Wire bezier paths, input sources on the left edge, OUTPUT on the right. Pin geometry helpers centralized in src/lib/geometry.js for later phases.
- Three hardcoded presets in src/circuits.js (NOT x1, NOT x3, x0 XOR y0); default is the checkerboard.
- Verified: agent confirmed all three patterns via an ASCII-render script against the real engine; orchestrator visually confirmed the checkerboard and SVG circuit in the running dev server. Tests still 29/29, build clean. Phase 2 and 3 items checked off in TODO.md.

### 2026-07-30: Task D complete (Phases 4 + 5, Opus)

- Palette component with the five gate types; pointer-event drag creates gates at the drop point (screen to viewBox via getScreenCTM), and existing nodes drag to move with wires following. Click vs drag separated structurally: node body starts drags, pins take clicks.
- Click-click wiring: output pin arms connecting mode with highlight and dashed preview line, input pin completes the wire, Escape or empty-click cancels. Input pins replace on reconnect, outputs fan out, self-wiring rejected. Sandbox now starts empty (EMPTY_CIRCUIT default; presets kept).
- Verified in the live browser by the agent: hand-built NOT x1 (two-wide stripes), replace-on-reconnect switched to NOT x2 (four-wide stripes), wires follow node drags, Escape/empty-click cancel, and hand-built checkerboard from the blank sandbox. Tests 29/29, build clean. Phase 4 and 5 items checked off in TODO.md.

### 2026-07-30: Task E complete (Phase 6, Sonnet)

- Selection + delete: click a gate to select (highlight), Delete/Backspace removes it and all touching wires. Wires get a fat invisible hit-path so they are clickable, select the same way, and delete. Clicking an occupied input pin outside connecting mode detaches its wire. INPUT and OUTPUT nodes are not deletable. One selection at a time; Escape cancels connecting first, then clears selection; empty-click deselects.
- Verified in the live browser by the agent: full loop of add, wire (stripes), delete wire (canvas reacts), rewire, delete gate (wires vanish), INPUT/OUTPUT protected.

### 2026-07-30: v1 complete

- All DEVPLAN phases 0 through 6 done. TODO.md shows all 41 v1 items checked; only the parking lot remains unchecked, as intended.
- Final orchestrator verification: npm run test 29/29, app loads as a blank sandbox (8 inputs, OUTPUT node, five-gate palette, empty canvas) in the dev server.
- Division of labor: Sonnet built phases 0, 2, 3, 6; Opus built the engine (1) and the interaction layer (4, 5); Fable orchestrated, verified, and wrote only this log plus .claude/launch.json.

## Post-v1 UI changes

### 2026-07-30: Layout rework (Opus)

- Canvas and Workspace swapped: Canvas now on top of the right column, Workspace below.
- Canvas enlarged to a 440px strict square with 1px gridlines between cells.
- Inputs x0..y3 became draggable palette items (generated from the engine's labels, follows GRID_BITS); the workspace starts with only the OUTPUT node, and input nodes are now selectable and deletable like gates. Separate Inputs panel removed; Palette takes the full left column with Gates and Inputs sections, items top-left aligned.
- D key deletes the selection, alongside Delete and Backspace. Palette drops outside the workspace cancel cleanly.
- Verified: 29/29 tests, clean build, read-only DOM geometry check plus screenshot at 1440x900.

### 2026-07-30: Axis labels + retro styling (Sonnet)

- Canvas gained x (top) and y (left) axis number labels 0..15, derived from GRID_SIZE, with axis letters in the corner; the pixel grid stays a strict square.
- App typography switched to VT323 (classic CRT terminal font), bundled locally via @fontsource/vt323; sizes bumped for legibility.
- Added an LED-style bit readout strip above the canvas using the DSEG7 segment font (dseg npm package, bundled locally): hovering a pixel shows its 8 input bits as x3..x0 y3..y0 (e.g. 10001000) with an x=/y= hint, green glow on active digits, dim ghost segments otherwise.
- Verified: 29/29 tests, clean build, fonts emitted as local assets (no CDN), single-screenshot visual check by agent and orchestrator.

### 2026-07-30: Bigger everything + workspace fill (Sonnet)

- Type scale raised roughly 25-40 percent across the app (base 26px); palette items got bigger padding; gate/input/output node boxes scaled up about 30 percent in geometry.js and pin radius went 6 to 9, wire hit stroke 14 to 18.
- Workspace SVG now fills its entire panel (width/height 100 percent with preserveAspectRatio none); pointer math still exact since getScreenCTM carries the non-uniform scale. OUTPUT hugs the right edge.
- LED readout promoted to the star of the canvas panel: digits about 2.5x bigger (66px font), recolored from green to warm amber tied to the accent color, ghost segments and hint kept.
- Verified: 29/29 tests, clean build, one screenshot at 1440x900, no overflow.

### 2026-07-30: How-it-works blurb (Sonnet)

- Short action-urging description added at the top of the Palette panel: "Every pixel asks your circuit one question: am I on? It answers using that pixel's own coordinate bits. Drag in an input and a gate. Click pins to wire them to OUTPUT. Watch the canvas paint."
- Styled as a dim caption in the retro font, above the drag hint. Verified: 29/29 tests, clean build, placement confirmed via accessibility-tree read at 1440x900.

### 2026-07-30: Theme coherence + canvas sidebar (Opus)

- Fixed workspace stretching: viewBox now tracks the panel's pixel size via ResizeObserver (1:1 scale, no distortion), with a shared clampNode helper and OUTPUT re-pinned to the right edge on resize.
- One coherent warm-terminal theme: single dark palette in index.css (surfaces, hairlines, one amber accent), 1px borders, 2px corners, panel title strips, gate boxes and palette chips share a recipe, INPUT recessed, OUTPUT accent-lit, stud/socket pins, accent selection everywhere.
- Canvas panel is now two columns: gridded canvas left, sidebar right holding the LED readout (digits now labeled x3..x0 y3..y0, derived from engine labels) and the how-to-play text, moved out of the Palette. Copy explains the binary readout and urges action.
- Verified: 29/29 tests, clean build, orchestrator screenshot confirms undistorted nodes, themed panels, labeled readout, sidebar copy.
- Follow-up: painted (on) pixels recolored from off-white to theme amber #e8a15c (one-line var change by Fable).

### 2026-07-30: Schematic gate symbols + sidebar spacing (Opus)

- Gates now render as classic IEEE/ANSI distinctive shapes drawn as SVG paths: AND (D shape), NAND (D + bubble), OR (shield with concave left edge), XOR (OR + detached tail curve), NOT (triangle + bubble). INPUT is a pill tag, OUTPUT a squared tag. Theme styling carried over; selection highlights the path stroke.
- Pin math updated in geometry.js: output pins land on each shape's right tip (bubble included), OR/XOR input pins sit on the concave curve via a closed-form Bezier offset. Flat-edged shapes unchanged.
- Canvas panel column gap widened (44px) so the readout/help sidebar breathes.
- Verified: 29/29 tests, clean build, one screenshot of a temporary one-of-each showcase circuit (restored to blank default after).
- Follow-up: the how-to-play block became its own "Instructions" panel in the sidebar, reusing the shared panel/title-strip classes so it matches the other panels. Verified with tests, build, and one screenshot.

### 2026-07-31: Palette schematic icons (Sonnet)

- Symbol path generation extracted to src/lib/symbols.js, shared by GateNode and Palette.
- Palette gate items now show miniature schematic icons (24px) beside their labels; input items render as the pill tag itself with the label inside, matching workspace nodes. Same theme classes as the workspace shapes.
- Verified: 29/29 tests, clean build, one screenshot at 1440x900, no overflow.

### 2026-07-31: v0.1 tagged

- Git repository initialized; full project committed as v0.1, the first working prototype.

### 2026-07-31: Top bar with New / Save / Load / Export (Sonnet)

- Slim top bar above the panels: GATEPAINT title left, actions right. New resets to the blank circuit (confirm if non-empty), Save downloads the circuit JSON, Load opens and validates a circuit file (types, wire references, ports), Export renders the painting via the engine into a 512x512 PNG download. No backend, no localStorage.
- Keydown delete shortcuts ignore button/input targets so the bar cannot trigger deletions.
- Verified: 29/29 tests, clean build, JSON round-trip script showed 0 pixel mismatches on the checkerboard and rejected five malformed inputs; DOM/accessibility check at 1440x900 confirmed layout with no overflow.
- Follow-up: the four actions moved into a single File dropdown in the top bar (outside-click and Escape close it, Escape prioritizes menu-close over wiring-cancel while open; themed like the panels). Verified: 29/29 tests, clean build, accessibility-tree check.
- Follow-up: restyled the File control as a classic desktop menubar. File is now a flat text menu label (no button chrome) that inverts to amber when open/hovered; the menu is a squared bordered panel flush under the label with full-width inverted-bar item selection and a separator above Export. Handlers unchanged. Verified: 29/29 tests, clean build, screenshot confirms the menubar look.

### 2026-07-31: Box select + context menu with clipboard (Opus)

- Generalized selection from single to multi: selectedNodeIds (Set, never OUTPUT) plus selectedWireId. Marquee box select on empty-background drag draws a semi-transparent amber rect and selects every intersecting selectable node; a plain click still clears selection. Dragging any selected node moves the whole set together; Delete/Backspace/D removes all selected nodes and touching wires.
- Right-click context menu (native menu suppressed) with Copy, Cut, Paste, Delete, styled like the File menu. Copy/Cut/Delete greyed unless something is selected; Paste greyed unless the in-memory clipboard has content. Copy grabs selected nodes plus internal wires; Cut copies then deletes; Paste mints fresh ids, remaps internal wires, offsets/centers at the cursor, and selects the new nodes. Ctrl/Cmd+C/X/V shortcuts too. Escape priority: context menu, then File menu, then connecting, then selection.
- Pure helpers extracted and tested: getNodeBox/rectsOverlap/getNodesBounds in geometry.js, buildClipboard/remapClipboard in lib/clipboard.js with 6 new unit tests.
- Verified: 35/35 tests (29 + 6 new), clean build, screenshot confirms the app renders with no overflow. Interaction logic verified by code review per the no-click-spam constraint.

### 2026-07-30: Post-v1 UI rework (Opus)

- Canvas and Workspace swapped: canvas now on top of the right column, a 440px square with 1px gridlines outlining every cell.
- Inputs x0..y3 moved into the Palette as draggable items (generated from X_LABELS/Y_LABELS so they follow GRID_BITS); dragging one in spawns an INPUT node, duplicates allowed. Workspace now starts with only the OUTPUT node. Input nodes are draggable, selectable, and deletable; OUTPUT stays fixed.
- Separate Inputs panel removed; Palette takes the full left column with top-left aligned Gates and Inputs sections.
- The letter D now deletes the selection, alongside Delete and Backspace. Palette drops outside the workspace cancel cleanly.
- Verified: 29/29 tests, clean build, engine script confirmed blank/stripes/checkerboard patterns and duplicate-label inputs, layout confirmed in the browser. Note: the implementing agent run was interrupted mid-verification but its edits had landed; a follow-up agent audited every change against the code before sign-off.
