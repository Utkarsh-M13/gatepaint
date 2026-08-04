import { describe, it, expect } from 'vitest';
import {
  zoomAboutPoint,
  projectPointToRectEdge,
  getOffscreenIndicator,
  findPinAtPoint,
  findGateAtPoint,
  getOutputPinPos,
  getInputPinPos,
  getHomePan,
  OUTPUT_HOME,
  OUTPUT_SIZE,
  HOME_OUTPUT_VIEW_FRACTION,
  WORLD_WIDTH,
  WORLD_HEIGHT,
} from './geometry.js';

describe('zoomAboutPoint', () => {
  it('keeps the point under the cursor fixed', () => {
    const cx = 100;
    const cy = 50;
    const start = { zoom: 1, pan: { x: 0, y: 0 } };
    const next = zoomAboutPoint(start.zoom, start.pan, 2, cx, cy, 0.4, 2.5);
    // The workspace point under the cursor before and after must match.
    const wBefore = { x: (cx - start.pan.x) / start.zoom, y: (cy - start.pan.y) / start.zoom };
    const wAfter = { x: (cx - next.pan.x) / next.zoom, y: (cy - next.pan.y) / next.zoom };
    expect(wAfter.x).toBeCloseTo(wBefore.x);
    expect(wAfter.y).toBeCloseTo(wBefore.y);
    expect(next.zoom).toBe(2);
  });

  it('returns the same pan/zoom when the clamp pins the scale', () => {
    const pan = { x: 5, y: 7 };
    const res = zoomAboutPoint(2.5, pan, 2, 0, 0, 0.4, 2.5);
    expect(res.zoom).toBe(2.5);
    expect(res.pan).toBe(pan);
  });
});

describe('getHomePan', () => {
  it('frames OUTPUT at the home fraction, vertically centered', () => {
    const view = { width: 1000, height: 600 };
    const pan = getHomePan(view, 1);
    const cx = OUTPUT_HOME.x + OUTPUT_SIZE.width / 2;
    const cy = OUTPUT_HOME.y + OUTPUT_SIZE.height / 2;
    // Project OUTPUT's center through the home pan into screen space; it should
    // land at the framed fraction across the view, vertically centered.
    const screenX = pan.x + 1 * cx;
    const screenY = pan.y + 1 * cy;
    expect(screenX).toBeCloseTo(view.width * HOME_OUTPUT_VIEW_FRACTION);
    expect(screenY).toBeCloseTo(view.height / 2);
  });

  it('keeps OUTPUT inside the view at the home framing', () => {
    const view = { width: 900, height: 520 };
    const pan = getHomePan(view, 1);
    const left = pan.x + OUTPUT_HOME.x;
    const top = pan.y + OUTPUT_HOME.y;
    expect(left).toBeGreaterThanOrEqual(0);
    expect(left + OUTPUT_SIZE.width).toBeLessThanOrEqual(view.width);
    expect(top).toBeGreaterThanOrEqual(0);
    expect(top + OUTPUT_SIZE.height).toBeLessThanOrEqual(view.height);
  });

  it('places OUTPUT_HOME well inside the world, not in a corner', () => {
    expect(OUTPUT_HOME.x).toBeGreaterThan(WORLD_WIDTH * 0.4);
    expect(OUTPUT_HOME.x + OUTPUT_SIZE.width).toBeLessThan(WORLD_WIDTH);
    expect(OUTPUT_HOME.y).toBeGreaterThan(0);
    expect(OUTPUT_HOME.y + OUTPUT_SIZE.height).toBeLessThan(WORLD_HEIGHT);
  });
});

describe('projectPointToRectEdge', () => {
  const rect = { x: 0, y: 0, width: 200, height: 100 };

  it('lands on the right border for a point off to the right', () => {
    const p = projectPointToRectEdge(100, 50, 500, 50, rect, 0);
    expect(p.x).toBeCloseTo(200);
    expect(p.y).toBeCloseTo(50);
  });

  it('respects the inset margin', () => {
    const p = projectPointToRectEdge(100, 50, 100, 500, rect, 10);
    expect(p.y).toBeCloseTo(90);
    expect(p.x).toBeCloseTo(100);
  });
});

describe('getOffscreenIndicator', () => {
  const view = { width: 200, height: 100 };

  it('returns null when the node box is on screen', () => {
    const node = { type: 'OUTPUT', x: 50, y: 30 };
    expect(getOffscreenIndicator(node, { x: 0, y: 0 }, 1, view)).toBeNull();
  });

  it('returns an edge point and angle when the node is off screen', () => {
    // Push OUTPUT far to the right of the panel via pan.
    const node = { type: 'OUTPUT', x: 50, y: 30 };
    const ind = getOffscreenIndicator(node, { x: 400, y: 0 }, 1, view);
    expect(ind).not.toBeNull();
    // Pinned to the inset right border, angle points rightward (near 0 deg).
    expect(ind.x).toBeGreaterThan(view.width - 40);
    expect(Math.abs(ind.angle)).toBeLessThan(45);
  });
});

describe('findPinAtPoint', () => {
  const and = { id: 'g1', type: 'AND', x: 100, y: 100 };
  const out = { id: 'out', type: 'OUTPUT', x: 300, y: 100 };
  const nodes = [and, out];

  it('resolves a point near an output pin to that pin', () => {
    const p = getOutputPinPos(and);
    const hit = findPinAtPoint(nodes, { x: p.x + 2, y: p.y - 2 });
    expect(hit).toEqual({ nodeId: 'g1', kind: 'output', port: null });
  });

  it('resolves a point near an input pin to that port', () => {
    const p = getInputPinPos(and, 1);
    const hit = findPinAtPoint(nodes, { x: p.x + 1, y: p.y + 1 });
    expect(hit).toEqual({ nodeId: 'g1', kind: 'input', port: 1 });
  });

  it('returns null when no pin is within the radius', () => {
    expect(findPinAtPoint(nodes, { x: 5, y: 5 })).toBeNull();
  });

  it('never reports an output pin for the OUTPUT node', () => {
    // Right at OUTPUT's would-be output pin position, only its input matches.
    const p = getOutputPinPos(out);
    const hit = findPinAtPoint(nodes, { x: p.x, y: p.y });
    expect(hit === null || hit.kind === 'input').toBe(true);
  });
});

describe('findGateAtPoint', () => {
  const and = { id: 'g1', type: 'AND', x: 100, y: 100 };
  const not = { id: 'g2', type: 'NOT', x: 100, y: 100 };
  const input = { id: 'in', type: 'INPUT', x: 100, y: 100 };

  it('returns the gate whose box contains the point', () => {
    const hit = findGateAtPoint([and], { x: 120, y: 120 });
    expect(hit.id).toBe('g1');
  });

  it('returns the topmost (last drawn) gate when they overlap', () => {
    const hit = findGateAtPoint([and, not], { x: 120, y: 120 });
    expect(hit.id).toBe('g2');
  });

  it('ignores INPUT and OUTPUT nodes', () => {
    expect(findGateAtPoint([input], { x: 120, y: 120 })).toBeNull();
  });

  it('returns null when the point is outside every gate box', () => {
    expect(findGateAtPoint([and], { x: 10, y: 10 })).toBeNull();
  });
});
