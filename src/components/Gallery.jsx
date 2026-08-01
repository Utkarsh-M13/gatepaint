import { useEffect, useRef, useState } from 'react';
import CircuitThumbnail from './CircuitThumbnail.jsx';
import { FEATURED_CIRCUITS } from '../featured.js';
import { loadSaved, saveCircuit, deleteSaved } from '../lib/savedStore.js';
import { computeGridCapacity } from '../lib/galleryGrid.js';

// Target footprint of one thumbnail cell (the rendered painting, its name
// label, the cell's own padding/border, and its share of the grid gap), used
// only to estimate how many cells fit. The grid itself sizes each cell to its
// natural content, so a slightly-off estimate never clips anything, it just
// under- or over-counts by a cell.
const CELL_PITCH_W = 92;
const CELL_PITCH_H = 108;

const TABS = [
  { id: 'new', label: 'New' },
  { id: 'saved', label: 'Saved' },
  { id: 'featured', label: 'Featured' },
];

// One page of thumbnails, laid out in a cols x rows grid sized to fit the
// gallery panel. Each thumbnail opens the enlarged view. Shared by the Saved
// and Featured tabs. Cells stay their natural size (max-content tracks) so a
// wide or tall panel adds room for more cells rather than stretching them.
function ThumbGrid({ items, page, cols, rows, onOpen }) {
  const pageSize = Math.max(1, cols * rows);
  const start = page * pageSize;
  const shown = items.slice(start, start + pageSize);

  return (
    <div
      className="gallery-grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, max-content)`,
        gridTemplateRows: `repeat(${rows}, max-content)`,
      }}
    >
      {shown.map((entry) => (
        <button
          type="button"
          key={entry.id}
          className="gallery-cell"
          onClick={() => onOpen(entry)}
          title={entry.name}
        >
          <CircuitThumbnail circuit={entry.circuit} size={84} />
          <span className="gallery-cell-name">{entry.name}</span>
        </button>
      ))}
    </div>
  );
}

// The enlarged overlay for one circuit: a bigger render, the name, and the
// actions. Closable by the X, the backdrop, or Escape (handled by the parent).
function GalleryModal({ entry, source, onClose, onOpenInWorkspace, onDelete }) {
  return (
    <div className="gallery-modal-backdrop" onClick={onClose}>
      <div
        className="gallery-modal"
        role="dialog"
        aria-label={entry.name}
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
        <CircuitThumbnail circuit={entry.circuit} size={228} />
        <div className="gallery-modal-name">{entry.name}</div>
        <div className="gallery-modal-actions">
          <button
            type="button"
            className="gallery-action"
            onClick={() => onOpenInWorkspace(entry.circuit)}
          >
            Open in Workspace
          </button>
          {source === 'saved' && (
            <button
              type="button"
              className="gallery-action gallery-action-danger"
              onClick={() => onDelete(entry)}
            >
              Delete
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// The gallery panel. Three tabs: New (a placeholder), Saved (localStorage), and
// Featured (bundled presets). Clicking a thumbnail enlarges it; Open in
// Workspace routes back through the parent, which handles the confirm-and-load.
function Gallery({ currentCircuit, onOpenInWorkspace }) {
  const [tab, setTab] = useState('featured');
  const [page, setPage] = useState(0);
  const [saved, setSaved] = useState(() => loadSaved());
  // The enlarged entry plus which tab it came from, or null. Source decides
  // whether the Delete action shows.
  const [selected, setSelected] = useState(null);

  // The grid shell is the element that actually holds the thumbnail grid,
  // below the tabs and above the pager, so its measured size is already the
  // room left over for cells once everything else in the panel has its
  // space. A ResizeObserver keeps the column/row count in step as the panel
  // (and therefore this shell) resizes.
  const gridShellRef = useRef(null);
  const [capacity, setCapacity] = useState({ cols: 2, rows: 2 });

  useEffect(() => {
    const el = gridShellRef.current;
    if (!el) return undefined;
    function measure() {
      const { width, height } = el.getBoundingClientRect();
      setCapacity(computeGridCapacity(width, height, CELL_PITCH_W, CELL_PITCH_H));
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const items = tab === 'featured' ? FEATURED_CIRCUITS : tab === 'saved' ? saved : [];
  const pageSize = Math.max(1, capacity.cols * capacity.rows);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  // Keep the page in range when the tab, the item count, or the computed
  // page size changes (e.g. a delete emptied the last page, or the panel
  // shrank and now fits fewer thumbnails per page).
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  // Escape closes the enlarged view. Only mounted while it is open, so it never
  // competes with the workspace shortcuts otherwise.
  useEffect(() => {
    if (!selected) return undefined;
    function handleKey(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setSelected(null);
      }
    }
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [selected]);

  function selectTab(next) {
    setTab(next);
    setPage(0);
  }

  function handleSaveCurrent() {
    const defaultName = `Circuit ${saved.length + 1}`;
    const name = window.prompt('Name this circuit', defaultName);
    if (name === null) return;
    const finalName = name.trim() || defaultName;
    const next = saveCircuit(currentCircuit, finalName);
    setSaved(next);
    // Jump to the page holding the new entry so the player sees it land.
    setPage(Math.ceil(next.length / pageSize) - 1);
  }

  function handleDelete(entry) {
    setSaved(deleteSaved(entry.id));
    setSelected(null);
  }

  function handleOpen(circuit) {
    const opened = onOpenInWorkspace(circuit);
    // The parent returns false if the user cancelled the overwrite confirm, in
    // which case the enlarged view stays open.
    if (opened) setSelected(null);
  }

  return (
    <section className="panel gallery-panel">
      <div className="panel-title gallery-title">
        <span>Gallery</span>
        {tab === 'saved' && (
          <button
            type="button"
            className="gallery-save-btn"
            onClick={handleSaveCurrent}
            title="Save the current workspace circuit"
          >
            Save current
          </button>
        )}
      </div>
      <div className="panel-body gallery-body">
        <div className="gallery-tabs" role="tablist">
          {TABS.map((t) => (
            <button
              type="button"
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className={tab === t.id ? 'gallery-tab is-active' : 'gallery-tab'}
              onClick={() => selectTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="gallery-content">
          {/* Always mounted, tab or no tab, so it is a stable ResizeObserver
              target: its measured box is the actual room left for the grid
              once the tabs above and the pager below have taken theirs. */}
          <div className="gallery-grid-shell" ref={gridShellRef}>
            {tab === 'new' && (
              <p className="gallery-empty">
                Coming soon. Shared circuits need a backend that does not exist yet.
              </p>
            )}
            {tab === 'saved' && saved.length === 0 && (
              <p className="gallery-empty">
                No saved circuits yet. Build one, then Save current.
              </p>
            )}
            {tab === 'saved' && saved.length > 0 && (
              <ThumbGrid
                items={saved}
                page={page}
                cols={capacity.cols}
                rows={capacity.rows}
                onOpen={(entry) => setSelected({ entry, source: 'saved' })}
              />
            )}
            {tab === 'featured' && (
              <ThumbGrid
                items={FEATURED_CIRCUITS}
                page={page}
                cols={capacity.cols}
                rows={capacity.rows}
                onOpen={(entry) => setSelected({ entry, source: 'featured' })}
              />
            )}
          </div>

          {/* Space for the pager is reserved unconditionally so the grid
              shell above never resizes just because a page boundary was
              crossed; only its visibility toggles. */}
          <div
            className="gallery-pager"
            style={{ visibility: pageCount > 1 ? 'visible' : 'hidden' }}
            aria-hidden={pageCount <= 1}
          >
            <button
              type="button"
              className="gallery-page-btn"
              onClick={() => setPage((current) => current - 1)}
              disabled={page === 0}
              aria-label="Previous page"
              tabIndex={pageCount > 1 ? 0 : -1}
            >
              &lsaquo;
            </button>
            <span className="gallery-page-label">
              page {page + 1} of {pageCount}
            </span>
            <button
              type="button"
              className="gallery-page-btn"
              onClick={() => setPage((current) => current + 1)}
              disabled={page >= pageCount - 1}
              aria-label="Next page"
              tabIndex={pageCount > 1 ? 0 : -1}
            >
              &rsaquo;
            </button>
          </div>
        </div>
      </div>

      {selected && (
        <GalleryModal
          entry={selected.entry}
          source={selected.source}
          onClose={() => setSelected(null)}
          onOpenInWorkspace={handleOpen}
          onDelete={handleDelete}
        />
      )}
    </section>
  );
}

export default Gallery;
