import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import './App.css'
import { DEFAULT_CIRCUIT, EMPTY_CIRCUIT } from './circuits.js'
import {
  getNodeSize,
  getNodeBox,
  getNodesBounds,
  rectsOverlap,
  OUTPUT_MARGIN,
  VIEW_WIDTH,
  VIEW_HEIGHT,
} from './lib/geometry.js'
import { buildClipboard, remapClipboard } from './lib/clipboard.js'
import Palette from './components/Palette.jsx'
import Workspace from './components/Workspace.jsx'
import OutputCanvas from './components/OutputCanvas.jsx'
import TopBar from './components/TopBar.jsx'

let idCounter = 0
function nextId(prefix) {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// A pointer moved less than this many screen pixels counts as a click, not a
// drag. Used to tell a marquee sweep apart from a plain click-to-deselect.
const CLICK_SLOP = 4

// Zoom limits and the per-step multiplier shared by the keys and the buttons.
// Zoom scales the workspace group only; the SVG viewBox stays pinned to the
// panel pixel size so getScreenCTM stays valid.
const ZOOM_MIN = 0.4
const ZOOM_MAX = 2.5
const ZOOM_STEP = 1.2

// The OUTPUT node is pinned to the right edge and vertically centered, which
// is exactly where the floating zoom controls sit. On a short workspace the
// vertical center rises into that corner and the two collide. Keep OUTPUT's
// top no higher than this many pixels down so it always clears the controls
// band (roughly 100px tall) while staying centered on any normal-height panel.
const OUTPUT_TOP_RESERVE = 116

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

// Keeps a node fully inside a view of the given size. Used both while
// dragging and when the workspace is resized under the existing nodes.
function clampNode(node, view) {
  const size = getNodeSize(node)
  return {
    x: clamp(node.x, 0, Math.max(view.width - size.width, 0)),
    y: clamp(node.y, 0, Math.max(view.height - size.height, 0)),
  }
}

// Pulls every node back inside the given view and re-pins OUTPUT to the
// right edge, vertically centered. Shared by the view-resize effect and by
// New/Load, which both drop in a fresh set of nodes that also needs pinning.
function fitNodesToView(nodes, view) {
  return nodes.map((node) => {
    if (node.type === 'OUTPUT') {
      const size = getNodeSize(node)
      // Vertically centered, but never so high that it slides under the
      // top-right zoom controls: hold its top at least OUTPUT_TOP_RESERVE down,
      // then cap so it still fits inside a very short panel.
      const centered = (view.height - size.height) / 2
      const maxTop = Math.max(view.height - size.height, 0)
      return {
        ...node,
        x: Math.max(view.width - size.width - OUTPUT_MARGIN, 0),
        y: Math.min(Math.max(centered, OUTPUT_TOP_RESERVE), maxTop),
      }
    }
    return { ...node, ...clampNode(node, view) }
  })
}

function App() {
  const [nodes, setNodes] = useState(DEFAULT_CIRCUIT.nodes)
  const [wires, setWires] = useState(DEFAULT_CIRCUIT.wires)

  // Whether the top bar's File dropdown is open. Lifted up from TopBar so
  // Escape can be told to close the menu first, before it touches wiring or
  // selection.
  const [fileMenuOpen, setFileMenuOpen] = useState(false)

  // Wiring: the node id whose output pin is armed, or null.
  const [connectFrom, setConnectFrom] = useState(null)
  // Cursor position in workspace coordinates, for the preview line.
  const [previewPoint, setPreviewPoint] = useState(null)

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

  const svgRef = useRef(null)

  // Steps the zoom by a multiplicative factor, clamped, keeping the center of
  // the visible workspace fixed. A workspace point w maps to an SVG-viewport
  // point s by s = pan + zoom*w, so w = (s - pan)/zoom. Holding the point under
  // the viewport center c fixed across the change means
  //   (c - pan0)/z0 = (c - pan1)/z1  ->  pan1 = c - z1*(c - pan0)/z0.
  // Refs are updated synchronously so a handler firing before the next render
  // still converts with the new zoom/pan.
  const stepZoom = useCallback((factor) => {
    const z0 = zoomRef.current
    const next = clamp(z0 * factor, ZOOM_MIN, ZOOM_MAX)
    if (next === z0) return
    const p0 = panRef.current
    const v = viewRef.current
    const cx = v.width / 2
    const cy = v.height / 2
    const nx = cx - (next * (cx - p0.x)) / z0
    const ny = cy - (next * (cy - p0.y)) / z0
    zoomRef.current = next
    panRef.current = { x: nx, y: ny }
    setZoom(next)
    setPan({ x: nx, y: ny })
  }, [])

  const resetZoom = useCallback(() => {
    zoomRef.current = 1
    panRef.current = { x: 0, y: 0 }
    setZoom(1)
    setPan({ x: 0, y: 0 })
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
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(svg)
    return () => observer.disconnect()
  }, [])

  // When the view changes size, pull every node back inside it and re-pin the
  // OUTPUT node to the right edge, vertically centered. OUTPUT is the one
  // fixed fixture on the board, so it always sits in the same place.
  useEffect(() => {
    setNodes((current) => fitNodesToView(current, view))
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
    const point = toWorkspace(clientX, clientY)
    return (
      point.x >= 0 && point.x <= view.width && point.y >= 0 && point.y <= view.height
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
          return { ...moved, ...clampNode(moved, view) }
        })
      )
    }

    function handleUp(event) {
      if (drag.kind === 'palette' && isOverWorkspace(event.clientX, event.clientY)) {
        const point = toWorkspace(event.clientX, event.clientY)
        const size = getNodeSize({ type: drag.item.type })
        const dropped = {
          id: nextId('n'),
          type: drag.item.type,
          label: drag.item.label,
          x: point.x - size.width / 2,
          y: point.y - size.height / 2,
        }
        setNodes((current) => [...current, { ...dropped, ...clampNode(dropped, view) }])
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
  }, [drag, toWorkspace, view])

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
    const placed = remapped.nodes.map((node) => ({ ...node, ...clampNode(node, view) }))
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

  // True when the workspace has anything beyond the bare OUTPUT node, used
  // to decide whether New needs to confirm before clearing.
  const hasContent = nodes.length > 1 || wires.length > 0

  // Resets to the blank sandbox. Also drops any in-progress wiring and
  // selection, since both would otherwise point at nodes that no longer
  // exist.
  function handleNew() {
    setNodes(fitNodesToView(EMPTY_CIRCUIT.nodes, view))
    setWires(EMPTY_CIRCUIT.wires)
    cancelConnect()
    clearSelection()
  }

  // Replaces the circuit with one loaded from a file. The file has already
  // been validated by TopBar before this is called.
  function handleLoadCircuit(data) {
    setNodes(fitNodesToView(data.nodes, view))
    setWires(data.wires)
    cancelConnect()
    clearSelection()
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

  // Clicking an output pin arms it as the source. Clicking a different output
  // pin while armed just moves the source.
  function handleOutputPinClick(node) {
    setConnectFrom(node.id)
    setPreviewPoint(null)
    clearSelection()
  }

  // Clicking an input pin while armed lands the wire. An input pin holds one
  // wire, so any existing wire into this port is replaced. Clicking an
  // occupied input pin while NOT connecting instead detaches its wire.
  function handleInputPinClick(node, port) {
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

  // The rubber-band rectangle to draw, only once the sweep has moved past the
  // click threshold so a plain click never flashes a zero-size box.
  const marqueeRect =
    marquee && marqueeCur && marqueeCur.moved
      ? rectFromPoints(marquee.startX, marquee.startY, marqueeCur.x, marqueeCur.y)
      : null

  const hasNodeSelection = selectedNodeIds.size > 0
  const canPaste = !!clipboard && clipboard.nodes.length > 0

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
          <section className="panel canvas-panel">
            <h2 className="panel-title">Canvas</h2>
            <div className="panel-body">
              <OutputCanvas nodes={nodes} wires={wires} />
            </div>
          </section>
          <section className="panel workspace-panel">
            <h2 className="panel-title">Workspace</h2>
            <div className="panel-body">
              <Workspace
                svgRef={svgRef}
                view={view}
                zoom={zoom}
                pan={pan}
                nodes={nodes}
                wires={wires}
                connectFrom={connectFrom}
                previewPoint={previewPoint}
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
                onWireClick={handleWireClick}
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
            </div>
          </section>
        </div>
      </div>
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
