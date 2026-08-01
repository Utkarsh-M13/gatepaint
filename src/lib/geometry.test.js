import { describe, it, expect } from 'vitest';
import {
  zoomAboutPoint,
  projectPointToRectEdge,
  getOffscreenIndicator,
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
