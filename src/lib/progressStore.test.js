import { describe, it, expect } from 'vitest';
import {
  PROGRESS_KEY,
  isValidProgressEntry,
  loadProgress,
  writeProgress,
  recordWin,
} from './progressStore.js';

// A tiny in-memory localStorage stand-in, like savedStore.test.js uses.
function makeStorage(initial) {
  const map = new Map();
  if (initial !== undefined) map.set(PROGRESS_KEY, initial);
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    _raw: () => map.get(PROGRESS_KEY),
  };
}

describe('isValidProgressEntry', () => {
  it('accepts a { star, gated } pair of booleans', () => {
    expect(isValidProgressEntry({ star: true, gated: false })).toBe(true);
  });

  it('rejects non-objects and bad shapes', () => {
    expect(isValidProgressEntry(null)).toBe(false);
    expect(isValidProgressEntry([])).toBe(false);
    expect(isValidProgressEntry({ star: 1, gated: false })).toBe(false);
    expect(isValidProgressEntry({ star: true })).toBe(false);
  });
});

describe('loadProgress', () => {
  it('returns an empty map for a missing key', () => {
    expect(loadProgress(makeStorage())).toEqual({});
  });

  it('returns an empty map for non-JSON', () => {
    expect(loadProgress(makeStorage('not json'))).toEqual({});
  });

  it('returns an empty map for a non-object (array)', () => {
    expect(loadProgress(makeStorage('[1,2,3]'))).toEqual({});
  });

  it('drops malformed entries but keeps the good ones', () => {
    const raw = JSON.stringify({
      a: { star: true, gated: false },
      b: { star: 'yes', gated: false },
      c: { star: false, gated: true },
      d: null,
    });
    expect(loadProgress(makeStorage(raw))).toEqual({
      a: { star: true, gated: false },
      c: { star: false, gated: true },
    });
  });
});

describe('writeProgress + loadProgress round-trip', () => {
  it('reads back exactly what was written', () => {
    const storage = makeStorage();
    const map = {
      lvl1: { star: true, gated: true },
      lvl2: { star: true, gated: false },
    };
    writeProgress(map, storage);
    expect(loadProgress(storage)).toEqual(map);
  });
});

describe('recordWin', () => {
  it('creates an entry the first time a level is won', () => {
    const storage = makeStorage();
    const next = recordWin('lvl1', { star: true, gated: false }, storage);
    expect(next.lvl1).toEqual({ star: true, gated: false });
    expect(loadProgress(storage).lvl1).toEqual({ star: true, gated: false });
  });

  it('never un-earns a badge already held (OR-merges)', () => {
    const storage = makeStorage();
    recordWin('lvl1', { star: true, gated: true }, storage);
    // A later solve that breaks the gated condition must not clear it.
    const next = recordWin('lvl1', { star: true, gated: false }, storage);
    expect(next.lvl1).toEqual({ star: true, gated: true });
  });

  it('adds the gated badge on a later, cleaner solve', () => {
    const storage = makeStorage();
    recordWin('lvl1', { star: true, gated: false }, storage);
    const next = recordWin('lvl1', { star: true, gated: true }, storage);
    expect(next.lvl1).toEqual({ star: true, gated: true });
  });

  it('keeps other levels untouched', () => {
    const storage = makeStorage();
    recordWin('lvl1', { star: true, gated: false }, storage);
    const next = recordWin('lvl2', { star: true, gated: true }, storage);
    expect(next.lvl1).toEqual({ star: true, gated: false });
    expect(next.lvl2).toEqual({ star: true, gated: true });
  });
});
