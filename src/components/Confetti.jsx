import { useEffect, useRef } from 'react';

// A short, self-contained confetti burst. Renders a full-screen canvas
// overlay, animates a spreading/falling particle burst for a bit under two
// seconds, then removes itself entirely: the rAF loop stops and the canvas
// unmounts, leaving no leftover DOM or running loop behind.
//
// Props:
//   gated   - whether to run the bigger, two-color (amber + blue) flourish
//             instead of the plain amber burst.
//   onDone  - called once the animation finishes, so the parent can drop
//             this component from the tree.

const AMBER = '#e8a15c';
const BLUE = '#5c9be8';

const STAR_PARTICLES = 60;
const GATED_PARTICLES = 120;
const STAR_DURATION_MS = 1300;
const GATED_DURATION_MS = 1800;

const GRAVITY = 0.12;
const DRAG = 0.995;

function makeParticles(count, colors, width, height) {
  const originX = width / 2;
  const originY = height * 0.35;
  const particles = [];
  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 3 + Math.random() * 7;
    particles.push({
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 3,
      size: 3 + Math.random() * 4,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * Math.PI,
      spin: (Math.random() - 0.5) * 0.3,
      life: 1,
    });
  }
  return particles;
}

function Confetti({ gated, onDone }) {
  const canvasRef = useRef(null);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');

    const width = window.innerWidth;
    const height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    const colors = gated ? [AMBER, AMBER, BLUE] : [AMBER];
    const count = gated ? GATED_PARTICLES : STAR_PARTICLES;
    const duration = gated ? GATED_DURATION_MS : STAR_DURATION_MS;
    const particles = makeParticles(count, colors, width, height);

    let rafId = null;
    let cancelled = false;
    const start = performance.now();

    function frame(now) {
      if (cancelled) return;
      const elapsed = now - start;
      const t = elapsed / duration;

      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        p.vy += GRAVITY;
        p.vx *= DRAG;
        p.vy *= DRAG;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.spin;
        // Fade out over the back half of the burst.
        p.life = t < 0.5 ? 1 : Math.max(0, 1 - (t - 0.5) / 0.5);

        ctx.save();
        ctx.globalAlpha = p.life;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      }

      if (elapsed < duration) {
        rafId = requestAnimationFrame(frame);
      } else {
        ctx.clearRect(0, 0, width, height);
        onDoneRef.current?.();
      }
    }

    rafId = requestAnimationFrame(frame);

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, [gated]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 9999,
      }}
    />
  );
}

export default Confetti;
