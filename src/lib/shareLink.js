// Share-by-URL encode/decode. Pure, no React. The circuit lives entirely in
// the URL hash (never sent to a server) as base64-encoded JSON, so a link is
// shareable on its own with no backend involved.
//
// Encoding: JSON.stringify -> UTF-8 safe escape -> btoa -> URL-safe base64
// (+/= swapped for -_ and padding stripped). Decoding reverses each step and
// validates the result with isValidCircuit before ever handing it back, since
// anything arriving via the URL is untrusted input, not a command.

import { isValidCircuit } from './savedStore.js';

// The hash key the circuit param is stored under, e.g. #c=<payload>.
const HASH_PARAM = 'c';

// btoa/atob only handle Latin1, so a UTF-8 string is escaped through
// encodeURIComponent/unescape first, the classic browser-safe trick.
function utf8ToBase64(str) {
  return btoa(unescape(encodeURIComponent(str)));
}

function base64ToUtf8(str) {
  return decodeURIComponent(escape(atob(str)));
}

// Standard base64 uses +, /, and = padding, none of which are safe unescaped
// in a URL fragment. Swap them for the URL-safe alphabet and drop padding
// (it is recoverable from the string length on the way back).
function toUrlSafe(base64) {
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromUrlSafe(urlSafe) {
  let base64 = urlSafe.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  if (pad === 2) base64 += '==';
  else if (pad === 3) base64 += '=';
  else if (pad !== 0) return null; // Malformed length, never a valid base64 body.
  return base64;
}

// Serializes { nodes, wires } into a URL-safe string. Never throws on a
// normal circuit; if JSON.stringify somehow fails (circular data, which
// should not occur for plain circuit objects) it returns null.
export function encodeCircuit(circuit) {
  try {
    const json = JSON.stringify(circuit);
    return toUrlSafe(utf8ToBase64(json));
  } catch {
    return null;
  }
}

// Reverses encodeCircuit and validates the result with isValidCircuit.
// Returns the parsed circuit on success, or null on any failure: garbage
// input, non-base64, valid-base64-but-not-JSON, or JSON that fails
// validation. Never throws.
export function decodeCircuit(encoded) {
  if (typeof encoded !== 'string' || encoded.length === 0) return null;
  const base64 = fromUrlSafe(encoded);
  if (base64 === null) return null;
  let json;
  try {
    json = base64ToUtf8(base64);
  } catch {
    return null;
  }
  let data;
  try {
    data = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isValidCircuit(data)) return null;
  return data;
}

// Builds the full shareable URL for a circuit from the current page location,
// e.g. https://host/path#c=<payload>. Returns null if the circuit fails to
// encode.
export function buildShareUrl(circuit, location = window.location) {
  const encoded = encodeCircuit(circuit)
  if (encoded === null) return null;
  const base = `${location.origin}${location.pathname}${location.search}`;
  return `${base}#${HASH_PARAM}=${encoded}`;
}

// Reads a circuit out of a location hash (e.g. "#c=..."), returning the
// decoded circuit or null if the param is missing or malformed. Accepts a
// raw hash string so it can be unit-tested without a real window.
export function readCircuitFromHash(hash) {
  if (typeof hash !== 'string' || hash.length === 0) return null;
  const stripped = hash.startsWith('#') ? hash.slice(1) : hash;
  const params = new URLSearchParams(stripped);
  const encoded = params.get(HASH_PARAM);
  if (!encoded) return null;
  return decodeCircuit(encoded);
}
