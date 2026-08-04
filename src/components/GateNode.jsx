import {
  getNodeSize,
  getPortCount,
  getInputPinPos,
  getOutputPinPos,
} from '../lib/geometry.js';
import { GRID_BITS } from '../engine/bits.js';
import { gateSymbol } from '../lib/symbols.js';

// The glyph shown for each comparator operator.
const OP_GLYPH = { LT: '<', EQ: '=', GT: '>' };

// Draws one node: its symbol, its label, input pins on the left, and an
// output pin on the right (INPUT nodes have no input pins, OUTPUT has no
// output pin since nothing wires out of it).
//
// Gates are schematic shapes drawn as a path. INPUT nodes are small rounded
// tags and OUTPUT is a squared plate, so those two stay rects. The comparator
// (CMP) is a labelled rectangle with an operator control and a row of clickable
// constant digits inside it.
//
// The symbol body starts a drag. The pins do not: they stop the pointerdown
// so a click on a pin stays a click, which is what the wiring needs. The CMP
// operator control and digit cells do the same, so clicking them toggles the
// value instead of dragging the block.
function GateNode({
  node,
  isConnectSource,
  isSelected,
  onBodyPointerDown,
  onContextMenu,
  onOutputPinClick,
  onInputPinClick,
  onPinPointerDown,
  onToggleTargetBit,
  onCycleOp,
  onStepTarget,
}) {
  const handleContextMenu = (event) => onContextMenu(node, event);
  const { width, height } = getNodeSize(node);
  const portCount = getPortCount(node);
  const inputPins = Array.from({ length: portCount }, (_, port) =>
    getInputPinPos(node, port)
  );
  const showOutputPin = node.type !== 'OUTPUT';
  const outputPos = showOutputPin ? getOutputPinPos(node) : null;

  const isCmp = node.type === 'CMP';
  const isBoxed = node.type === 'INPUT' || node.type === 'OUTPUT';
  const symbol = isBoxed || isCmp ? null : gateSymbol(node);
  const labelX = isBoxed ? node.x + width / 2 : isCmp ? node.x + width / 2 : symbol.labelX;
  const boxClass = isSelected ? 'gate-node-box selected' : 'gate-node-box';

  // Comparator interior geometry, all derived from the box so it stays put at
  // any GRID_BITS. Each constant digit sits on the same row as the input pin
  // for its bit (digit i aligns with pin i, which reuses inputPins[i].y). The
  // operator control and the up/down stepper stack together on the right,
  // vertically centered, clear of the digit column on the left.
  let cmpUi = null;
  if (isCmp) {
    // Digit cells: one per bit, in a vertical column just right of the pins and
    // their bit labels. cellY is filled in per digit from the matching pin's y.
    const cellW = 18;
    const cellH = 18;
    const digitX = node.x + 24;

    // Operator + stepper group, pinned to the right edge and centered in height.
    const opW = 30;
    const opH = 26;
    const stepW = 16;
    const stepGap = 4;
    const groupW = opW + stepGap + stepW;
    const opX = node.x + width - groupW - 16;
    const opY = node.y + height / 2 - opH / 2;
    const stepH = opH / 2;
    const stepX = opX + opW + stepGap;
    const upY = opY;
    const downY = opY + stepH;

    const target = Array.isArray(node.target) ? node.target : [];
    const op = node.op || 'LT';

    cmpUi = {
      cellW, cellH, digitX, opW, opH, opX, opY,
      stepW, stepH, stepX, upY, downY, target, op,
    };
  }

  return (
    <g className={`gate-node gate-node-${node.type.toLowerCase()}`}>
      {isCmp ? (
        <rect
          x={node.x}
          y={node.y}
          width={width}
          height={height}
          rx={4}
          className={boxClass}
          onPointerDown={(event) => onBodyPointerDown(node, event)}
          onContextMenu={handleContextMenu}
        />
      ) : isBoxed ? (
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
      {!isCmp && (
        <text
          x={labelX}
          y={node.y + height / 2}
          className="gate-node-label"
          textAnchor="middle"
          dominantBaseline="central"
        >
          {node.type === 'INPUT' ? node.label : node.type}
        </text>
      )}
      {isCmp && (
        <>
          {/* Operator control: shows <, = or > and cycles LT -> EQ -> GT on
              click. Stops the pointerdown so the click never starts a drag. */}
          <g
            className="cmp-op"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onCycleOp(node.id);
            }}
          >
            <rect
              x={cmpUi.opX}
              y={cmpUi.opY}
              width={cmpUi.opW}
              height={cmpUi.opH}
              rx={3}
              className="cmp-op-box"
            />
            <text
              x={cmpUi.opX + cmpUi.opW / 2}
              y={cmpUi.opY + cmpUi.opH / 2}
              className="cmp-op-text"
              textAnchor="middle"
              dominantBaseline="central"
            >
              {OP_GLYPH[cmpUi.op] || '<'}
            </text>
          </g>
          {/* Up/down stepper: increments or decrements the whole target by 1,
              wrapping at the ends (up from the max rolls to 0, down from 0 rolls
              to the max), so both arrows stay active. Each arrow stops the
              pointerdown so a click never starts a node drag. */}
          <g
            className="cmp-step"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onStepTarget(node.id, 1);
            }}
          >
            <rect
              x={cmpUi.stepX}
              y={cmpUi.upY}
              width={cmpUi.stepW}
              height={cmpUi.stepH}
              rx={2}
              className="cmp-step-box"
            />
            <path
              d={`M ${cmpUi.stepX + cmpUi.stepW / 2} ${cmpUi.upY + 3}` +
                ` L ${cmpUi.stepX + cmpUi.stepW - 4} ${cmpUi.upY + cmpUi.stepH - 4}` +
                ` L ${cmpUi.stepX + 4} ${cmpUi.upY + cmpUi.stepH - 4} Z`}
              className="cmp-step-arrow"
            />
          </g>
          <g
            className="cmp-step"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onStepTarget(node.id, -1);
            }}
          >
            <rect
              x={cmpUi.stepX}
              y={cmpUi.downY}
              width={cmpUi.stepW}
              height={cmpUi.stepH}
              rx={2}
              className="cmp-step-box"
            />
            <path
              d={`M ${cmpUi.stepX + 4} ${cmpUi.downY + 4}` +
                ` L ${cmpUi.stepX + cmpUi.stepW - 4} ${cmpUi.downY + 4}` +
                ` L ${cmpUi.stepX + cmpUi.stepW / 2} ${cmpUi.downY + cmpUi.stepH - 3} Z`}
              className="cmp-step-arrow"
            />
          </g>
          {/* Binary constant, laid out as a vertical column: digit for bit i
              sits on the same row as input pin i (reusing that pin's y), so the
              user reads each bit next to the wire that feeds it. Clicking a cell
              toggles that bit. */}
          {Array.from({ length: GRID_BITS }, (_, bit) => {
            const on = cmpUi.target[bit] ? 1 : 0;
            const cellY = inputPins[bit].y - cmpUi.cellH / 2;
            return (
              <g
                key={`digit-${bit}`}
                className={on ? 'cmp-digit on' : 'cmp-digit'}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onToggleTargetBit(node.id, bit);
                }}
              >
                <rect
                  x={cmpUi.digitX}
                  y={cellY}
                  width={cmpUi.cellW}
                  height={cmpUi.cellH}
                  rx={2}
                  className="cmp-digit-box"
                />
                <text
                  x={cmpUi.digitX + cmpUi.cellW / 2}
                  y={cellY + cmpUi.cellH / 2}
                  className="cmp-digit-text"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {on}
                </text>
              </g>
            );
          })}
        </>
      )}
      {inputPins.map((pos, port) => (
        <g key={`in-${port}`}>
          {isCmp && (
            <text
              x={pos.x + 12}
              y={pos.y}
              className="cmp-pin-label"
              textAnchor="start"
              dominantBaseline="central"
            >
              {port}
            </text>
          )}
          <circle
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
        </g>
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
