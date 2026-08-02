import { useEffect, useRef } from 'react';
import { KNOWN_NODE_TYPES } from '../circuits.js';
import { GRID_SIZE, GRID_BITS, bitsOf } from '../engine/bits.js';
import { evaluate } from '../engine/evaluate.js';
import { isValidCmpNode } from '../lib/savedStore.js';

// Blurs the button after a click so focus never lingers on it. Buttons and
// the hidden file input are the only focusable elements this bar adds, and
// none of them should eat the app's D/Delete keyboard shortcut afterward.
function blurTarget(event) {
  event.currentTarget.blur();
}

// Minimal shape check for a loaded circuit file. Anything that fails this
// is rejected outright rather than partially applied, so a bad load never
// leaves the workspace half-replaced.
function isValidCircuit(data) {
  if (!data || typeof data !== 'object') return false;
  if (!Array.isArray(data.nodes) || !Array.isArray(data.wires)) return false;

  const ids = new Set();
  for (const node of data.nodes) {
    if (!node || typeof node.id !== 'string') return false;
    if (!KNOWN_NODE_TYPES.has(node.type)) return false;
    if (node.type === 'CMP' && !isValidCmpNode(node)) return false;
    ids.add(node.id);
  }
  for (const wire of data.wires) {
    if (!wire || typeof wire.id !== 'string') return false;
    if (!ids.has(wire.from) || !ids.has(wire.to)) return false;
    if (!Number.isInteger(wire.toPort) || wire.toPort < 0 || wire.toPort >= GRID_BITS) {
      return false;
    }
  }
  return true;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

const CELL_PX = 32;

// Renders the same on/off pixels the OutputCanvas shows into an offscreen
// canvas at CELL_PX per cell, then exports that as a PNG. Uses the same
// evaluate + bitsOf pass the live canvas uses, just at a bigger scale.
function renderPng(nodes, wires) {
  const canvas = document.createElement('canvas');
  canvas.width = GRID_SIZE * CELL_PX;
  canvas.height = GRID_SIZE * CELL_PX;
  const ctx = canvas.getContext('2d');

  const styles = getComputedStyle(document.documentElement);
  const paintColor = styles.getPropertyValue('--paint').trim() || '#e8a15c';
  const bgColor = styles.getPropertyValue('--bg').trim() || '#0b0a09';

  for (let y = 0; y < GRID_SIZE; y += 1) {
    for (let x = 0; x < GRID_SIZE; x += 1) {
      const on = evaluate(nodes, wires, bitsOf(x, y));
      ctx.fillStyle = on ? paintColor : bgColor;
      ctx.fillRect(x * CELL_PX, y * CELL_PX, CELL_PX, CELL_PX);
    }
  }

  return canvas.toDataURL('image/png');
}

// Slim classic-style menubar above the three-panel grid: app name on the
// left, a text File menu next to it holding New/Save/Load/Export. Has no
// state of its own beyond the file input ref; the menu's open/closed state
// is lifted up to App so the app-wide Escape handler can close the menu with
// priority over wiring/selection.
function TopBar({
  nodes,
  wires,
  hasContent,
  onNew,
  onLoadCircuit,
  menuOpen,
  onMenuOpenChange,
}) {
  const fileInputRef = useRef(null);
  const menuWrapRef = useRef(null);

  // Closes the menu on any pointerdown outside the File button/menu. Escape
  // is handled by App, not here, so the menu also closes with the app-wide
  // priority Escape gives it.
  useEffect(() => {
    if (!menuOpen) return undefined;
    function handlePointerDown(event) {
      if (menuWrapRef.current && !menuWrapRef.current.contains(event.target)) {
        onMenuOpenChange(false);
      }
    }
    window.addEventListener('pointerdown', handlePointerDown);
    return () => window.removeEventListener('pointerdown', handlePointerDown);
  }, [menuOpen, onMenuOpenChange]);

  function handleFileButtonClick(event) {
    blurTarget(event);
    onMenuOpenChange(!menuOpen);
  }

  function handleNewClick(event) {
    blurTarget(event);
    onMenuOpenChange(false);
    if (hasContent && !window.confirm('Clear the current circuit?')) return;
    onNew();
  }

  function handleSaveClick(event) {
    blurTarget(event);
    onMenuOpenChange(false);
    const data = JSON.stringify({ nodes, wires }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    downloadBlob(blob, 'gatepaint-circuit.json');
  }

  function handleLoadClick(event) {
    blurTarget(event);
    onMenuOpenChange(false);
    fileInputRef.current?.click();
  }

  async function handleFileChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!isValidCircuit(data)) {
        window.alert('That file is not a valid GatePaint circuit.');
        return;
      }
      onLoadCircuit(data);
    } catch {
      window.alert('That file is not a valid GatePaint circuit.');
    }
  }

  function handleExportClick(event) {
    blurTarget(event);
    onMenuOpenChange(false);
    const dataUrl = renderPng(nodes, wires);
    const anchor = document.createElement('a');
    anchor.href = dataUrl;
    anchor.download = 'gatepaint.png';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  }

  return (
    <header className="top-bar">
      <span className="top-bar-title">GATEPAINT</span>
      <nav className="top-bar-menubar">
        <div className="top-bar-menu-wrap" ref={menuWrapRef}>
          <button
            type="button"
            className={`top-bar-menu-label${menuOpen ? ' is-open' : ''}`}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            onClick={handleFileButtonClick}
          >
            File
          </button>
          {menuOpen && (
            <ul className="top-bar-menu">
              <li>
                <button type="button" className="top-bar-menu-item" onClick={handleNewClick}>
                  New
                </button>
              </li>
              <li>
                <button type="button" className="top-bar-menu-item" onClick={handleSaveClick}>
                  Save
                </button>
              </li>
              <li>
                <button type="button" className="top-bar-menu-item" onClick={handleLoadClick}>
                  Load
                </button>
              </li>
              <li className="top-bar-menu-separator" role="separator">
                <button type="button" className="top-bar-menu-item" onClick={handleExportClick}>
                  Export
                </button>
              </li>
            </ul>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,application/json"
            className="top-bar-file-input"
            onChange={handleFileChange}
          />
        </div>
      </nav>
    </header>
  );
}

export default TopBar;
