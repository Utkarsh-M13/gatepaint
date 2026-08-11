// The in-browser store for earned level progress. A single localStorage key
// holds a JSON object keyed by level id, each value { star, gated } booleans.
// Like savedStore, everything here is pure of React and tolerant of junk: a
// malformed store or entry is dropped rather than thrown, so a bad value can
// never crash the app. A badge, once earned, is never un-earned.

export const PROGRESS_KEY = 'gatepaint.progress.v1';

// Resolves the storage to use. Callers may pass their own (the tests pass a
// small in-memory shim); otherwise the real localStorage is used when it
// exists, and a no-op store is returned when it does not (e.g. SSR).
function resolveStorage(storage) {
  if (storage) return storage;
  try {
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    // Access to localStorage can throw in locked-down contexts.
  }
  return { getItem: () => null, setItem: () => {} };
}

// One badge record must be an object of two booleans. Anything else is
// malformed and the whole entry is dropped.
export function isValidProgressEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
  return typeof entry.star === 'boolean' && typeof entry.gated === 'boolean';
}

// Reads the store, keeping only well-formed { star, gated } entries. Never
// throws: a missing key, non-JSON, a non-object, or a bad entry all resolve to
// an empty (or partial) map.
export function loadProgress(storage) {
  const store = resolveStorage(storage);
  let raw;
  try {
    raw = store.getItem(PROGRESS_KEY);
  } catch {
    return {};
  }
  if (!raw) return {};
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  const clean = {};
  for (const key of Object.keys(parsed)) {
    if (isValidProgressEntry(parsed[key])) {
      clean[key] = { star: parsed[key].star, gated: parsed[key].gated };
    }
  }
  return clean;
}

// Overwrites the store with the given map. Best-effort: a storage failure
// (quota, private mode) is swallowed so the UI still updates in memory.
export function writeProgress(map, storage) {
  const store = resolveStorage(storage);
  try {
    store.setItem(PROGRESS_KEY, JSON.stringify(map));
  } catch {
    // Nothing more we can do; the caller keeps its in-memory copy.
  }
}

// Merges a win into the store: a badge stays earned once set, so the new
// record is the OR of what was stored and what was just earned. Returns the
// new full map. `earned` is a partial { star, gated }.
export function recordWin(levelId, earned, storage) {
  const current = loadProgress(storage);
  const prev = current[levelId] || { star: false, gated: false };
  const next = {
    ...current,
    [levelId]: {
      star: prev.star || !!(earned && earned.star),
      gated: prev.gated || !!(earned && earned.gated),
    },
  };
  writeProgress(next, storage);
  return next;
}
