import {
  getNodeSize,
  getPortCount,
  getInputPinPos,
  getOutputPinPos,
} from '../lib/geometry.js';
import { GRID_BITS, MAX_TARGET, targetToValue } from '../engine/bits.js';
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
  // any GRID_BITS. The operator control sits high, the digit row sits low.
  let cmpUi = null;
  if (isCmp) {
    const centerX = node.x + width / 2;
    const opW = 34;
    const opH = 28;
    const opY = node.y + 12;

    // The operator control and the up/down stepper sit side by side, centered
    // as one group so the header stays balanced in the block.
    const stepW = 18;
    const stepGap = 6;
    const groupW = opW + stepGap + stepW;
    const opX = centerX - groupW / 2;

    const cellW = 18;
    const cellH = 24;
    const gap = 4;
    const rowW = GRID_BITS * cellW + (GRID_BITS - 1) * gap;
    const rowX = centerX - rowW / 2;
    const rowY = node.y + height - 12 - cellH;

    const target = Array.isArray(node.target) ? node.target : [];
    const op = node.op || 'LT';

    // Up/down stepper: a small arrow pair stacked to the right of the operator
    // control. It steps the whole constant by one, so it dims at each bound.
    const value = targetToValue(target);
    const atMax = value >= MAX_TARGET;
    const atMin = value <= 0;
    const stepH = opH / 2;
    const stepX = opX + opW + stepGap;
    const upY = opY;
    const downY = opY + stepH;

    cmpUi = {
      centerX, opW, opH, opX, opY, cellW, cellH, gap, rowW, rowX, rowY, target, op,
      atMax, atMin, stepW, stepH, stepX, upY, downY,
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
              clamped at the ends. Each arrow stops the pointerdown so a click
              never starts a node drag, and dims once its bound is reached. */}
          <g
            className={cmpUi.atMax ? 'cmp-step disabled' : 'cmp-step'}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (!cmpUi.atMax) onStepTarget(node.id, 1);
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
            className={cmpUi.atMin ? 'cmp-step disabled' : 'cmp-step'}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              if (!cmpUi.atMin) onStepTarget(node.id, -1);
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
          {/* Binary constant: high bit on the LEFT to match the LED readout.
              Cell j shows bit index GRID_BITS-1-j; clicking it toggles it. */}
          {Array.from({ length: GRID_BITS }, (_, j) => {
            const bit = GRID_BITS - 1 - j;
            const on = cmpUi.target[bit] ? 1 : 0;
            const cellX = cmpUi.rowX + j * (cmpUi.cellW + cmpUi.gap);
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
                  x={cellX}
                  y={cmpUi.rowY}
                  width={cmpUi.cellW}
                  height={cmpUi.cellH}
                  rx={2}
                  className="cmp-digit-box"
                />
                <text
                  x={cellX + cmpUi.cellW / 2}
                  y={cmpUi.rowY + cmpUi.cellH / 2}
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
