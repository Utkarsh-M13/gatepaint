import { useEffect } from 'react';
import CircuitThumbnail from './CircuitThumbnail.jsx';
import { WinBadges } from './LevelPanel.jsx';

// The level-selector popup: a themed modal (same backdrop/card as the gallery
// modal) listing every campaign level as a card. Each card shows the level
// name, a small preview of the goal painting, and the earned badges. Clicking
// a card switches to the Levels page with that level active.
//
//   levels    the ordered campaign
//   progress  the persisted map { [levelId]: { star, gated } }
//   onPick    called with the chosen level index
//   onClose   dismiss without choosing
function LevelSelector({ levels, progress, onPick, onClose }) {
  // Escape closes the popup. Captured so it wins over the workspace handler
  // while the popup is open, matching how the gallery modal behaves.
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

  return (
    <div className="gallery-modal-backdrop" onClick={onClose}>
      <div
        className="gallery-modal level-selector"
        role="dialog"
        aria-label="Select a level"
        onClick={(event) => event.stopPropagation()}
      >
        <button
          type="button"
          className="gallery-modal-close"
          onClick={onClose}
          aria-label="Close"
        >
          &times;
        </button>
        <div className="level-selector-title">Levels</div>
        <div className="level-selector-grid">
          {levels.map((level, i) => {
            const earned = progress[level.id] || { star: false, gated: false };
            return (
              <button
                type="button"
                key={level.id}
                className="level-card"
                onClick={() => onPick(i)}
                title={level.name}
              >
                <span className="level-card-num">{i + 1}</span>
                <CircuitThumbnail circuit={level.solution} size={72} />
                <span className="level-card-name">{level.name}</span>
                <WinBadges star={earned.star} gated={earned.gated} size="small" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default LevelSelector;
