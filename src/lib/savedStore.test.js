import { describe, it, expect } from 'vitest';
import {
  SAVED_KEY,
  isValidSavedEntry,
  loadSaved,
  writeSaved,
  saveCircuit,
  deleteSaved,
} from './savedStore.js';
import { GRID_BITS } from '../engine/bits.js';

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
      // A port at or beyond GRID_BITS is out of range for any node.
      circuit: {
        nodes: goodCircuit.nodes,
        wires: [{ id: 'w', from: 'i', to: 'out', toPort: GRID_BITS }],
      },
    };
    expect(isValidSavedEntry(badPort)).toBe(false);
  });
});

describe('CMP nodes in a saved circuit', () => {
  const zeros = () => Array.from({ length: GRID_BITS }, () => 0);
  // A circuit with a comparator wired on its highest port, so it also exercises
  // the widened toPort range.
  const cmpCircuit = (overrides = {}) => ({
    nodes: [
      { id: 'ix', type: 'INPUT', label: 'x0', x: 0, y: 0 },
      { id: 'c', type: 'CMP', op: 'LT', target: zeros(), x: 40, y: 0, ...overrides },
      { id: 'out', type: 'OUTPUT', label: 'out', x: 100, y: 0 },
    ],
    wires: [
      { id: 'w1', from: 'ix', to: 'c', toPort: GRID_BITS - 1 },
      { id: 'w2', from: 'c', to: 'out', toPort: 0 },
    ],
  });
  const cmpEntry = (circuit) => ({ id: 'saved-c', name: 'Cmp', savedAt: 1, circuit });

  it('accepts a well-formed CMP node and a high-port wire', () => {
    expect(isValidSavedEntry(cmpEntry(cmpCircuit()))).toBe(true);
  });

  it('rejects a CMP with an unknown operator', () => {
    expect(isValidSavedEntry(cmpEntry(cmpCircuit({ op: 'NE' })))).toBe(false);
  });

  it('rejects a CMP whose target is the wrong length or not binary', () => {
    expect(isValidSavedEntry(cmpEntry(cmpCircuit({ target: [0, 1] })))).toBe(false);
    const notBinary = zeros();
    notBinary[0] = 2;
    expect(isValidSavedEntry(cmpEntry(cmpCircuit({ target: notBinary })))).toBe(false);
    expect(isValidSavedEntry(cmpEntry(cmpCircuit({ target: undefined })))).toBe(false);
  });

  it('round-trips a CMP circuit through save and reload', () => {
    const storage = makeStorage();
    const target = zeros();
    target[0] = 1;
    saveCircuit(cmpCircuit({ op: 'GT', target }), 'Cmp', storage);
    const reloaded = loadSaved(storage);
    expect(reloaded).toHaveLength(1);
    const cmp = reloaded[0].circuit.nodes.find((n) => n.type === 'CMP');
    expect(cmp.op).toBe('GT');
    expect(cmp.target).toEqual(target);
    // The stored constant is a copy, not a shared reference.
    expect(cmp.target).not.toBe(target);
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
