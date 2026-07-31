import GateNode from './GateNode.jsx';
import Wire from './Wire.jsx';
import { getOutputPinPos } from '../lib/geometry.js';

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
  nodes,
  wires,
  connectFrom,
  previewPoint,
  selected,
  onBackgroundPointerDown,
  onSurfacePointerMove,
  onNodeBodyPointerDown,
  onOutputPinClick,
  onInputPinClick,
  onWireClick,
}) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const sourceNode = connectFrom ? nodesById.get(connectFrom) : null;
  const previewStart = sourceNode ? getOutputPinPos(sourceNode) : null;

  return (
    <svg
      ref={svgRef}
      className="workspace-svg"
      viewBox={`0 0 ${view.width} ${view.height}`}
      preserveAspectRatio="xMidYMid meet"
      onPointerMove={onSurfacePointerMove}
    >
      {/* Background catches clicks on empty space, which cancel connecting. */}
      <rect
        x={0}
        y={0}
        width={view.width}
        height={view.height}
        className="workspace-background"
        onPointerDown={onBackgroundPointerDown}
      />
      {wires.map((wire) => (
        <Wire
          key={wire.id}
          wire={wire}
          nodesById={nodesById}
          isSelected={selected?.kind === 'wire' && selected.id === wire.id}
          onSelect={onWireClick}
        />
      ))}
      {previewStart && previewPoint && (
        <line
          x1={previewStart.x}
          y1={previewStart.y}
          x2={previewPoint.x}
          y2={previewPoint.y}
          className="wire-preview"
        />
      )}
      {nodes.map((node) => (
        <GateNode
          key={node.id}
          node={node}
          isConnectSource={node.id === connectFrom}
          isSelected={selected?.kind === 'node' && selected.id === node.id}
          onBodyPointerDown={onNodeBodyPointerDown}
          onOutputPinClick={onOutputPinClick}
          onInputPinClick={onInputPinClick}
        />
      ))}
    </svg>
  );
}

export default Workspace;
