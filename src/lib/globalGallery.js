// The data layer for the global "New" gallery: a small, dependency-free client
// for the shared Supabase table of published circuits. It talks to the
// PostgREST REST API with plain fetch and a publishable anon key, so there is
// no @supabase/supabase-js dependency and nothing secret in the bundle.
//
// Everything the server returns is UNTRUSTED. Rows are validated with the same
// circuit checker the local Saved store uses, and any row whose circuit is
// malformed or whose title is not a short string is dropped, so bad server data
// can never crash a render or be opened blindly. Text is only ever rendered as
// text (React escapes it); a circuit is only ever opened after it validates.

import { isValidCircuit } from './savedStore.js';
import { renderCircuitPixels } from './renderCircuit.js';

const TABLE = 'gatepaint_circuits';

// Display clamps. Titles and authors are truncated defensively before render.
const TITLE_MAX = 60;
const AUTHOR_MAX = 40;
// A title longer than this is treated as malformed and the row is dropped,
// rather than silently truncated, since it is not a plausible short title.
const TITLE_DROP_OVER = 300;

// Config comes from Vite env vars, never hardcoded. Tests inject a config
// through __setConfigForTests so they run without real keys; when the override
// is left undefined the real environment is read.
let configOverride;

// Test-only hook. Pass a { url, anonKey } object to force the config, or
// undefined to fall back to import.meta.env again.
export function __setConfigForTests(config) {
  configOverride = config;
}

function getConfig() {
  if (configOverride !== undefined) return configOverride;
  // import.meta.env is always defined under Vite/Vitest, but guard anyway.
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  return {
    url: env.VITE_SUPABASE_URL || '',
    anonKey: env.VITE_SUPABASE_ANON_KEY || '',
  };
}

// True only when both env vars are present and non-empty. The New tab shows a
// calm "not set up" state when this is false, and never fetches.
export function isConfigured() {
  const { url, anonKey } = getConfig();
  return Boolean(url) && Boolean(anonKey);
}

// Strips any trailing slash so the joined REST path has exactly one.
function baseUrl(url) {
  return url.replace(/\/+$/, '');
}

// The auth headers every request carries: the publishable anon key, both as the
// apikey header PostgREST expects and as a Bearer token.
function authHeaders(anonKey) {
  return { apikey: anonKey, Authorization: `Bearer ${anonKey}` };
}

// Turns one raw server row into the normalized shape the UI renders, or returns
// null to DROP it. A row is dropped when its title is not a plausible short
// string or its circuit fails validation. Title and author are trimmed and
// clamped so an over-long value can never blow out the layout.
function normalizeRow(row) {
  if (!row || typeof row !== 'object') return null;
  if (typeof row.title !== 'string') return null;
  const title = row.title.trim();
  if (!title || title.length > TITLE_DROP_OVER) return null;
  if (!isValidCircuit(row.circuit)) return null;
  const rawAuthor = typeof row.author === 'string' ? row.author.trim() : '';
  return {
    id: typeof row.id === 'string' ? row.id : String(row.id ?? ''),
    createdAt: typeof row.created_at === 'string' ? row.created_at : '',
    title: title.slice(0, TITLE_MAX),
    author: rawAuthor ? rawAuthor.slice(0, AUTHOR_MAX) : '',
    circuit: row.circuit,
  };
}

// GETs the most recent circuits, newest first. Returns a normalized, validated
// array; a normal empty result returns [] rather than throwing. Network and
// HTTP errors throw an Error with a readable message the UI can show.
export async function fetchRecentCircuits({ limit = 40, offset = 0 } = {}) {
  const { url, anonKey } = getConfig();
  if (!url || !anonKey) return [];
  const endpoint =
    `${baseUrl(url)}/rest/v1/${TABLE}` +
    `?select=id,created_at,title,author,circuit` +
    `&order=created_at.desc&limit=${limit}&offset=${offset}`;

  let response;
  try {
    response = await fetch(endpoint, { headers: authHeaders(anonKey) });
  } catch (err) {
    throw new Error(`Could not reach the gallery. ${err.message || ''}`.trim());
  }
  if (!response.ok) {
    throw new Error(`Gallery request failed (${response.status}).`);
  }
  let rows;
  try {
    rows = await response.json();
  } catch {
    throw new Error('The gallery returned an unreadable response.');
  }
  if (!Array.isArray(rows)) return [];
  return rows.map(normalizeRow).filter(Boolean);
}

// A circuit is worth publishing only when it actually paints something. We
// render it and require at least one lit pixel, which is the real test: it
// rejects the bare inputs+OUTPUT, gates that were dropped but never wired into
// OUTPUT, and any wiring that leaves the canvas blank. An all-off canvas is
// nothing to share.
function circuitPaintsSomething(circuit) {
  if (!circuit || !Array.isArray(circuit.nodes) || !Array.isArray(circuit.wires)) {
    return false;
  }
  const pixels = renderCircuitPixels(circuit);
  return pixels.some(Boolean);
}

// POSTs a new circuit to the shared table. Validates and clamps client-side:
// the title is required and trimmed to 1..60 chars, the author is optional and
// trimmed to 0..40 chars (empty -> null), and the circuit must be valid and
// non-empty. Returns the created row, or throws a readable Error.
export async function publishCircuit({ title, author, circuit }) {
  const { url, anonKey } = getConfig();
  if (!url || !anonKey) throw new Error('The global gallery is not set up.');

  const cleanTitle = typeof title === 'string' ? title.trim().slice(0, TITLE_MAX) : '';
  if (!cleanTitle) throw new Error('A title is required.');
  if (!isValidCircuit(circuit)) throw new Error('This circuit is not valid.');
  if (!circuitPaintsSomething(circuit)) {
    throw new Error('Your circuit paints a blank canvas. Wire a gate into OUTPUT so it paints something before publishing.');
  }
  const trimmedAuthor = typeof author === 'string' ? author.trim() : '';
  const cleanAuthor = trimmedAuthor ? trimmedAuthor.slice(0, AUTHOR_MAX) : null;

  const body = JSON.stringify({ title: cleanTitle, author: cleanAuthor, circuit });

  let response;
  try {
    response = await fetch(`${baseUrl(url)}/rest/v1/${TABLE}`, {
      method: 'POST',
      headers: {
        ...authHeaders(anonKey),
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body,
    });
  } catch (err) {
    throw new Error(`Could not reach the gallery. ${err.message || ''}`.trim());
  }
  if (!response.ok) {
    throw new Error(`Publish failed (${response.status}).`);
  }
  let created;
  try {
    created = await response.json();
  } catch {
    created = null;
  }
  return Array.isArray(created) ? created[0] : created;
}
