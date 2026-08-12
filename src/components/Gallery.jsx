import { useCallback, useEffect, useRef, useState } from 'react';
import CircuitThumbnail from './CircuitThumbnail.jsx';
import { FEATURED_CIRCUITS } from '../featured.js';
import { loadSaved, saveCircuit, deleteSaved } from '../lib/savedStore.js';
import { computeGridCapacity } from '../lib/galleryGrid.js';
import {
  isConfigured,
  fetchRecentCircuits,
  publishCircuit,
} from '../lib/globalGallery.js';

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
        gridTemplateColumns: `repeat(${cols}, 92px)`,
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
          {entry.author && <span className="gallery-cell-author">{entry.author}</span>}
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
        {entry.author && <div className="gallery-modal-author">by {entry.author}</div>}
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

// The publish form: a small themed modal with a required Title and an optional
// Name. Reuses the enlarge-modal shell. The parent owns the network call and
// passes the in-flight and error state back in; this stays a controlled form.
function PublishModal({ onClose, onSubmit, busy, error }) {
  const [title, setTitle] = useState('');
  const [name, setName] = useState('');
  const canSubmit = !busy && title.trim().length > 0;

  function handleSubmit(event) {
    event.preventDefault();
    if (!canSubmit) return;
    onSubmit({ title, author: name });
  }

  return (
    <div className="gallery-modal-backdrop" onClick={busy ? undefined : onClose}>
      <form
        className="gallery-modal gallery-publish"
        role="dialog"
        aria-label="Publish circuit"
        onClick={(event) => event.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <button
          type="button"
          className="gallery-modal-close"
          onClick={onClose}
          disabled={busy}
          aria-label="Close"
        >
          &times;
        </button>
        <div className="gallery-modal-name">Publish circuit</div>
        <label className="gallery-field">
          <span className="gallery-field-label">Title</span>
          <input
            className="gallery-input"
            type="text"
            value={title}
            maxLength={60}
            autoFocus
            disabled={busy}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="gallery-field">
          <span className="gallery-field-label">Name (optional)</span>
          <input
            className="gallery-input"
            type="text"
            value={name}
            maxLength={40}
            disabled={busy}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        {error && <p className="gallery-publish-error">{error}</p>}
        <div className="gallery-modal-actions">
          <button type="submit" className="gallery-action" disabled={!canSubmit}>
            {busy ? 'Publishing...' : 'Publish'}
          </button>
          <button type="button" className="gallery-action" onClick={onClose} disabled={busy}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// The gallery panel. Three tabs: New (the community feed, backed by Supabase),
// Saved (localStorage), and Featured (bundled presets). Clicking a thumbnail
// enlarges it; Open in Workspace routes back through the parent, which handles
// the confirm-and-load.
function Gallery({ currentCircuit, onOpenInWorkspace }) {
  const [tab, setTab] = useState('featured');
  const [page, setPage] = useState(0);
  const [saved, setSaved] = useState(() => loadSaved());
  // The enlarged entry plus which tab it came from, or null. Source decides
  // whether the Delete action shows.
  const [selected, setSelected] = useState(null);

  // The global New feed. `newStatus` is one of idle | loading | error | loaded;
  // `newRows` holds the normalized, validated rows once loaded. The publish
  // form has its own open/in-flight/error state.
  const [newStatus, setNewStatus] = useState('idle');
  const [newRows, setNewRows] = useState([]);
  const [newError, setNewError] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState('');

  const configured = isConfigured();

  // Fetches the recent feed. Every row is already validated inside
  // fetchRecentCircuits, so anything that lands here is safe to render and,
  // later, to open. Errors surface as a message plus a Retry.
  const loadNew = useCallback(async () => {
    setNewStatus('loading');
    setNewError('');
    try {
      const rows = await fetchRecentCircuits({ limit: 40 });
      setNewRows(
        rows.map((row) => ({
          id: row.id,
          name: row.title,
          author: row.author,
          circuit: row.circuit,
        }))
      );
      setNewStatus('loaded');
    } catch (err) {
      setNewError(err.message || 'Something went wrong.');
      setNewStatus('error');
    }
  }, []);

  // Load the feed the first time the New tab is opened (and only when the
  // backend is configured). Manual Retry and a post-publish refresh call
  // loadNew directly.
  useEffect(() => {
    if (tab !== 'new' || !configured) return;
    if (newStatus === 'idle') loadNew();
  }, [tab, configured, newStatus, loadNew]);

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

  const items =
    tab === 'featured'
      ? FEATURED_CIRCUITS
      : tab === 'saved'
        ? saved
        : tab === 'new'
          ? newRows
          : [];
  const pageSize = Math.max(1, capacity.cols * capacity.rows);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  // Keep the page in range when the tab, the item count, or the computed
  // page size changes (e.g. a delete emptied the last page, or the panel
  // shrank and now fits fewer thumbnails per page).
  useEffect(() => {
    setPage((current) => Math.min(current, pageCount - 1));
  }, [pageCount]);

  // Escape closes whichever overlay is open: the publish form first, then the
  // enlarged view. Only mounted while one is open (and never while a publish is
  // in flight), so it does not compete with the workspace shortcuts otherwise.
  useEffect(() => {
    if (!selected && !publishOpen) return undefined;
    function handleKey(event) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        if (publishOpen) {
          if (!publishing) setPublishOpen(false);
        } else {
          setSelected(null);
        }
      }
    }
    window.addEventListener('keydown', handleKey, true);
    return () => window.removeEventListener('keydown', handleKey, true);
  }, [selected, publishOpen, publishing]);

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

  // Publishes the current workspace circuit. publishCircuit does the client-side
  // validation (title required, circuit valid and non-empty) and throws a
  // readable message on any problem, which we show in the form. On success the
  // form closes and the feed reloads so the new post appears at the top.
  async function handlePublish({ title, author }) {
    setPublishing(true);
    setPublishError('');
    try {
      await publishCircuit({ title, author, circuit: currentCircuit });
      setPublishing(false);
      setPublishOpen(false);
      setPage(0);
      loadNew();
    } catch (err) {
      setPublishing(false);
      setPublishError(err.message || 'Publish failed.');
    }
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
        {tab === 'new' && configured && (
          <button
            type="button"
            className="gallery-save-btn"
            onClick={() => {
              setPublishError('');
              setPublishOpen(true);
            }}
            title="Publish the current workspace circuit to the global gallery"
          >
            Publish current
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
            {tab === 'new' && !configured && (
              <p className="gallery-empty">Global gallery is not set up yet.</p>
            )}
            {tab === 'new' && configured && newStatus === 'loading' && (
              <p className="gallery-empty">Loading circuits...</p>
            )}
            {tab === 'new' && configured && newStatus === 'error' && (
              <div className="gallery-empty gallery-error">
                <p>{newError}</p>
                <button type="button" className="gallery-action" onClick={loadNew}>
                  Retry
                </button>
              </div>
            )}
            {tab === 'new' && configured && newStatus === 'loaded' && newRows.length === 0 && (
              <p className="gallery-empty">No circuits yet. Be the first to publish.</p>
            )}
            {tab === 'new' && configured && newStatus === 'loaded' && newRows.length > 0 && (
              <ThumbGrid
                items={newRows}
                page={page}
                cols={capacity.cols}
                rows={capacity.rows}
                onOpen={(entry) => setSelected({ entry, source: 'new' })}
              />
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

      {publishOpen && (
        <PublishModal
          onClose={() => setPublishOpen(false)}
          onSubmit={handlePublish}
          busy={publishing}
          error={publishError}
        />
      )}
    </section>
  );
}

export default Gallery;
