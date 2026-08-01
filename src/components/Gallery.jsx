import { useEffect, useMemo, useState } from 'react';
import CircuitThumbnail from './CircuitThumbnail.jsx';
import { FEATURED_CIRCUITS } from '../featured.js';
import { loadSaved, saveCircuit, deleteSaved } from '../lib/savedStore.js';

// How many thumbnails fit on one page of a tab (a 2x2 grid).
const PAGE_SIZE = 4;

const TABS = [
  { id: 'new', label: 'New' },
  { id: 'saved', label: 'Saved' },
  { id: 'featured', label: 'Featured' },
];

// One 2x2 page of thumbnails with pagination beneath it. Each thumbnail opens
// the enlarged view. Shared by the Saved and Featured tabs.
function ThumbGrid({ items, page, pageCount, onPage, onOpen }) {
  const start = page * PAGE_SIZE;
  const shown = items.slice(start, start + PAGE_SIZE);

  return (
    <>
      <div className="gallery-grid">
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
      {pageCount > 1 && (
        <div className="gallery-pager">
          <button
            type="button"
            className="gallery-page-btn"
            onClick={() => onPage(page - 1)}
            disabled={page === 0}
            aria-label="Previous page"
          >
            &lsaquo;
          </button>
          <span className="gallery-page-label">
            page {page + 1} of {pageCount}
          </span>
          <button
            type="button"
            className="gallery-page-btn"
            onClick={() => onPage(page + 1)}
            disabled={page >= pageCount - 1}
            aria-label="Next page"
          >
            &rsaquo;
          </button>
        </div>
      )}
    </>
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

  const items = tab === 'featured' ? FEATURED_CIRCUITS : tab === 'saved' ? saved : [];
  const pageCount = Math.max(1, Math.ceil(items.length / PAGE_SIZE));

  // Keep the page in range when the tab or the item count changes (e.g. a
  // delete emptied the last page).
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
    setPage(Math.ceil(next.length / PAGE_SIZE) - 1);
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
              pageCount={pageCount}
              onPage={setPage}
              onOpen={(entry) => setSelected({ entry, source: 'saved' })}
            />
          )}
          {tab === 'featured' && (
            <ThumbGrid
              items={FEATURED_CIRCUITS}
              page={page}
              pageCount={pageCount}
              onPage={setPage}
              onOpen={(entry) => setSelected({ entry, source: 'featured' })}
            />
          )}
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
