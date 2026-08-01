// The in-browser store for gallery circuits the player saves. A single
// localStorage key holds a JSON array of entries. Everything here is pure of
// React and tolerant of junk: a malformed store, or a malformed entry inside
// it, is dropped rather than thrown, so a bad value can never crash the app.
//
// This is separate from File > Save (which downloads a JSON file). Saving to
// the gallery keeps a copy in the browser only.

import { KNOWN_NODE_TYPES } from '../circuits.js';

export const SAVED_KEY = 'gatepaint.saved.v1';

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

// Deep copy a circuit's nodes and wires so a stored entry never shares
// references with the live workspace state.
function cloneCircuit(circuit) {
  return {
    nodes: circuit.nodes.map((node) => ({ ...node })),
    wires: circuit.wires.map((wire) => ({ ...wire })),
  };
}

// Same minimal shape check TopBar uses for a loaded file, applied to the
// circuit inside a saved entry: known node types, string ids, and wires that
// only reference existing nodes on a valid port.
function isValidCircuit(circuit) {
  if (!circuit || typeof circuit !== 'object') return false;
  if (!Array.isArray(circuit.nodes) || !Array.isArray(circuit.wires)) return false;
  const ids = new Set();
  for (const node of circuit.nodes) {
    if (!node || typeof node.id !== 'string') return false;
    if (!KNOWN_NODE_TYPES.has(node.type)) return false;
    ids.add(node.id);
  }
  for (const wire of circuit.wires) {
    if (!wire || typeof wire.id !== 'string') return false;
    if (!ids.has(wire.from) || !ids.has(wire.to)) return false;
    if (wire.toPort !== 0 && wire.toPort !== 1) return false;
  }
  return true;
}

// A well-formed saved entry: an id, a name, a timestamp, and a valid circuit.
export function isValidSavedEntry(entry) {
  if (!entry || typeof entry !== 'object') return false;
  if (typeof entry.id !== 'string') return false;
  if (typeof entry.name !== 'string') return false;
  if (typeof entry.savedAt !== 'number') return false;
  return isValidCircuit(entry.circuit);
}

// Reads the store, dropping any entries that fail validation. Never throws:
// a missing key, non-JSON, or a non-array all resolve to an empty list.
export function loadSaved(storage) {
  const store = resolveStorage(storage);
  let raw;
  try {
    raw = store.getItem(SAVED_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidSavedEntry);
}

// Overwrites the store with the given list. Best-effort: a storage failure
// (quota, private mode) is swallowed so the UI still updates in memory.
export function writeSaved(list, storage) {
  const store = resolveStorage(storage);
  try {
    store.setItem(SAVED_KEY, JSON.stringify(list));
  } catch {
    // Nothing more we can do; the caller keeps its in-memory copy.
  }
}

// Generates a reasonably unique id without depending on the app's counter.
function makeId() {
  return `saved-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// Appends a deep copy of the current workspace circuit under the given name
// and returns the new full list. The caller passes { nodes, wires }.
export function saveCircuit(circuit, name, storage) {
  const entry = {
    id: makeId(),
    name,
    savedAt: Date.now(),
    circuit: cloneCircuit(circuit),
  };
  const next = [...loadSaved(storage), entry];
  writeSaved(next, storage);
  return next;
}

// Removes the entry with the given id and returns the new full list.
export function deleteSaved(id, storage) {
  const next = loadSaved(storage).filter((entry) => entry.id !== id);
  writeSaved(next, storage);
  return next;
}
