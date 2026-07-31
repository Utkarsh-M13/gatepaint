import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import './App.css'
import { DEFAULT_CIRCUIT, EMPTY_CIRCUIT } from './circuits.js'
import {
  getNodeSize,
  OUTPUT_MARGIN,
  VIEW_WIDTH,
  VIEW_HEIGHT,
} from './lib/geometry.js'
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
      return {
        ...node,
        x: Math.max(view.width - size.width - OUTPUT_MARGIN, 0),
        y: Math.max((view.height - size.height) / 2, 0),
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

  // Selection: at most one thing selected at a time, a gate node or a wire.
  // { kind: 'node', id } | { kind: 'wire', id } | null.
  const [selected, setSelected] = useState(null)

  // Active drag. Either a gate being dragged out of the palette, or an
  // existing node being moved. Null when nothing is being dragged.
  const [drag, setDrag] = useState(null)
  // Cursor position in screen coordinates, for the palette drag ghost.
  const [ghost, setGhost] = useState(null)

  // The workspace viewBox size, measured from the SVG element itself so that
  // one user unit is exactly one CSS pixel. That keeps the drawing at a 1:1
  // aspect (nothing is stretched) while still filling the whole panel. The
  // constants from geometry.js are only the pre-measurement fallback.
  const [view, setView] = useState({ width: VIEW_WIDTH, height: VIEW_HEIGHT })

  const svgRef = useRef(null)

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

  // Screen coordinates -> workspace (viewBox) coordinates.
  const toWorkspace = useCallback((clientX, clientY) => {
    const svg = svgRef.current
    if (!svg) return { x: 0, y: 0 }
    const ctm = svg.getScreenCTM()
    if (!ctm) return { x: 0, y: 0 }
    const point = svg.createSVGPoint()
    point.x = clientX
    point.y = clientY
    const local = point.matrixTransform(ctm.inverse())
    return { x: local.x, y: local.y }
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
      const point = toWorkspace(event.clientX, event.clientY)
      setNodes((current) =>
        current.map((node) => {
          if (node.id !== drag.nodeId) return node
          const moved = {
            ...node,
            x: point.x - drag.offsetX,
            y: point.y - drag.offsetY,
          }
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

  // Escape closes the File menu first if it is open, otherwise cancels
  // connecting mode, otherwise clears selection. Delete, Backspace and the
  // letter D all remove whatever is selected. There are no text fields in
  // the app, so D is safe as a shortcut.
  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') {
        if (fileMenuOpen) {
          setFileMenuOpen(false)
        } else if (connectFrom) {
          cancelConnect()
        } else if (selected) {
          setSelected(null)
        }
        return
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return
      // Ignore keys typed into a button or the hidden file input, so the top
      // bar's controls (and Enter/Space activating a focused button) never
      // trigger the delete shortcut.
      const tag = event.target && event.target.tagName
      if (tag === 'BUTTON' || tag === 'INPUT') return
      const isDeleteKey =
        event.key === 'Delete' ||
        event.key === 'Backspace' ||
        event.key === 'd' ||
        event.key === 'D'
      if (isDeleteKey && selected) {
        event.preventDefault()
        deleteSelected()
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [connectFrom, selected, fileMenuOpen])

  function cancelConnect() {
    setConnectFrom(null)
    setPreviewPoint(null)
  }

  // Removes whatever is currently selected. A node takes its wires with it
  // (anything touching it, in either direction). The OUTPUT node is never
  // selectable, so it can never reach this function.
  function deleteSelected() {
    if (!selected) return
    if (selected.kind === 'node') {
      const nodeId = selected.id
      setNodes((current) => current.filter((node) => node.id !== nodeId))
      setWires((current) => current.filter((wire) => wire.from !== nodeId && wire.to !== nodeId))
    } else if (selected.kind === 'wire') {
      const wireId = selected.id
      setWires((current) => current.filter((wire) => wire.id !== wireId))
    }
    setSelected(null)
  }

  // A palette item is { type, label }: a gate type, or INPUT with a bit label.
  function handlePaletteDragStart(item, event) {
    setDrag({ kind: 'palette', item })
    setGhost({ x: event.clientX, y: event.clientY })
  }

  // Pointerdown on a node's body starts a move. Pins stop the event before it
  // gets here, so clicking a pin never starts a drag. The same click also
  // selects the node, since a drag always begins with a click. The OUTPUT node
  // is the one fixed piece and is never selectable/deletable.
  function handleNodeBodyPointerDown(node, event) {
    event.stopPropagation()
    const isDeletable = node.type !== 'OUTPUT'
    setSelected(isDeletable ? { kind: 'node', id: node.id } : null)
    const point = toWorkspace(event.clientX, event.clientY)
    setDrag({
      kind: 'node',
      nodeId: node.id,
      offsetX: point.x - node.x,
      offsetY: point.y - node.y,
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
    setSelected(null)
  }

  // Replaces the circuit with one loaded from a file. The file has already
  // been validated by TopBar before this is called.
  function handleLoadCircuit(data) {
    setNodes(fitNodesToView(data.nodes, view))
    setWires(data.wires)
    cancelConnect()
    setSelected(null)
  }

  function handleWireClick(wireId) {
    setSelected({ kind: 'wire', id: wireId })
  }

  function handleBackgroundPointerDown() {
    cancelConnect()
    setSelected(null)
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
    setSelected(null)
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
                nodes={nodes}
                wires={wires}
                connectFrom={connectFrom}
                previewPoint={previewPoint}
                selected={selected}
                onBackgroundPointerDown={handleBackgroundPointerDown}
                onSurfacePointerMove={handleSurfacePointerMove}
                onNodeBodyPointerDown={handleNodeBodyPointerDown}
                onOutputPinClick={handleOutputPinClick}
                onInputPinClick={handleInputPinClick}
                onWireClick={handleWireClick}
              />
            </div>
          </section>
        </div>
      </div>
      {drag && drag.kind === 'palette' && ghost && (
        <div className="drag-ghost" style={{ left: ghost.x, top: ghost.y }}>
          {drag.item.label}
        </div>
      )}
    </div>
  )
}

export default App
