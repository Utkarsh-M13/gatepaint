import { describe, it, expect } from 'vitest';
import {
  SAVED_KEY,
  isValidSavedEntry,
  loadSaved,
  writeSaved,
  saveCircuit,
  deleteSaved,
} from './savedStore.js';

// A tiny in-memory localStorage stand-in, so the store can be exercised in
// the node test environment without a real DOM.
function makeStorage(initial) {
  const map = new Map();
  if (initial !== undefined) map.set(SAVED_KEY, initial);
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    _raw: () => map.get(SAVED_KEY),
  };
}

// A minimal valid circuit: one input feeding OUTPUT.
const goodCircuit = {
  nodes: [
    { id: 'i', type: 'INPUT', label: 'x0', x: 0, y: 0 },
    { id: 'out', type: 'OUTPUT', label: 'out', x: 100, y: 0 },
  ],
  wires: [{ id: 'w1', from: 'i', to: 'out', toPort: 0 }],
};

const validEntry = {
  id: 'saved-1',
  name: 'Mine',
  savedAt: 123,
  circuit: goodCircuit,
};

describe('isValidSavedEntry', () => {
  it('accepts a well-formed entry', () => {
    expect(isValidSavedEntry(validEntry)).toBe(true);
  });

  it('rejects non-objects and missing fields', () => {
    expect(isValidSavedEntry(null)).toBe(false);
    expect(isValidSavedEntry({})).toBe(false);
    expect(isValidSavedEntry({ ...validEntry, id: 5 })).toBe(false);
    expect(isValidSavedEntry({ ...validEntry, name: undefined })).toBe(false);
    expect(isValidSavedEntry({ ...validEntry, savedAt: 'nope' })).toBe(false);
  });

  it('rejects an entry whose circuit is malformed', () => {
    expect(isValidSavedEntry({ ...validEntry, circuit: null })).toBe(false);
    const badType = {
      ...validEntry,
      circuit: { nodes: [{ id: 'a', type: 'BOGUS' }], wires: [] },
    };
    expect(isValidSavedEntry(badType)).toBe(false);
    const danglingWire = {
      ...validEntry,
      circuit: { nodes: goodCircuit.nodes, wires: [{ id: 'w', from: 'x', to: 'out', toPort: 0 }] },
    };
    expect(isValidSavedEntry(danglingWire)).toBe(false);
    const badPort = {
      ...validEntry,
      circuit: { nodes: goodCircuit.nodes, wires: [{ id: 'w', from: 'i', to: 'out', toPort: 3 }] },
    };
    expect(isValidSavedEntry(badPort)).toBe(false);
  });
});

describe('loadSaved', () => {
  it('returns an empty list for a missing or junk store', () => {
    expect(loadSaved(makeStorage())).toEqual([]);
    expect(loadSaved(makeStorage('not json'))).toEqual([]);
    expect(loadSaved(makeStorage('{"not":"an array"}'))).toEqual([]);
  });

  it('drops malformed entries but keeps the good ones', () => {
    const raw = JSON.stringify([validEntry, { junk: true }, 42]);
    const list = loadSaved(makeStorage(raw));
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe('saved-1');
  });
});

describe('save / delete round-trip', () => {
  it('saves a deep copy, reads it back, then deletes it', () => {
    const storage = makeStorage();

    const afterSave = saveCircuit(goodCircuit, 'First', storage);
    expect(afterSave).toHaveLength(1);
    expect(afterSave[0].name).toBe('First');
    expect(typeof afterSave[0].savedAt).toBe('number');

    // Persisted and reloadable through a fresh read.
    const reloaded = loadSaved(storage);
    expect(reloaded).toHaveLength(1);
    expect(reloaded[0].circuit.nodes).toHaveLength(2);

    // The stored circuit is a copy, not a shared reference.
    expect(reloaded[0].circuit.nodes).not.toBe(goodCircuit.nodes);

    const afterSecond = saveCircuit(goodCircuit, 'Second', storage);
    expect(afterSecond).toHaveLength(2);

    const afterDelete = deleteSaved(afterSecond[0].id, storage);
    expect(afterDelete).toHaveLength(1);
    expect(afterDelete[0].name).toBe('Second');
    expect(loadSaved(storage)).toHaveLength(1);
  });

  it('writeSaved overwrites the whole list', () => {
    const storage = makeStorage();
    writeSaved([validEntry], storage);
    expect(loadSaved(storage)).toHaveLength(1);
    writeSaved([], storage);
    expect(loadSaved(storage)).toEqual([]);
  });
});
