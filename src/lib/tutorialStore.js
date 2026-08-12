// The in-browser flag that records whether the first-run tutorial has been
// seen. A single localStorage key holds the string "1" once the tutorial is
// finished or skipped. Like savedStore and progressStore, everything here is
// pure of React and tolerant of junk: a missing key, a locked-down storage, or
// a bad value all resolve to "not seen" rather than throwing, so a bad value
// can never crash the app or wrongly suppress the tutorial.

export const TUTORIAL_KEY = 'gatepaint.tutorial.v1';

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

// True once the tutorial has been marked seen. Never throws: any read failure
// resolves to false, so the tutorial simply auto-runs again rather than
// crashing.
export function isTutorialSeen(storage) {
  const store = resolveStorage(storage);
  try {
    return store.getItem(TUTORIAL_KEY) === '1';
  } catch {
    return false;
  }
}

// Records that the tutorial has been seen. Best-effort: a storage failure
// (quota, private mode) is swallowed so closing the tutorial still works.
export function markTutorialSeen(storage) {
  const store = resolveStorage(storage);
  try {
    store.setItem(TUTORIAL_KEY, '1');
  } catch {
    // Nothing more we can do; the tutorial just may auto-run again next time.
  }
}
