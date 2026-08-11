import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { DEFAULT_CIRCUIT, EMPTY_CIRCUIT } from './circuits.js'
import { GRID_BITS, INPUT_LABELS, stepTarget } from './engine/bits.js'
import {
  getNodeSize,
  getNodeBox,
  getNodesBounds,
  getPortCount,
  getInputPinPos,
  getOutputPinPos,
  findPinAtPoint,
  findGateAtPoint,
  isGateType,
  rectsOverlap,
  zoomAboutPoint,
  getOffscreenIndicator,
  getHomePan,
  OUTPUT_HOME,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  VIEW_WIDTH,
  VIEW_HEIGHT,
} from './lib/geometry.js'
import { transferWiresForSwap } from './lib/swap.js'
import { buildClipboard, remapClipboard } from './lib/clipboard.js'
import Palette from './components/Palette.jsx'
import Workspace from './components/Workspace.jsx'
import OutputCanvas from './components/OutputCanvas.jsx'
import Gallery from './components/Gallery.jsx'
import LevelPanel from './components/LevelPanel.jsx'
import LevelSelector from './components/LevelSelector.jsx'
import TopBar from './components/TopBar.jsx'
import { LEVELS } from './levels.js'
import { targetOf, evaluateWin } from './lib/winCheck.js'
import { loadProgress, recordWin } from './lib/progressStore.js'

let idCounter = 0
function nextId(prefix) {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// The allowed comparator operators, in the order the operator control cycles.
const CMP_OP_CYCLE = { LT: 'EQ', EQ: 'GT', GT: 'LT' }

// The extra data a freshly created CMP node carries: an operator and a binary
// constant of GRID_BITS zeros. Other node types add nothing.
function newNodeData(type) {
  if (type === 'CMP') {
    return { op: 'LT', target: Array.from({ length: GRID_BITS }, () => 0) }
  }
  return {}
}

// A pointer moved less than this many screen pixels counts as a click, not a
// drag. Used to tell a marquee sweep apart from a plain click-to-deselect.
const CLICK_SLOP = 4

// How close (in workspace units) the pointer must be released to a pin for a
// drag-to-connect to land on it. A little larger than the drawn pin radius so
// the release is forgiving without grabbing a neighbor.
const PIN_HIT_RADIUS = 14

// Zoom limits and the per-step multiplier shared by the keys and the buttons.
// Zoom scales the workspace group only; the SVG viewBox stays pinned to the
// panel pixel size so getScreenCTM stays valid.
const ZOOM_MIN = 0.3
const ZOOM_MAX = 2.5
const ZOOM_STEP = 1.2

// The whole placeable world, as a { width, height } box. Nodes clamp to this
// instead of the visible view, so they can be spread anywhere on the board.
const WORLD = { width: WORLD_WIDTH, height: WORLD_HEIGHT }

// Normalized { x, y, width, height } rectangle from two corner points, so a
// marquee works when dragged in any of the four directions.
function rectFromPoints(ax, ay, bx, by) {
  return {
    x: Math.min(ax, bx),
    y: Math.min(ay, by),
    width: Math.abs(ax - bx),
    height: Math.abs(ay - by),
  }
}

// Keeps a node fully inside the given bounds (a { width, height } box). Used
// both while dragging and when a fresh circuit is dropped in. Nodes clamp to
// the world, not the visible view, so they can be placed anywhere on the board.
function clampNode(node, bounds) {
  const size = getNodeSize(node)
  return {
    x: clamp(node.x, 0, Math.max(bounds.width - size.width, 0)),
    y: clamp(node.y, 0, Math.max(bounds.height - size.height, 0)),
  }
}

// Clamps every node into the world and re-pins OUTPUT to its fixed home
// coordinate. Shared by the resize pass and by New/Load, which drop in a fresh
// set of nodes that also needs OUTPUT anchored. OUTPUT is the one fixture on
// the board, so it always returns to the same stable world spot.
function fitNodesToWorld(nodes) {
  return nodes.map((node) => {
    if (node.type === 'OUTPUT') {
      return { ...node, x: OUTPUT_HOME.x, y: OUTPUT_HOME.y }
    }
    return { ...node, ...clampNode(node, WORLD) }
  })
}

function App() {
  const [nodes, setNodes] = useState(DEFAULT_CIRCUIT.nodes)
  const [wires, setWires] = useState(DEFAULT_CIRCUIT.wires)

  // Whether the top bar's File dropdown is open. Lifted up from TopBar so
  // Escape can be told to close the menu first, before it touches wiring or
  // selection.
  const [fileMenuOpen, setFileMenuOpen] = useState(false)

  // Which page is showing. 'sandbox' is the default and looks exactly as it
  // did before Levels existed; 'levels' swaps the Gallery for the Level panel
  // and adds the win check. The nodes/wires state is shared across both pages,
  // so switching never wipes the circuit (use File > New to clear).
  const [page, setPage] = useState('sandbox')
  // The active campaign level, by index, and whether the level-selector popup
  // is open. Persisted badge progress is loaded once from localStorage.
  const [levelIndex, setLevelIndex] = useState(0)
  const [levelSelectorOpen, setLevelSelectorOpen] = useState(false)
  const [progress, setProgress] = useState(() => loadProgress())

  // The active level, its goal painting (derived once from the solution), and
  // the live result of the current workspace circuit against that goal. The
  // target only recomputes when the level changes; the live check recomputes
  // when the circuit or the target changes.
  const activeLevel = LEVELS[levelIndex] || LEVELS[0]
  const target = useMemo(() => targetOf(activeLevel), [activeLevel])
  const live = useMemo(
    () => evaluateWin({ nodes, wires }, target),
    [nodes, wires, target]
  )

  // Persist a win the moment it is detected on the Levels page. A badge stays
  // earned once set, so this only writes when the live result adds a badge the
  // store does not already hold, which also stops it from looping.
  useEffect(() => {
    if (page !== 'levels' || !live.solved) return
    const prev = progress[activeLevel.id] || { star: false, gated: false }
    const gainsStar = live.solved && !prev.star
    const gainsGated = live.gated && !prev.gated
    if (gainsStar || gainsGated) {
      setProgress(recordWin(activeLevel.id, { star: live.solved, gated: live.gated }))
    }
  }, [page, live, activeLevel, progress])

  // Picks a level from the selector: switch to the Levels page, make it active,
  // and close the popup. The workspace circuit is left untouched.
  function handlePickLevel(index) {
    setLevelIndex(index)
    setPage('levels')
    setLevelSelectorOpen(false)
  }

  // Badge state to display: earned-ever (persisted) OR currently satisfied, so
  // a fresh solve lights the badge on the same frame, before the store write
  // lands on the next tick.
  const persistedEarned = progress[activeLevel.id] || { star: false, gated: false }
  const earnedDisplay = {
    star: persistedEarned.star || live.solved,
    gated: persistedEarned.gated || live.gated,
  }

  // Wiring: the node id whose output pin is armed, or null.
  const [connectFrom, setConnectFrom] = useState(null)
  // Cursor position in workspace coordinates, for the preview line.
  const [previewPoint, setPreviewPoint] = useState(null)

  // Drag-to-connect. On pointerdown on a pin we record a potential wire drag;
  // it only becomes a real drag once the pointer moves past CLICK_SLOP, so a
  // press-and-release in place still falls through to the click-click flow.
  // Holds { kind: 'output'|'input', nodeId, port, startX, startY (the pin, in
  // workspace units), startClientX, startClientY }, or null.
  const [wireDrag, setWireDrag] = useState(null)
  // True once the current pin drag has passed the click threshold, which is
  // what turns the press into a one-gesture drag-connect and shows the preview.
  const [wireDragMoved, setWireDragMoved] = useState(false)
  // Mirrors wireDragMoved for the window handlers, which run outside React's
  // closure and need the live value to tell the first threshold crossing apart.
  const wireMovedRef = useRef(false)
  // Set on a completed drag so the trailing click on the source pin is ignored
  // (a moved drag must not also fire the click-click arm/complete). Cleared at
  // the start of the next pin press so it never leaks across gestures.
  const suppressPinClickRef = useRef(false)

  // Selection is now a set of node ids plus, separately, at most one wire.
  // Nodes and wires are still mutually exclusive: selecting either clears the
  // other. OUTPUT is never put in the node set. Using a Set keeps membership
  // tests cheap while every selected node shows the same amber highlight.
  const [selectedNodeIds, setSelectedNodeIds] = useState(() => new Set())
  const [selectedWireId, setSelectedWireId] = useState(null)

  // In-memory clipboard for copy/cut/paste. Holds deep copies of nodes and
  // their internal wires, or null when empty. Never touches the OS clipboard.
  const [clipboard, setClipboard] = useState(null)

  // Right-click context menu: its screen position (for placing the dropdown)
  // and its workspace position (where a Paste drops the group), or null.
  const [contextMenu, setContextMenu] = useState(null)
  const contextMenuRef = useRef(null)

  // Active drag. Either a gate being dragged out of the palette, or one or
  // more existing nodes being moved together. Null when nothing is dragging.
  const [drag, setDrag] = useState(null)
  // Cursor position in screen coordinates, for the palette drag ghost.
  const [ghost, setGhost] = useState(null)

  // Marquee (box) select. `marquee` holds the stable start of the sweep so the
  // move/up effect below has one identity to key on; `marqueeCur` carries the
  // live corner (and whether it has passed the click threshold) and updates on
  // every pointer move so the rubber-band rectangle can follow the cursor.
  const [marquee, setMarquee] = useState(null)
  const [marqueeCur, setMarqueeCur] = useState(null)

  // The workspace viewBox size, measured from the SVG element itself so that
  // one user unit is exactly one CSS pixel. That keeps the drawing at a 1:1
  // aspect (nothing is stretched) while still filling the whole panel. The
  // constants from geometry.js are only the pre-measurement fallback.
  const [view, setView] = useState({ width: VIEW_WIDTH, height: VIEW_HEIGHT })

  // Zoom scale and pan offset applied to the workspace group. At zoom=1,
  // pan=0 the group transform is the identity, so everything reduces to the
  // pre-zoom behavior exactly. Refs mirror the latest values so the pointer
  // handlers (which run after render, outside React's closure) can read them.
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const zoomRef = useRef(1)
  const panRef = useRef({ x: 0, y: 0 })
  const viewRef = useRef(view)
  useEffect(() => {
    viewRef.current = view
  }, [view])

  // Latest nodes, for pointer handlers (pin-drop hit-testing, palette-drop swap
  // detection) that run from window listeners and would otherwise close over a
  // stale array. Reading a ref avoids adding `nodes` to those effects' deps,
  // which would re-subscribe the listeners on every node move.
  const nodesRef = useRef(nodes)
  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])

  // While Space is held the workspace enters panning mode: the cursor shows a
  // grab hand and a left-drag moves the view instead of starting a marquee.
  // The ref mirrors it so the pointer handlers (which run outside React's
  // closure) can read the latest value; the state only drives the cursor.
  const [spaceHeld, setSpaceHeld] = useState(false)
  const spaceHeldRef = useRef(false)

  // Measured size of the off-screen OUTPUT chip, so its full bounding box can
  // be clamped inside the panel (it is centered on its anchor point, so half of
  // it would otherwise spill past whichever edge it pins to). The content is
  // fixed, so this settles to a constant after the first measured frame.
  const indicatorRef = useRef(null)
  const [indicatorSize, setIndicatorSize] = useState({ width: 0, height: 0 })

  const svgRef = useRef(null)

  // Set once the first real panel measurement lands, so the HOME framing is
  // applied exactly once (not on every later resize, which would fight the
  // user's own panning).
  const didInitialFrameRef = useRef(false)

  // Writes a new pan to both the ref (read synchronously by pointer/wheel
  // handlers) and the state (drives the render), keeping them in lockstep the
  // same way stepZoom does. Pan is left unbounded so the user can move freely.
  const setPanBoth = useCallback((next) => {
    panRef.current = next
    setPan(next)
  }, [])

  // Zoom about an arbitrary SVG-viewport point (cx, cy), keeping the workspace
  // point under it fixed. All the math is in the pure zoomAboutPoint helper; a
  // workspace point w maps to viewport s by s = pan + zoom*w. Refs are updated
  // synchronously so a handler firing before the next render converts with the
  // new zoom/pan. Used by the buttons/keys (about center) and ctrl+wheel (about
  // the cursor).
  const zoomAbout = useCallback((factor, cx, cy) => {
    const z0 = zoomRef.current
    const result = zoomAboutPoint(z0, panRef.current, factor, cx, cy, ZOOM_MIN, ZOOM_MAX)
    if (result.zoom === z0) return
    zoomRef.current = result.zoom
    panRef.current = result.pan
    setZoom(result.zoom)
    setPan(result.pan)
  }, [])

  // Steps the zoom by a factor about the center of the visible workspace.
  const stepZoom = useCallback((factor) => {
    const v = viewRef.current
    zoomAbout(factor, v.width / 2, v.height / 2)
  }, [zoomAbout])

  // The 100% control resets zoom to 1 AND pans back to the HOME framing, so
  // OUTPUT and the working area around it are centered again, rather than the
  // far corner of the world.
  const resetZoom = useCallback(() => {
    const home = getHomePan(viewRef.current, 1)
    zoomRef.current = 1
    panRef.current = home
    setZoom(1)
    setPan(home)
  }, [])

  // Measure on mount and on every panel resize. setView keeps the previous
  // object when the size is unchanged so the reposition effect below does
  // not run on every observer callback.
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return undefined
    function measure() {
      const rect = svg.getBoundingClientRect()
      const width = Math.max(Math.round(rect.width), 1)
      const height = Math.max(Math.round(rect.height), 1)
      setView((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height }
      )
      // On the first real measurement, frame the HOME region so the user opens
      // on OUTPUT with working room to its left, not the world's far corner.
      if (!didInitialFrameRef.current) {
        didInitialFrameRef.current = true
        const home = getHomePan({ width, height }, 1)
        panRef.current = home
        setPan(home)
      }
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  // Keep every node inside the world and OUTPUT pinned to its fixed home. The
  // world does not depend on the view size, so this really only matters on the
  // first pass, but running it on resize is harmless and keeps OUTPUT anchored.
  useEffect(() => {
    setNodes((current) => fitNodesToWorld(current))
  }, [view])

  // Screen coordinates -> workspace coordinates. Two steps: first screen to
  // SVG-viewport coordinates via the CTM inverse (the viewBox still tracks the
  // panel pixel size, so this matrix stays valid under any zoom), then undo the
  // workspace group's transform by subtracting pan and dividing by zoom. Every
  // handler (drag, drop, marquee, wiring, context menu) goes through here, so
  // they all stay consistent. At zoom=1, pan=0 this reduces to the CTM result.
  const toWorkspace = useCallback((clientX, clientY) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const local = point.matrixTransform(ctm.inverse())
    const z = zoomRef.current
    const p = panRef.current
    return { x: (local.x - p.x) / z, y: (local.y - p.y) / z }
  }, [])

  // Wheel/trackpad over the workspace pans the view; Ctrl/Cmd+wheel zooms
  // toward the cursor instead. Registered as a native non-passive listener so
  // preventDefault actually stops the page from scrolling (React's onWheel is
  // passive). Since the viewBox tracks the panel pixel size at a 1:1, zero
  // offset mapping, a screen delta equals an SVG-viewport delta, so the raw
  // delta is added straight to pan and the cursor sits at (clientX-rect.left,
  // clientY-rect.top) in the same space as pan.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return undefined
    function handleWheel(event) {
      event.preventDefault()
      if (event.ctrlKey || event.metaKey) {
        const rect = svg.getBoundingClientRect()
        const factor = Math.exp(-event.deltaY * 0.0015)
        zoomAbout(factor, event.clientX - rect.left, event.clientY - rect.top)
        return
      }
      // Shift maps vertical wheel motion to horizontal panning, the usual
      // convention for a wheel with no horizontal axis.
      const dx = event.shiftKey ? event.deltaY || event.deltaX : event.deltaX
      const dy = event.shiftKey ? 0 : event.deltaY
      const p = panRef.current
      setPanBoth({ x: p.x - dx, y: p.y - dy })
    }
    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [zoomAbout, setPanBoth])

  // Space toggles panning mode. Held down it turns the cursor into a grab hand
  // and reroutes a left-drag to panning. preventDefault stops the page from
  // scrolling on Space; the typing guard keeps it inert while a button/input is
  // focused so it can still activate that control.
  useEffect(() => {
    function isTyping(event) {
      const tag = event.target && event.target.tagName
      return tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA'
    }
    function handleDown(event) {
      if (event.code === 'Space' && !isTyping(event)) {
        event.preventDefault()
        if (!spaceHeldRef.current) {
          spaceHeldRef.current = true
          setSpaceHeld(true)
        }
      }
    }
    function handleUp(event) {
      if (event.code === 'Space') {
        spaceHeldRef.current = false
        setSpaceHeld(false)
      }
    }
    window.addEventListener('keydown', handleDown)
    window.addEventListener('keyup', handleUp)
    return () => {
      window.removeEventListener('keydown', handleDown)
      window.removeEventListener('keyup', handleUp)
    }
  }, [])

  // Begins a pan drag from a pointerdown, recording the start client position
  // and the pan at that moment; the drag effect below translates pan by the
  // raw client delta (screen px == viewport px) as the pointer moves.
  function startPan(event) {
    setDrag({
      kind: 'pan',
      startClientX: event.clientX,
      startClientY: event.clientY,
      startPan: { ...panRef.current },
    })
  }

  // True only when the pointer is inside the drawn workspace area. The
  // viewBox is measured from the element, so the element rect and the viewBox
  // cover the same rectangle, but both are still checked in case a resize is
  // mid-flight. A palette drop anywhere else, the left column or the canvas
  // included, is a no-op.
  function isOverWorkspace(clientX, clientY) {
    const svg = svgRef.current
    if (!svg) return false
    const rect = svg.getBoundingClientRect()
    const insideElement =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom
    if (!insideElement) return false
    // The drop lands in world coordinates, so accept anywhere inside the world
    // (the panned/zoomed view may be showing any part of it). Points a touch
    // outside are pulled back by clampNode, so this only rejects drops far off
    // the board.
    const point = toWorkspace(clientX, clientY)
    return (
      point.x >= 0 && point.x <= WORLD.width && point.y >= 0 && point.y <= WORLD.height
    )
  }

  // Drag is driven off window listeners so the pointer can leave the element
  // (or the SVG entirely) without the drag getting stuck.
  useEffect(() => {
    if (!drag) return undefined

    function handleMove(event) {
      if (drag.kind === 'palette') {
        setGhost({ x: event.clientX, y: event.clientY })
        return
      }
      if (drag.kind === 'pan') {
        // Screen px == viewport px, so the client delta is the pan delta.
        setPanBoth({
          x: drag.startPan.x + (event.clientX - drag.startClientX),
          y: drag.startPan.y + (event.clientY - drag.startClientY),
        })
        return
      }
      // Move every node in the drag by the same delta from where the drag
      // began, so a multi-selection translates as one rigid group. Each node
      // is still clamped on its own so none escapes the view.
      const point = toWorkspace(event.clientX, event.clientY)
      const dx = point.x - drag.origin.x
      const dy = point.y - drag.origin.y
      setNodes((current) =>
        current.map((node) => {
          const start = drag.starts.get(node.id)
          if (!start) return node
          const moved = { ...node, x: start.x + dx, y: start.y + dy }
          return { ...moved, ...clampNode(moved, WORLD) }
        })
      )
    }

    function handleUp(event) {
      if (drag.kind === 'palette' && isOverWorkspace(event.clientX, event.clientY)) {
        const point = toWorkspace(event.clientX, event.clientY)
        // Dropping a gate on top of an existing gate swaps it in place, keeping
        // and remapping the old gate's wiring. Only gate-on-gate swaps; an
        // INPUT drop, or a drop over an INPUT/OUTPUT node, is a normal drop.
        const target = isGateType(drag.item.type)
          ? findGateAtPoint(nodesRef.current, point)
          : null
        if (target) {
          const newId = nextId('n')
          const swapped = {
            id: newId,
            type: drag.item.type,
            label: drag.item.label,
            x: target.x,
            y: target.y,
            ...newNodeData(drag.item.type),
          }
          // Carry the operator and constant across only when a CMP is dropped
          // onto a CMP; otherwise the fresh defaults above stand.
          if (drag.item.type === 'CMP' && target.type === 'CMP') {
            if (CMP_OP_CYCLE[target.op]) swapped.op = target.op
            if (Array.isArray(target.target)) swapped.target = [...target.target]
          }
          const newPortCount = getPortCount({ type: drag.item.type })
          setNodes((current) =>
            current.map((node) =>
              node.id === target.id ? { ...swapped, ...clampNode(swapped, WORLD) } : node
            )
          )
          setWires((current) => transferWiresForSwap(target.id, newId, newPortCount, current))
          setSelectedNodeIds(new Set([newId]))
          setSelectedWireId(null)
        } else {
          const size = getNodeSize({ type: drag.item.type })
          const dropped = {
            id: nextId('n'),
            type: drag.item.type,
            label: drag.item.label,
            x: point.x - size.width / 2,
            y: point.y - size.height / 2,
            ...newNodeData(drag.item.type),
          }
          setNodes((current) => [...current, { ...dropped, ...clampNode(dropped, WORLD) }])
        }
      }
      setDrag(null)
      setGhost(null)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [drag, toWorkspace, view, setPanBoth])

  // Marquee sweep. Driven off window listeners like the node drag so the
  // pointer can leave the SVG mid-sweep. `marquee` (the start) is stable for
  // the whole gesture, so this effect registers once per sweep, not per move.
  useEffect(() => {
    if (!marquee) return undefined

    function handleMove(event) {
      const point = toWorkspace(event.clientX, event.clientY)
      const moved =
        Math.abs(event.clientX - marquee.startClientX) > CLICK_SLOP ||
        Math.abs(event.clientY - marquee.startClientY) > CLICK_SLOP
      setMarqueeCur({ x: point.x, y: point.y, moved })
    }

    function handleUp(event) {
      const moved =
        Math.abs(event.clientX - marquee.startClientX) > CLICK_SLOP ||
        Math.abs(event.clientY - marquee.startClientY) > CLICK_SLOP
      if (moved) {
        // Select every selectable node whose box overlaps the swept rect.
        const point = toWorkspace(event.clientX, event.clientY)
        const rect = rectFromPoints(marquee.startX, marquee.startY, point.x, point.y)
        const hits = nodes
          .filter((node) => node.type !== 'OUTPUT' && rectsOverlap(getNodeBox(node), rect))
          .map((node) => node.id)
        setSelectedNodeIds(new Set(hits))
        setSelectedWireId(null)
      } else {
        // A plain click on empty space clears the selection, as before.
        setSelectedNodeIds(new Set())
        setSelectedWireId(null)
      }
      setMarquee(null)
      setMarqueeCur(null)
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [marquee, nodes, toWorkspace])

  // Drag-to-connect. Driven off window listeners so the pointer can leave the
  // source pin and travel anywhere before release. `wireDrag` is stable for the
  // whole gesture, so this effect subscribes once per drag. The pin positions
  // come from the geometry helpers and the release target is hit-tested by
  // distance, so everything stays correct under zoom and pan.
  useEffect(() => {
    if (!wireDrag) return undefined

    function handleMove(event) {
      const moved =
        Math.abs(event.clientX - wireDrag.startClientX) > CLICK_SLOP ||
        Math.abs(event.clientY - wireDrag.startClientY) > CLICK_SLOP
      if (!moved) return
      // First crossing of the threshold: this is now a real drag, so drop any
      // armed click-click source and start showing the preview line.
      if (!wireMovedRef.current) {
        wireMovedRef.current = true
        setWireDragMoved(true)
        cancelConnect()
      }
      setPreviewPoint(toWorkspace(event.clientX, event.clientY))
    }

    function handleUp(event) {
      const moved =
        wireMovedRef.current ||
        Math.abs(event.clientX - wireDrag.startClientX) > CLICK_SLOP ||
        Math.abs(event.clientY - wireDrag.startClientY) > CLICK_SLOP
      if (moved) {
        // Suppress the click that trails this pointerup so it does not also run
        // the click-click flow. Then hit-test the release point for a pin.
        suppressPinClickRef.current = true
        const point = toWorkspace(event.clientX, event.clientY)
        const target = findPinAtPoint(nodesRef.current, point, PIN_HIT_RADIUS)
        createWireFromDrag(wireDrag, target)
        cancelConnect()
        setPreviewPoint(null)
      }
      setWireDrag(null)
      setWireDragMoved(false)
      wireMovedRef.current = false
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [wireDrag, toWorkspace])

  // Closes the context menu on any pointerdown outside it. Kept separate from
  // the menu's own item handlers, which close it directly on activation.
  useEffect(() => {
    if (!contextMenu) return undefined
    function handlePointerDown(event) {
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target)) {
        setContextMenu(null)
      }
    }
    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [contextMenu])

  // Escape closes the context menu first, then the File menu, then cancels
  // connecting mode, then clears selection. Delete, Backspace and the letter D
  // all remove whatever is selected. Ctrl/Cmd+C/X/V drive the clipboard. There
  // are no text fields in the app, so the bare-letter shortcuts are safe.
  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') {
        if (contextMenu) {
          setContextMenu(null)
        } else if (fileMenuOpen) {
          setFileMenuOpen(false)
        } else if (connectFrom) {
          cancelConnect()
        } else if (selectedNodeIds.size > 0 || selectedWireId) {
          clearSelection()
        }
        return
      }
      // Ignore keys typed into a button or the hidden file input, so the top
      // bar's controls (and Enter/Space activating a focused button) never
      // trigger a workspace shortcut.
      const tag = event.target && event.target.tagName
      const typing = tag === 'BUTTON' || tag === 'INPUT' || tag === 'TEXTAREA'
      if (typing) return
      // Clipboard shortcuts. Guarded to the plain Ctrl/Cmd chord so they never
      // clash with the bare-letter delete below.
      if ((event.ctrlKey || event.metaKey) && !event.altKey) {
        const key = event.key.toLowerCase()
        if (key === 'c') {
          event.preventDefault()
          copySelection()
          return
        }
        if (key === 'x') {
          event.preventDefault()
          cutSelection()
          return
        }
        if (key === 'v') {
          event.preventDefault()
          pasteClipboard(null)
          return
        }
        return
      }
      if (event.altKey) return
      // Zoom in on +/= (and numpad +), zoom out on -/_ (and numpad -). These
      // are plain keys, so they sit clear of the Ctrl/Cmd clipboard chords and
      // the bare-letter delete below.
      if (event.key === '+' || event.key === '=' || event.code === 'NumpadAdd') {
        event.preventDefault()
        stepZoom(ZOOM_STEP)
        return
      }
      if (event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract') {
        event.preventDefault()
        stepZoom(1 / ZOOM_STEP)
        return
      }
      const isDeleteKey =
        event.key === 'Delete' ||
        event.key === 'Backspace' ||
        event.key === 'd' ||
        event.key === 'D'
      if (isDeleteKey && (selectedNodeIds.size > 0 || selectedWireId)) {
        event.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [connectFrom, selectedNodeIds, selectedWireId, clipboard, fileMenuOpen, contextMenu, nodes, wires])

  function cancelConnect() {
    setConnectFrom(null)
    setPreviewPoint(null)
  }

  function clearSelection() {
    setSelectedNodeIds(new Set())
    setSelectedWireId(null)
  }

  // Removes everything selected: all selected nodes (OUTPUT is never in the
  // set) plus every wire touching any of them, and the selected wire if any.
  function deleteSelected() {
    if (selectedWireId) {
      const wireId = selectedWireId
      setWires((current) => current.filter((wire) => wire.id !== wireId))
    }
    if (selectedNodeIds.size > 0) {
      const ids = selectedNodeIds
      setNodes((current) => current.filter((node) => node.type === 'OUTPUT' || !ids.has(node.id)))
      setWires((current) => current.filter((wire) => !ids.has(wire.from) && !ids.has(wire.to)))
    }
    clearSelection()
  }

  // Copy: snapshot the selected nodes and their internal wires into the
  // clipboard. Selection is left untouched. Returns the payload so Cut can
  // reuse it without depending on the async clipboard state update.
  function copySelection() {
    const payload = buildClipboard(nodes, wires, selectedNodeIds)
    if (!payload) return null
    setClipboard(payload)
    return payload
  }

  // Cut: copy, then delete the copied nodes and their touching wires.
  function cutSelection() {
    const payload = copySelection()
    if (!payload) return
    const ids = new Set(payload.nodes.map((node) => node.id))
    setNodes((current) => current.filter((node) => node.type === 'OUTPUT' || !ids.has(node.id)))
    setWires((current) => current.filter((wire) => !ids.has(wire.from) && !ids.has(wire.to)))
    clearSelection()
  }

  // Paste: drop fresh copies of the clipboard with new ids. With a target
  // point (from the context menu) the group is centered there; otherwise it is
  // nudged down-right off the originals. The pasted nodes become the selection
  // so they can be dragged immediately. Each is clamped into the view.
  function pasteClipboard(target) {
    if (!clipboard || clipboard.nodes.length === 0) return
    let offset = { dx: 24, dy: 24 }
    if (target) {
      const bounds = getNodesBounds(clipboard.nodes)
      offset = {
        dx: target.x - (bounds.x + bounds.width / 2),
        dy: target.y - (bounds.y + bounds.height / 2),
      }
    }
    const remapped = remapClipboard(clipboard, nextId, offset)
    const placed = remapped.nodes.map((node) => ({ ...node, ...clampNode(node, WORLD) }))
    setNodes((current) => [...current, ...placed])
    setWires((current) => [...current, ...remapped.wires])
    setSelectedNodeIds(new Set(remapped.newNodeIds))
    setSelectedWireId(null)
  }

  // A palette item is { type, label }: a gate type, or INPUT with a bit label.
  function handlePaletteDragStart(item, event) {
    setDrag({ kind: 'palette', item })
    setGhost({ x: event.clientX, y: event.clientY })
  }

  // Pointerdown on a node's body starts a move. Pins stop the event before it
  // gets here, so clicking a pin never starts a drag. Only the primary (left)
  // button drags; right-click is left for the context menu.
  //
  // Selection rules: a bare click on an unselected node selects just it; a
  // click on a node already in the multi-selection keeps the whole set and
  // drags it together; Shift+click toggles a node in or out of the set without
  // dragging. OUTPUT is the one fixed piece, never selectable, and dragging it
  // clears the selection.
  function handleNodeBodyPointerDown(node, event) {
    // Middle-button, or Space held with the left button, pans the view instead
    // of moving the node, so panning works even when the press lands on a gate.
    if (event.button === 1 || (event.button === 0 && spaceHeldRef.current)) {
      event.stopPropagation()
      event.preventDefault()
      startPan(event)
      return
    }
    if (event.button !== 0) return
    event.stopPropagation()

    if (event.shiftKey && node.type !== 'OUTPUT') {
      setSelectedNodeIds((current) => {
        const next = new Set(current)
        if (next.has(node.id)) next.delete(node.id)
        else next.add(node.id)
        return next
      })
      setSelectedWireId(null)
      return
    }

    // Decide which nodes this drag moves and settle the selection to match.
    let idsToMove
    if (node.type === 'OUTPUT') {
      clearSelection()
      idsToMove = [node.id]
    } else if (selectedNodeIds.has(node.id)) {
      idsToMove = [...selectedNodeIds]
    } else {
      setSelectedNodeIds(new Set([node.id]))
      setSelectedWireId(null)
      idsToMove = [node.id]
    }

    const point = toWorkspace(event.clientX, event.clientY)
    const moveSet = new Set(idsToMove)
    const starts = new Map(
      nodes.filter((n) => moveSet.has(n.id)).map((n) => [n.id, { x: n.x, y: n.y }])
    )
    setDrag({ kind: 'node', origin: { x: point.x, y: point.y }, starts })
  }

  // Right-click on a node: if it is not already part of the selection, select
  // just it so the menu acts on it; if it is already in the set, keep the set.
  // OUTPUT is never selectable, so a right-click on it leaves the selection be.
  function handleNodeContextMenu(node, event) {
    event.preventDefault()
    event.stopPropagation()
    if (node.type !== 'OUTPUT' && !selectedNodeIds.has(node.id)) {
      setSelectedNodeIds(new Set([node.id]))
      setSelectedWireId(null)
    }
    openContextMenu(event)
  }

  // Right-click on empty workspace (or a wire): keep the current selection.
  function handleWorkspaceContextMenu(event) {
    event.preventDefault()
    openContextMenu(event)
  }

  function openContextMenu(event) {
    setFileMenuOpen(false)
    cancelConnect()
    const point = toWorkspace(event.clientX, event.clientY)
    setContextMenu({
      screenX: event.clientX,
      screenY: event.clientY,
      workspaceX: point.x,
      workspaceY: point.y,
    })
  }

  // True when the workspace has anything beyond the starting set (the input
  // nodes plus OUTPUT), used to decide whether New needs to confirm before
  // clearing.
  const hasContent = nodes.length > INPUT_LABELS.length + 1 || wires.length > 0

  // Resets to the blank sandbox. Also drops any in-progress wiring and
  // selection, since both would otherwise point at nodes that no longer
  // exist.
  function handleNew() {
    setNodes(fitNodesToWorld(EMPTY_CIRCUIT.nodes))
    setWires(EMPTY_CIRCUIT.wires)
    resetZoom()
    cancelConnect()
    clearSelection()
  }

  // Replaces the circuit with one loaded from a file. The file has already
  // been validated by TopBar before this is called.
  function handleLoadCircuit(data) {
    setNodes(fitNodesToWorld(data.nodes))
    setWires(data.wires)
    resetZoom()
    cancelConnect()
    clearSelection()
  }

  // Loads a circuit (from the gallery) into the workspace, minting fresh node
  // and wire ids so a preset's baked-in ids can never collide with existing or
  // future ones. OUTPUT is re-pinned by fitNodesToWorld; zoom and pan are reset
  // to the identity view so the loaded circuit lands where it was authored.
  function loadFreshCircuit(circuit) {
    const idMap = new Map()
    const freshNodes = circuit.nodes.map((node) => {
      const id = nextId('n')
      idMap.set(node.id, id)
      const fresh = { ...node, id }
      // Deep copy a comparator's constant so the loaded copy never shares the
      // array with the source circuit.
      if (Array.isArray(node.target)) fresh.target = [...node.target]
      return fresh
    })
    const freshWires = circuit.wires.map((wire) => ({
      id: nextId('w'),
      from: idMap.get(wire.from),
      to: idMap.get(wire.to),
      // Preserve the real port so a comparator's higher inputs survive the load.
      toPort: Number.isInteger(wire.toPort) && wire.toPort >= 0 ? wire.toPort : 0,
    }))
    setNodes(fitNodesToWorld(freshNodes))
    setWires(freshWires)
    resetZoom()
    cancelConnect()
    clearSelection()
  }

  // Gallery "Open in Workspace". Confirms an overwrite exactly like New does
  // when the board is non-empty, then loads. Returns whether the load happened
  // so the gallery can keep its enlarged view open on a cancel.
  function handleOpenInWorkspace(circuit) {
    if (hasContent && !window.confirm('Clear the current circuit?')) return false
    loadFreshCircuit(circuit)
    return true
  }

  function handleWireClick(wireId) {
    setSelectedWireId(wireId)
    setSelectedNodeIds(new Set())
  }

  // Pointerdown on empty background begins a marquee sweep. Only the primary
  // button, so a right-click falls through to the context menu instead. The
  // sweep's up handler decides between a box-select and a plain click (which
  // clears the selection); either way connecting mode is cancelled here.
  function handleBackgroundPointerDown(event) {
    // Middle-button, or Space held with the left button, pans instead of
    // starting a marquee.
    if (event.button === 1 || (event.button === 0 && spaceHeldRef.current)) {
      event.preventDefault()
      startPan(event)
      return
    }
    if (event.button !== 0) return
    cancelConnect()
    const point = toWorkspace(event.clientX, event.clientY)
    setMarquee({
      startX: point.x,
      startY: point.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
    })
    setMarqueeCur({ x: point.x, y: point.y, moved: false })
  }

  function handleSurfacePointerMove(event) {
    if (!connectFrom) return
    setPreviewPoint(toWorkspace(event.clientX, event.clientY))
  }

  // Pointerdown on a pin begins a POTENTIAL drag-to-connect. The pin already
  // stopped propagation, so no node drag starts. Nothing is committed here: if
  // the pointer never moves past CLICK_SLOP this stays a plain click and the
  // pin's onClick runs the existing click-click flow. Only a real drag (handled
  // in the wireDrag effect) creates a wire in one gesture. Left button only.
  function handlePinPointerDown(node, kind, port, event) {
    suppressPinClickRef.current = false
    if (event.button !== 0) return
    const pin = kind === 'output' ? getOutputPinPos(node) : getInputPinPos(node, port)
    wireMovedRef.current = false
    setWireDragMoved(false)
    setWireDrag({
      kind,
      nodeId: node.id,
      port: kind === 'input' ? port : null,
      startX: pin.x,
      startY: pin.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
    })
  }

  // Commits a wire from a completed drag, given the source pin and the pin the
  // pointer was released over (or null). Output source -> input target, or
  // input source -> output target; any other combination, a self-wire, or an
  // empty release is ignored. Replace-on-reconnect: the one wire allowed into a
  // target input port is cleared first; output pins fan out freely.
  function createWireFromDrag(source, target) {
    if (!target) return
    let from
    let to
    let toPort
    if (source.kind === 'output') {
      if (target.kind !== 'input' || target.nodeId === source.nodeId) return
      from = source.nodeId
      to = target.nodeId
      toPort = target.port
    } else {
      if (target.kind !== 'output' || target.nodeId === source.nodeId) return
      from = target.nodeId
      to = source.nodeId
      toPort = source.port
    }
    setWires((current) => [
      ...current.filter((wire) => !(wire.to === to && wire.toPort === toPort)),
      { id: nextId('w'), from, to, toPort },
    ])
  }

  // Clicking an output pin arms it as the source. Clicking a different output
  // pin while armed just moves the source. Skipped when a drag just completed
  // on this pin, so a one-gesture drag never also arms click-click mode.
  function handleOutputPinClick(node) {
    if (suppressPinClickRef.current) {
      suppressPinClickRef.current = false
      return
    }
    setConnectFrom(node.id)
    setPreviewPoint(null)
    clearSelection()
  }

  // Clicking an input pin while armed lands the wire. An input pin holds one
  // wire, so any existing wire into this port is replaced. Clicking an
  // occupied input pin while NOT connecting instead detaches its wire.
  function handleInputPinClick(node, port) {
    if (suppressPinClickRef.current) {
      suppressPinClickRef.current = false
      return
    }
    if (!connectFrom) {
      setWires((current) => current.filter((wire) => !(wire.to === node.id && wire.toPort === port)))
      return
    }
    if (connectFrom === node.id) {
      // A node feeding its own input is nonsense, ignore it.
      cancelConnect()
      return
    }
    const from = connectFrom
    setWires((current) => [
      ...current.filter((wire) => !(wire.to === node.id && wire.toPort === port)),
      { id: nextId('w'), from, to: node.id, toPort: port },
    ])
    cancelConnect()
  }

  // Toggles one bit of a comparator's binary constant between 0 and 1. The
  // array is copied (and padded to GRID_BITS if short) so the update is
  // immutable and the canvas re-evaluates from the new node data.
  function handleToggleTargetBit(nodeId, bitIndex) {
    setNodes((current) =>
      current.map((node) => {
        if (node.id !== nodeId || node.type !== 'CMP') return node
        const target = Array.from({ length: GRID_BITS }, (_, i) =>
          Array.isArray(node.target) && node.target[i] ? 1 : 0
        )
        target[bitIndex] = target[bitIndex] ? 0 : 1
        return { ...node, target }
      })
    )
  }

  // Steps a comparator's whole binary constant up (+1) or down (-1) as one
  // number, wrapping around at both ends. The digit column re-derives from the
  // new array on the next render.
  function handleStepTarget(nodeId, delta) {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId && node.type === 'CMP'
          ? { ...node, target: stepTarget(node.target, delta) }
          : node
      )
    )
  }

  // Cycles a comparator's operator LT -> EQ -> GT -> LT.
  function handleCycleOp(nodeId) {
    setNodes((current) =>
      current.map((node) =>
        node.id === nodeId && node.type === 'CMP'
          ? { ...node, op: CMP_OP_CYCLE[node.op] || 'LT' }
          : node
      )
    )
  }

  // The rubber-band rectangle to draw, only once the sweep has moved past the
  // click threshold so a plain click never flashes a zero-size box.
  const marqueeRect =
    marquee && marqueeCur && marqueeCur.moved
      ? rectFromPoints(marquee.startX, marquee.startY, marqueeCur.x, marqueeCur.y)
      : null

  // The dashed preview line to draw while wiring. A live drag-connect wins:
  // its start is the source pin recorded at pointerdown (output or input), its
  // end is the cursor. Otherwise, if an output pin is armed for click-click,
  // the line runs from that pin to the cursor. Null when neither is active.
  let previewLine = null
  if (wireDrag && wireDragMoved && previewPoint) {
    previewLine = {
      x1: wireDrag.startX,
      y1: wireDrag.startY,
      x2: previewPoint.x,
      y2: previewPoint.y,
    }
  } else if (connectFrom && previewPoint) {
    const src = nodes.find((node) => node.id === connectFrom)
    if (src) {
      const start = getOutputPinPos(src)
      previewLine = { x1: start.x, y1: start.y, x2: previewPoint.x, y2: previewPoint.y }
    }
  }

  const hasNodeSelection = selectedNodeIds.size > 0
  const canPaste = !!clipboard && clipboard.nodes.length > 0

  // The OUTPUT node can be panned or zoomed out of view. When it is, show a
  // small marker pinned to the panel edge on the line toward it; null while it
  // is on screen. Cheap to recompute each render.
  const outputNode = nodes.find((node) => node.type === 'OUTPUT') || null
  // Anchor the marker exactly on the panel border (margin 0); the chip's own
  // half-size is taken out below so its whole box, not just its center, stays
  // inside.
  const outIndicator = getOffscreenIndicator(outputNode, pan, zoom, view, 0)

  // Clamp the chip's center so its bounding box sits fully inside the panel on
  // every edge and corner, then keep it as close to the border as possible.
  // Before the first measurement indicatorSize is 0, so it briefly falls back
  // to the raw anchor; it corrects on the next frame once measured.
  let indicatorPos = null
  if (outIndicator) {
    const halfW = indicatorSize.width / 2
    const halfH = indicatorSize.height / 2
    indicatorPos = {
      x: clamp(outIndicator.x, halfW, Math.max(view.width - halfW, halfW)),
      y: clamp(outIndicator.y, halfH, Math.max(view.height - halfH, halfH)),
      angle: outIndicator.angle,
    }
  }

  // Measure the chip after it renders so the clamp above knows its size. The
  // change guard keeps this from looping once the (fixed) size is recorded.
  useLayoutEffect(() => {
    const el = indicatorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setIndicatorSize((current) =>
      current.width === rect.width && current.height === rect.height
        ? current
        : { width: rect.width, height: rect.height }
    )
  })

  // Cursor feedback for panning mode: a closed grabbing hand while dragging the
  // view, an open grab hand whenever Space is held.
  const isPanning = !!drag && drag.kind === 'pan'
  const cursorClass = isPanning ? 'is-panning' : spaceHeld ? 'pan-ready' : ''

  // Recenters OUTPUT under the panel by setting pan so its center lands on the
  // viewport center at the current zoom. Wired to a click on the edge marker.
  function recenterOutput() {
    if (!outputNode) return
    const size = getNodeSize(outputNode)
    const z = zoomRef.current
    setPanBoth({
      x: view.width / 2 - z * (outputNode.x + size.width / 2),
      y: view.height / 2 - z * (outputNode.y + size.height / 2),
    })
  }

  // Runs a context-menu action then closes the menu. Copy/Cut/Delete no-op
  // when nothing is selected; Paste no-ops with an empty clipboard, but the
  // menu items are disabled in those cases so this is belt and braces.
  function runMenuAction(action) {
    if (action === 'copy') copySelection()
    else if (action === 'cut') cutSelection()
    else if (action === 'paste') {
      pasteClipboard(
        contextMenu ? { x: contextMenu.workspaceX, y: contextMenu.workspaceY } : null
      )
    } else if (action === 'delete') deleteSelected()
    setContextMenu(null)
  }

  return (
    <div className="app">
      <TopBar
        nodes={nodes}
        wires={wires}
        hasContent={hasContent}
        onNew={handleNew}
        onLoadCircuit={handleLoadCircuit}
        menuOpen={fileMenuOpen}
        onMenuOpenChange={setFileMenuOpen}
        page={page}
        onOpenLevelSelector={() => {
          setFileMenuOpen(false)
          setLevelSelectorOpen(true)
        }}
        onGoSandbox={() => setPage('sandbox')}
      />
      <div className="app-panels">
        <div className="left-column">
          <section className="panel palette-panel">
            <h2 className="panel-title">Palette</h2>
            <div className="panel-body">
              <Palette onPaletteDragStart={handlePaletteDragStart} />
            </div>
          </section>
        </div>
        <div className="right-column">
          <div className="right-top-row">
            <section className="panel canvas-panel">
              <h2 className="panel-title">Canvas</h2>
              <div className="panel-body">
                <OutputCanvas nodes={nodes} wires={wires} />
              </div>
            </section>
            {page === 'levels' ? (
              <LevelPanel
                level={activeLevel}
                index={levelIndex}
                total={LEVELS.length}
                earned={earnedDisplay}
                live={live}
                onPrev={() => setLevelIndex((i) => Math.max(0, i - 1))}
                onNext={() => setLevelIndex((i) => Math.min(LEVELS.length - 1, i + 1))}
              />
            ) : (
              <Gallery
                currentCircuit={{ nodes, wires }}
                onOpenInWorkspace={handleOpenInWorkspace}
              />
            )}
          </div>
          <section className="panel workspace-panel">
            <h2 className="panel-title">Workspace</h2>
            <div className="panel-body">
              <Workspace
                svgRef={svgRef}
                view={view}
                zoom={zoom}
                pan={pan}
                cursorClass={cursorClass}
                nodes={nodes}
                wires={wires}
                connectFrom={connectFrom}
                previewLine={previewLine}
                selectedNodeIds={selectedNodeIds}
                selectedWireId={selectedWireId}
                marqueeRect={marqueeRect}
                onBackgroundPointerDown={handleBackgroundPointerDown}
                onSurfacePointerMove={handleSurfacePointerMove}
                onNodeBodyPointerDown={handleNodeBodyPointerDown}
                onNodeContextMenu={handleNodeContextMenu}
                onWorkspaceContextMenu={handleWorkspaceContextMenu}
                onOutputPinClick={handleOutputPinClick}
                onInputPinClick={handleInputPinClick}
                onPinPointerDown={handlePinPointerDown}
                onWireClick={handleWireClick}
                onToggleTargetBit={handleToggleTargetBit}
                onCycleOp={handleCycleOp}
                onStepTarget={handleStepTarget}
              />
              {/* Floating zoom controls, top-right, over the SVG. The wrapper
                  passes pointer events through except on the buttons, so it
                  never blocks node dragging or a marquee below it. Buttons
                  suppress focus on mousedown so the keyboard zoom shortcuts
                  keep working after a click. */}
              <div className="zoom-controls">
                <button
                  type="button"
                  className="zoom-btn"
                  aria-label="Zoom in"
                  title="Zoom in (+)"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => stepZoom(ZOOM_STEP)}
                >
                  +
                </button>
                <button
                  type="button"
                  className="zoom-label"
                  aria-label="Reset zoom to 100%"
                  title="Reset to 100%"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={resetZoom}
                >
                  {Math.round(zoom * 100)}%
                </button>
                <button
                  type="button"
                  className="zoom-btn"
                  aria-label="Zoom out"
                  title="Zoom out (-)"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => stepZoom(1 / ZOOM_STEP)}
                >
                  &minus;
                </button>
              </div>
              {/* Off-screen OUTPUT marker: an amber chip pinned to the panel
                  edge on the line toward OUTPUT, with an arrow rotated to point
                  at it. Only rendered while OUTPUT is out of view. Clicking it
                  pans OUTPUT back to the center. */}
              {indicatorPos && (
                <button
                  type="button"
                  ref={indicatorRef}
                  className="output-indicator"
                  title="Show OUTPUT"
                  aria-label="Scroll OUTPUT into view"
                  style={{ left: indicatorPos.x, top: indicatorPos.y }}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={recenterOutput}
                >
                  <span
                    className="output-indicator-arrow"
                    style={{ transform: `rotate(${indicatorPos.angle}deg)` }}
                  >
                    &#9654;
                  </span>
                  OUT
                </button>
              )}
            </div>
          </section>
        </div>
      </div>
      {levelSelectorOpen && (
        <LevelSelector
          levels={LEVELS}
          progress={progress}
          onPick={handlePickLevel}
          onClose={() => setLevelSelectorOpen(false)}
        />
      )}
      {drag && drag.kind === 'palette' && ghost && (
        <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }}>
          {drag.item.label}
        </div>
      )}
      {contextMenu && (
        <ul
          ref={contextMenuRef}
          className="context-menu"
          style={{ left: contextMenu.screenX, top: contextMenu.screenY }}
        >
          <li>
            <button
              type="button"
              className="top-bar-menu-item"
              disabled={!hasNodeSelection}
              onClick={() => runMenuAction('copy')}
            >
              Copy
            </button>
          </li>
          <li>
            <button
              type="button"
              className="top-bar-menu-item"
              disabled={!hasNodeSelection}
              onClick={() => runMenuAction('cut')}
            >
              Cut
            </button>
          </li>
          <li className="top-bar-menu-separator">
            <button
              type="button"
              className="top-bar-menu-item"
              disabled={!canPaste}
              onClick={() => runMenuAction('paste')}
            >
              Paste
            </button>
          </li>
          <li>
            <button
              type="button"
              className="top-bar-menu-item"
              disabled={!hasNodeSelection}
              onClick={() => runMenuAction('delete')}
            >
              Delete
            </button>
          </li>
        </ul>
      )}
    </div>
  )
}

export default App
