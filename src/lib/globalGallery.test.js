import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  __setConfigForTests,
  isConfigured,
  fetchRecentCircuits,
  publishCircuit,
} from './globalGallery.js';

const CONFIG = { url: 'https://demo.supabase.co', anonKey: 'anon-key-123' };

// A minimal valid circuit: one input feeding OUTPUT through a wire, so it is
// both structurally valid and non-empty.
const goodCircuit = {
  nodes: [
    { id: 'i', type: 'INPUT', label: 'x0', x: 0, y: 0 },
    { id: 'out', type: 'OUTPUT', label: 'out', x: 100, y: 0 },
  ],
  wires: [{ id: 'w1', from: 'i', to: 'out', toPort: 0 }],
};

// A structurally valid but content-empty circuit: bare inputs and OUTPUT, no
// wires and no gates. Publishing this must be rejected.
const emptyCircuit = {
  nodes: [
    { id: 'i', type: 'INPUT', label: 'x0', x: 0, y: 0 },
    { id: 'out', type: 'OUTPUT', label: 'out', x: 100, y: 0 },
  ],
  wires: [],
};

function jsonResponse(body, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

afterEach(() => {
  __setConfigForTests(undefined);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('isConfigured', () => {
  it('is true only when both url and anon key are present', () => {
    __setConfigForTests(CONFIG);
    expect(isConfigured()).toBe(true);

    __setConfigForTests({ url: '', anonKey: 'anon' });
    expect(isConfigured()).toBe(false);

    __setConfigForTests({ url: 'https://x.supabase.co', anonKey: '' });
    expect(isConfigured()).toBe(false);

    __setConfigForTests({ url: '', anonKey: '' });
    expect(isConfigured()).toBe(false);
  });
});

describe('fetchRecentCircuits', () => {
  beforeEach(() => {
    __setConfigForTests(CONFIG);
  });

  it('returns [] without fetching when not configured', async () => {
    __setConfigForTests({ url: '', anonKey: '' });
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(await fetchRecentCircuits({})).toEqual([]);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('builds the right URL and headers, and normalizes rows', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([
        { id: 'a', created_at: '2026-01-01T00:00:00Z', title: 'One', author: 'Ada', circuit: goodCircuit },
      ])
    );
    vi.stubGlobal('fetch', fetchMock);

    const rows = await fetchRecentCircuits({ limit: 5, offset: 10 });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://demo.supabase.co/rest/v1/gatepaint_circuits' +
        '?select=id,created_at,title,author,circuit' +
        '&order=created_at.desc&limit=5&offset=10'
    );
    expect(options.headers).toEqual({
      apikey: 'anon-key-123',
      Authorization: 'Bearer anon-key-123',
    });

    expect(rows).toEqual([
      {
        id: 'a',
        createdAt: '2026-01-01T00:00:00Z',
        title: 'One',
        author: 'Ada',
        circuit: goodCircuit,
      },
    ]);
  });

  it('drops rows with invalid circuits or bad titles', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([
        { id: 'ok', title: 'Good', author: '', circuit: goodCircuit },
        // Malformed circuit: unknown node type.
        { id: 'bad1', title: 'Bad circuit', circuit: { nodes: [{ id: 'z', type: 'NOPE' }], wires: [] } },
        // Title not a string.
        { id: 'bad2', title: 42, circuit: goodCircuit },
        // Empty title after trim.
        { id: 'bad3', title: '   ', circuit: goodCircuit },
        // Absurdly long title -> dropped, not truncated.
        { id: 'bad4', title: 'x'.repeat(400), circuit: goodCircuit },
        // Missing circuit entirely.
        { id: 'bad5', title: 'No circuit' },
      ])
    );
    vi.stubGlobal('fetch', fetchMock);

    const rows = await fetchRecentCircuits({});
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe('ok');
  });

  it('truncates over-long titles and authors defensively', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse([
        { id: 'a', title: 'T'.repeat(120), author: 'A'.repeat(120), circuit: goodCircuit },
      ])
    );
    vi.stubGlobal('fetch', fetchMock);

    const rows = await fetchRecentCircuits({});
    expect(rows[0].title).toHaveLength(60);
    expect(rows[0].author).toHaveLength(40);
  });

  it('returns [] on a normal empty result', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse([])));
    expect(await fetchRecentCircuits({})).toEqual([]);
  });

  it('throws a readable error on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(null, { ok: false, status: 503 })));
    await expect(fetchRecentCircuits({})).rejects.toThrow(/503/);
  });

  it('throws a readable error when the network fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new Error('offline');
    }));
    await expect(fetchRecentCircuits({})).rejects.toThrow(/reach the gallery/i);
  });
});

describe('publishCircuit', () => {
  beforeEach(() => {
    __setConfigForTests(CONFIG);
  });

  it('rejects a missing title', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(publishCircuit({ title: '   ', circuit: goodCircuit })).rejects.toThrow(/title/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an empty circuit', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(publishCircuit({ title: 'Nothing', circuit: emptyCircuit })).rejects.toThrow(
      /before publishing/i
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid circuit', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const bad = { nodes: [{ id: 'z', type: 'NOPE' }], wires: [] };
    await expect(publishCircuit({ title: 'Bad', circuit: bad })).rejects.toThrow(/not valid/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts the right body with clamped title and author, and returns the row', async () => {
    const created = { id: 'new-id', title: 'Hi', author: 'Ada', circuit: goodCircuit };
    const fetchMock = vi.fn(async () => jsonResponse([created]));
    vi.stubGlobal('fetch', fetchMock);

    const longTitle = 'T'.repeat(80);
    const longAuthor = 'A'.repeat(80);
    const result = await publishCircuit({
      title: `  ${longTitle}  `,
      author: `  ${longAuthor}  `,
      circuit: goodCircuit,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe('https://demo.supabase.co/rest/v1/gatepaint_circuits');
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({
      apikey: 'anon-key-123',
      Authorization: 'Bearer anon-key-123',
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    });
    const body = JSON.parse(options.body);
    expect(body.title).toHaveLength(60);
    expect(body.author).toHaveLength(40);
    expect(body.circuit).toEqual(goodCircuit);

    expect(result).toEqual(created);
  });

  it('sends a null author when none is given', async () => {
    const fetchMock = vi.fn(async () => jsonResponse([{ id: 'x' }]));
    vi.stubGlobal('fetch', fetchMock);
    await publishCircuit({ title: 'Solo', author: '   ', circuit: goodCircuit });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.author).toBeNull();
  });

  it('throws a readable error on an HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(null, { ok: false, status: 401 })));
    await expect(publishCircuit({ title: 'Hi', circuit: goodCircuit })).rejects.toThrow(/401/);
  });

  it('throws when not configured', async () => {
    __setConfigForTests({ url: '', anonKey: '' });
    await expect(publishCircuit({ title: 'Hi', circuit: goodCircuit })).rejects.toThrow(
      /not set up/i
    );
  });
});
