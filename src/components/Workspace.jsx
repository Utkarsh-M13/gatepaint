import GateNode from './GateNode.jsx';
import Wire from './Wire.jsx';
import {
  WORLD_WIDTH,
  WORLD_HEIGHT,
  WORLD_MARGIN,
  GRID_CELL,
  GRID_MAJOR,
} from '../lib/geometry.js';

// The graph-paper grid, in world coordinates, drawn behind the wires and
// nodes inside the pan/zoom group so it scrolls and scales with them. It
// overhangs the world by WORLD_MARGIN so a small pan past the edge still shows
// grid. A single tiled <pattern> rect, so it costs almost nothing to draw.
const GRID_MAJOR_STEP = GRID_CELL * GRID_MAJOR;
const GRID_X = -WORLD_MARGIN;
const GRID_Y = -WORLD_MARGIN;
const GRID_W = WORLD_WIDTH + WORLD_MARGIN * 2;
const GRID_H = WORLD_HEIGHT + WORLD_MARGIN * 2;

// SVG surface that draws the circuit straight from state. Interaction is
// owned by App: this component just forwards pointer events up and draws the
// connecting preview line when a source pin is armed.
//
// Every node is drawn here, inputs included: they are dragged in from the
// palette and behave like any other node apart from having no input pins.
// `view` is the measured pixel size of the SVG element, supplied by App. Using
// it as the viewBox means the drawing fills the panel exactly at 1:1 scale, so
// gates and pins keep their true proportions at any panel shape.
function Workspace({
  svgRef,
  view,
  zoom = 1,
  pan = { x: 0, y: 0 },
  cursorClass = '',
  nodes,
  wires,
  connectFrom,
  previewLine,
  selectedNodeIds,
  selectedWireId,
  marqueeRect,
  onBackgroundPointerDown,
  onSurfacePointerMove,
  onNodeBodyPointerDown,
  onNodeContextMenu,
  onWorkspaceContextMenu,
  onOutputPinClick,
  onInputPinClick,
  onPinPointerDown,
  onWireClick,
  onToggleTargetBit,
  onCycleOp,
  onStepTarget,
}) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  return (
    <svg
      ref={svgRef}
      className={`workspace-svg${cursorClass ? ` ${cursorClass}` : ''}`}
      viewBox={`0 0 ${view.width} ${view.height}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={onSurfacePointerMove}
      onContextMenu={onWorkspaceContextMenu}
    >
      {/* Background catches clicks on empty space, which start a marquee sweep
          (or, on a plain click, cancel connecting and clear the selection).
          It stays outside the zoom group and covers the whole viewport, so
          empty space anywhere in the panel stays clickable at any zoom. */}
      <rect
        x={0}
        y={0}
        width={view.width}
        height={view.height}
        className="workspace-background"
        onPointerDown={onBackgroundPointerDown}
      />
      {/* Everything drawn in workspace coordinates lives inside this group.
          The transform is pan then scale, matching s = pan + zoom*w, the exact
          inverse of the screen->workspace conversion in App. At zoom=1, pan=0
          it is the identity, so nothing moves relative to the old behavior. */}
      <g transform={`translate(${pan.x} ${pan.y}) scale(${zoom})`}>
      {/* Blueprint grid. Two nested patterns: a fine cell, then a heavier rule
          every GRID_MAJOR cells. It lives in world space at the very back of
          the group, and is non-interactive so marquee sweeps and palette drops
          fall through to the background rect behind the group. */}
      <defs>
        <pattern
          id="ws-grid-fine"
          width={GRID_CELL}
          height={GRID_CELL}
          patternUnits="userSpaceOnUse"
        >
          <path
            d={`M ${GRID_CELL} 0 L 0 0 0 ${GRID_CELL}`}
            className="ws-grid-line-fine"
            fill="none"
          />
        </pattern>
        <pattern
          id="ws-grid"
          width={GRID_MAJOR_STEP}
          height={GRID_MAJOR_STEP}
          patternUnits="userSpaceOnUse"
        >
          <rect width={GRID_MAJOR_STEP} height={GRID_MAJOR_STEP} fill="url(#ws-grid-fine)" />
          <path
            d={`M ${GRID_MAJOR_STEP} 0 L 0 0 0 ${GRID_MAJOR_STEP}`}
            className="ws-grid-line-major"
            fill="none"
          />
        </pattern>
      </defs>
      <rect
        className="ws-grid-rect"
        x={GRID_X}
        y={GRID_Y}
        width={GRID_W}
        height={GRID_H}
        fill="url(#ws-grid)"
        pointerEvents="none"
      />
      {wires.map((wire) => (
        <Wire
          key={wire.id}
          wire={wire}
          nodesById={nodesById}
          isSelected={selectedWireId === wire.id}
          onSelect={onWireClick}
        />
      ))}
      {previewLine && (
        <line
          x1={previewLine.x1}
          y1={previewLine.y1}
          x2={previewLine.x2}
          y2={previewLine.y2}
          className="wire-preview"
        />
      )}
      {nodes.map((node) => (
        <GateNode
          key={node.id}
          node={node}
          isConnectSource={node.id === connectFrom}
          isSelected={selectedNodeIds.has(node.id)}
          onBodyPointerDown={onNodeBodyPointerDown}
          onContextMenu={onNodeContextMenu}
          onOutputPinClick={onOutputPinClick}
          onInputPinClick={onInputPinClick}
          onPinPointerDown={onPinPointerDown}
          onToggleTargetBit={onToggleTargetBit}
          onCycleOp={onCycleOp}
          onStepTarget={onStepTarget}
        />
      ))}
      {/* Rubber-band rectangle, drawn on top so it reads over the nodes. */}
      {marqueeRect && (
        <rect
          x={marqueeRect.x}
          y={marqueeRect.y}
          width={marqueeRect.width}
          height={marqueeRect.height}
          className="marquee"
        />
      )}
      </g>
    </svg>
  );
}

export default Workspace;
