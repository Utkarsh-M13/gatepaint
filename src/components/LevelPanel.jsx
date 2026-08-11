import CircuitThumbnail from './CircuitThumbnail.jsx';

// A star glyph (the "solved" badge) and a gate glyph (the "gated" badge),
// drawn inline so they light up or dim without any image assets. `lit` fills
// the shape with its color; otherwise it draws a dim outline.
function StarIcon({ lit }) {
  return (
    <svg viewBox="0 0 24 24" className="badge-icon" aria-hidden="true">
      <path
        d="M12 2.5l2.9 5.9 6.5.95-4.7 4.58 1.11 6.47L12 17.9l-5.81 3.06 1.11-6.47-4.7-4.58 6.5-.95z"
        fill={lit ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GatedIcon({ lit }) {
  // A simple AND-gate silhouette: flat left edge, rounded right.
  return (
    <svg viewBox="0 0 24 24" className="badge-icon" aria-hidden="true">
      <path
        d="M5 4h6a8 8 0 0 1 0 16H5z"
        fill={lit ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// The two win badges. `star` and `gated` are booleans for whether each is
// earned. Reused by the Level panel and the level selector cards.
export function WinBadges({ star, gated, size = 'normal' }) {
  return (
    <div className={`win-badges${size === 'small' ? ' win-badges-small' : ''}`}>
      <span className={`win-badge win-badge-star${star ? ' is-earned' : ''}`}>
        <StarIcon lit={star} />
        <span className="win-badge-label">solved</span>
      </span>
      <span className={`win-badge win-badge-gated${gated ? ' is-earned' : ''}`}>
        <GatedIcon lit={gated} />
        <span className="win-badge-label">gated</span>
      </span>
    </div>
  );
}

// The Levels-page sidebar, in the slot the Gallery holds on the sandbox page.
// Shows the current level name with prev/next arrows, the target painting, the
// win badges, a live match indicator, and the teaching hint.
//
//   level   the active level ({ id, name, hint, solution })
//   index   its 0-based position, total the campaign size
//   earned  the persisted { star, gated } for this level (badges stay lit once
//           earned even if the player later breaks the circuit)
//   live    the live result { solved, gated, matched, total } of the current
//           workspace circuit against this level's target
function LevelPanel({ level, index, total, earned, live, onPrev, onNext }) {
  const atFirst = index <= 0;
  const atLast = index >= total - 1;

  return (
    <section className="panel level-panel">
      <div className="panel-title level-title">
        <span className="level-title-text">Level</span>
        <span className="level-count">
          {index + 1} of {total}
        </span>
      </div>
      <div className="panel-body level-body">
        <div className="level-pager">
          <button
            type="button"
            className="level-arrow"
            onClick={onPrev}
            disabled={atFirst}
            aria-label="Previous level"
            title="Previous level"
          >
            &lsaquo;
          </button>
          <span className="level-name">{level.name}</span>
          <button
            type="button"
            className="level-arrow"
            onClick={onNext}
            disabled={atLast}
            aria-label="Next level"
            title="Next level"
          >
            &rsaquo;
          </button>
        </div>

        <div className="level-target">
          <span className="level-target-cap">Target</span>
          <CircuitThumbnail circuit={level.solution} size={168} />
        </div>

        <WinBadges star={earned.star} gated={earned.gated} />

        <div className={`level-status${live.solved ? ' is-solved' : ''}`}>
          {live.solved ? 'SOLVED' : `${live.matched} / ${live.total} pixels`}
        </div>

        <p className="level-hint">{level.hint}</p>
      </div>
    </section>
  );
}

export default LevelPanel;
