import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { TUTORIAL_STEPS } from '../lib/tutorialSteps.js';

// The gap kept between a highlighted target and the instruction bubble, and
// the margin the bubble keeps from the viewport edges so it never overflows.
const BUBBLE_GAP = 14;
const EDGE_MARGIN = 12;
// The ring is drawn a little larger than the target so the target reads as
// "inside" the highlight rather than tight against its border.
const RING_PAD = 6;

// Reads the on-screen rectangle of the element tagged with the given
// data-tutorial value, or null when it is not on the page. Null is a normal
// case (a target that has not mounted): the caller degrades to a centered
// bubble with no ring rather than crashing.
function measureTarget(target) {
  if (typeof document === 'undefined' || !target) return null;
  const el = document.querySelector(`[data-tutorial="${target}"]`);
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return null;
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

// A NON-MODAL guided overlay. The dim layer and the highlight ring never
// capture pointer events, so the user drags and clicks in the real app
// underneath to complete each step; only the bubble's own controls take
// clicks. Action steps advance off the live nodes/wires passed in as props;
// info steps advance on their button. Closing or finishing marks it seen (the
// parent's onClose does that).
function Tutorial({ nodes, wires, onClose, onOpenNumber }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const bubbleRef = useRef(null);
  const [bubblePos, setBubblePos] = useState(null);

  const step = TUTORIAL_STEPS[stepIndex];
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1;

  const goNext = useCallback(() => {
    setStepIndex((i) => Math.min(i + 1, TUTORIAL_STEPS.length - 1));
  }, []);

  // Advance an info step's button, or finish on the last step. The final step
  // hands off to the "how the number works" explainer, so its button opens
  // that and then closes the tutorial.
  function handlePrimary() {
    if (isLast) {
      if (step.openNumber && onOpenNumber) onOpenNumber();
      onClose();
    } else {
      goNext();
    }
  }

  // Escape dismisses the tutorial. Captured so it wins over the app-wide
  // Escape handler (file menu, wiring, selection) while the tutorial is open,
  // the same trick NumberExplainer and LevelSelector use: a capture-phase
  // listener on window runs before App's own bubble-phase Escape effect.
  useEffect(() => {
    function handleKey(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
    }
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [onClose]);

  // Auto-advance an action step the moment its predicate turns true against the
  // live circuit. If the predicate is already satisfied on arrival, this fires
  // immediately, which is fine (a replay over an already-built circuit just
  // skips ahead). Info steps have no predicate and wait for the button.
  useEffect(() => {
    if (step.advance !== 'auto' || typeof step.predicate !== 'function') return;
    if (step.predicate(nodes, wires)) goNext();
  }, [step, nodes, wires, goNext]);

  // Measure the current step's target on step change, and re-measure on resize
  // and whenever the circuit changes (a newly dropped gate or a moved OUTPUT
  // shifts the layout). A missing target leaves rect null so the bubble
  // centers with no ring.
  useLayoutEffect(() => {
    function remeasure() {
      setRect(measureTarget(step.target));
    }
    remeasure();
    window.addEventListener('resize', remeasure);
    return () => window.removeEventListener('resize', remeasure);
  }, [step, nodes, wires]);

  // Place the bubble next to the ring once both the target rect and the
  // bubble's own measured size are known, clamped inside the viewport so it
  // never overflows the page. With no target rect the bubble is centered.
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    const bw = el.offsetWidth;
    const bh = el.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const clamp = (v, min, max) => Math.min(Math.max(v, min), Math.max(min, max));

    if (!rect) {
      setBubblePos({
        left: clamp((vw - bw) / 2, EDGE_MARGIN, vw - bw - EDGE_MARGIN),
        top: clamp((vh - bh) / 2, EDGE_MARGIN, vh - bh - EDGE_MARGIN),
      });
      return;
    }

    // Prefer below the target; flip above when there is no room. Prefer the
    // target's left edge; when the target sits on the left (like the palette),
    // put the bubble to its right instead so it does not cover it.
    const spaceBelow = vh - (rect.top + rect.height);
    let top =
      spaceBelow >= bh + BUBBLE_GAP + EDGE_MARGIN
        ? rect.top + rect.height + BUBBLE_GAP
        : rect.top - bh - BUBBLE_GAP;

    let left;
    if (rect.left + rect.width + BUBBLE_GAP + bw + EDGE_MARGIN <= vw && rect.width < bw) {
      left = rect.left + rect.width + BUBBLE_GAP;
      top = rect.top;
    } else {
      left = rect.left;
    }

    setBubblePos({
      left: clamp(left, EDGE_MARGIN, vw - bw - EDGE_MARGIN),
      top: clamp(top, EDGE_MARGIN, vh - bh - EDGE_MARGIN),
    });
  }, [rect, step]);

  const ringStyle = rect
    ? {
        left: rect.left - RING_PAD,
        top: rect.top - RING_PAD,
        width: rect.width + RING_PAD * 2,
        height: rect.height + RING_PAD * 2,
      }
    : null;

  return (
    <div className="tutorial-layer">
      {/* Dim backdrop. pointer-events: none (in CSS) so every click and drag
          falls through to the real app underneath. */}
      <div className="tutorial-dim" />
      {ringStyle && <div className="tutorial-ring" style={ringStyle} />}
      <div
        ref={bubbleRef}
        className="tutorial-bubble"
        role="dialog"
        aria-label="Tutorial"
        style={
          bubblePos
            ? { left: bubblePos.left, top: bubblePos.top }
            : // Pre-measurement: park it off-view so it does not flash at 0,0.
              { left: -9999, top: -9999 }
        }
      >
        <button
          type="button"
          className="tutorial-close"
          aria-label="Close tutorial"
          onClick={onClose}
        >
          &times;
        </button>
        <div className="tutorial-step-count">
          Step {stepIndex + 1} of {TUTORIAL_STEPS.length}
        </div>
        <p className="tutorial-body">{step.body}</p>
        <div className="tutorial-actions">
          {step.advance === 'button' ? (
            <button type="button" className="tutorial-btn tutorial-btn-primary" onClick={handlePrimary}>
              {step.buttonLabel || (isLast ? 'Done' : 'Next')}
            </button>
          ) : (
            <button type="button" className="tutorial-btn tutorial-btn-skip" onClick={goNext}>
              Skip
            </button>
          )}
          {!isLast && (
            <button type="button" className="tutorial-link" onClick={onClose}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default Tutorial;
