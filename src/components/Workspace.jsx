import GateNode from './GateNode.jsx';
import Wire from './Wire.jsx';

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
