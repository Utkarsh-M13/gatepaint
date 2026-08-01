import {
  getNodeSize,
  getPortCount,
  getInputPinPos,
  getOutputPinPos,
} from '../lib/geometry.js';
import { gateSymbol } from '../lib/symbols.js';

// Draws one node: its symbol, its label, input pins on the left, and an
// output pin on the right (INPUT nodes have no input pins, OUTPUT has no
// output pin since nothing wires out of it).
//
// Gates are schematic shapes drawn as a path. INPUT nodes are small rounded
// tags and OUTPUT is a squared plate, so those two stay rects.
//
// The symbol body starts a drag. The pins do not: they stop the pointerdown
// so a click on a pin stays a click, which is what the wiring needs.
function GateNode({ node, isConnectSource, isSelected, onBodyPointerDown, onContextMenu, onOutputPinClick, onInputPinClick, onPinPointerDown }) {
  const handleContextMenu = (event) => onContextMenu(node, event);
  const { width, height } = getNodeSize(node);
  const portCount = getPortCount(node);
  const inputPins = Array.from({ length: portCount }, (_, port) =>
    getInputPinPos(node, port)
  );
  const showOutputPin = node.type !== 'OUTPUT';
  const outputPos = showOutputPin ? getOutputPinPos(node) : null;

  const isBoxed = node.type === 'INPUT' || node.type === 'OUTPUT';
  const symbol = isBoxed ? null : gateSymbol(node);
  const labelX = isBoxed ? node.x + width / 2 : symbol.labelX;
  const boxClass = isSelected ? 'gate-node-box selected' : 'gate-node-box';

  return (
    <g className={`gate-node gate-node-${node.type.toLowerCase()}`}>
      {isBoxed ? (
        <rect
          x={node.x}
          y={node.y}
          width={width}
          height={height}
          // INPUT reads as a small tag, OUTPUT stays a plate.
          rx={node.type === 'INPUT' ? height / 2 : 3}
          className={boxClass}
          onPointerDown={(event) => onBodyPointerDown(node, event)}
          onContextMenu={handleContextMenu}
        />
      ) : (
        <>
          {symbol.tail && (
            <path
              d={symbol.tail}
              className={isSelected ? 'gate-node-tail selected' : 'gate-node-tail'}
              onPointerDown={(event) => onBodyPointerDown(node, event)}
              onContextMenu={handleContextMenu}
            />
          )}
          <path
            d={symbol.body}
            className={boxClass}
            onPointerDown={(event) => onBodyPointerDown(node, event)}
            onContextMenu={handleContextMenu}
          />
        </>
      )}
      <text
        x={labelX}
        y={node.y + height / 2}
        className="gate-node-label"
        textAnchor="middle"
        dominantBaseline="central"
      >
        {node.type === 'INPUT' ? node.label : node.type}
      </text>
      {inputPins.map((pos, port) => (
        <circle
          key={`in-${port}`}
          cx={pos.x}
          cy={pos.y}
          r={9}
          className="pin pin-input"
          onPointerDown={(event) => {
            // Keep the press off the body (which would start a node drag), then
            // let App begin a potential drag-to-connect from this input pin.
            event.stopPropagation();
            onPinPointerDown(node, 'input', port, event);
          }}
          onClick={(event) => {
            event.stopPropagation();
            onInputPinClick(node, port);
          }}
        />
      ))}
      {outputPos && (
        <circle
          cx={outputPos.x}
          cy={outputPos.y}
          r={9}
          className={isConnectSource ? 'pin pin-output pin-active' : 'pin pin-output'}
          onPointerDown={(event) => {
            // Same as the input pins: block the body drag, then arm a potential
            // drag-to-connect from this output pin.
            event.stopPropagation();
            onPinPointerDown(node, 'output', null, event);
          }}
          onClick={(event) => {
            event.stopPropagation();
            onOutputPinClick(node);
          }}
        />
      )}
    </g>
  );
}

export default GateNode;
