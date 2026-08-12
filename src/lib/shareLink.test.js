import { describe, it, expect } from 'vitest';
import { encodeCircuit, decodeCircuit, buildShareUrl, readCircuitFromHash } from './shareLink.js';

// A minimal valid circuit: one input feeding OUTPUT.
const goodCircuit = {
  nodes: [
    { id: 'i', type: 'INPUT', label: 'x0', x: 0, y: 0 },
    { id: 'out', type: 'OUTPUT', label: 'out', x: 100, y: 0 },
  ],
  wires: [{ id: 'w1', from: 'i', to: 'out', toPort: 0 }],
};

describe('encodeCircuit / decodeCircuit', () => {
  it('round-trips a circuit exactly', () => {
    const encoded = encodeCircuit(goodCircuit);
    expect(typeof encoded).toBe('string');
    const decoded = decodeCircuit(encoded);
    expect(decoded).toEqual(goodCircuit);
  });

  it('round-trips a circuit with unicode-ish labels safely', () => {
    const circuit = {
      nodes: [
        { id: 'i', type: 'INPUT', label: 'x0', x: 0, y: 0 },
        { id: 'g', type: 'NOT', label: 'weird "quote" éü', x: 50, y: 0 },
        { id: 'out', type: 'OUTPUT', label: 'out', x: 100, y: 0 },
      ],
      wires: [
        { id: 'w1', from: 'i', to: 'g', toPort: 0 },
        { id: 'w2', from: 'g', to: 'out', toPort: 0 },
      ],
    };
    const encoded = encodeCircuit(circuit);
    expect(decodeCircuit(encoded)).toEqual(circuit);
  });

  it('produces a URL-safe string with no +, /, or = characters', () => {
    // Encode a bunch of variants to shake out any stray base64 special chars.
    for (let i = 0; i < 20; i += 1) {
      const circuit = {
        nodes: [
          { id: `i${i}`, type: 'INPUT', label: 'x0', x: i, y: i * 3 },
          { id: 'out', type: 'OUTPUT', label: 'out', x: 100, y: 0 },
        ],
        wires: [{ id: 'w1', from: `i${i}`, to: 'out', toPort: 0 }],
      };
      const encoded = encodeCircuit(circuit);
      expect(encoded).not.toMatch(/[+/=]/);
    }
  });

  it('returns null for garbage input', () => {
    expect(decodeCircuit('')).toBeNull();
    expect(decodeCircuit(null)).toBeNull();
    expect(decodeCircuit(undefined)).toBeNull();
    expect(decodeCircuit(123)).toBeNull();
  });

  it('returns null for non-base64 input', () => {
    expect(decodeCircuit('not valid base64!!! ###')).toBeNull();
  });

  it('returns null for valid-base64-but-not-JSON', () => {
    // btoa('not json at all') -> valid base64 that decodes to non-JSON text.
    const encoded = btoa('not json at all').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(decodeCircuit(encoded)).toBeNull();
  });

  it('returns null for JSON that fails isValidCircuit', () => {
    const badCircuit = { nodes: [{ id: 'x', type: 'BOGUS' }], wires: [] };
    const encoded = encodeCircuit(badCircuit);
    expect(decodeCircuit(encoded)).toBeNull();
  });

  it('returns null when JSON parses to a non-circuit shape', () => {
    const encoded = encodeCircuit({ hello: 'world' });
    expect(decodeCircuit(encoded)).toBeNull();
  });
});

describe('buildShareUrl / readCircuitFromHash', () => {
  const fakeLocation = {
    origin: 'https://example.test',
    pathname: '/gatepaint/',
    search: '',
  };

  it('builds a URL with the circuit in the hash and reads it back', () => {
    const url = buildShareUrl(goodCircuit, fakeLocation);
    expect(url.startsWith('https://example.test/gatepaint/#c=')).toBe(true);
    const hash = url.slice(url.indexOf('#'));
    const decoded = readCircuitFromHash(hash);
    expect(decoded).toEqual(goodCircuit);
  });

  it('readCircuitFromHash returns null when the param is missing', () => {
    expect(readCircuitFromHash('')).toBeNull();
    expect(readCircuitFromHash('#')).toBeNull();
    expect(readCircuitFromHash('#foo=bar')).toBeNull();
  });

  it('readCircuitFromHash returns null for a malformed circuit param', () => {
    expect(readCircuitFromHash('#c=not-valid-base64!!!')).toBeNull();
  });

  it('preserves query string in the built URL base', () => {
    const url = buildShareUrl(goodCircuit, { ...fakeLocation, search: '?foo=bar' });
    expect(url.startsWith('https://example.test/gatepaint/?foo=bar#c=')).toBe(true);
  });
});
