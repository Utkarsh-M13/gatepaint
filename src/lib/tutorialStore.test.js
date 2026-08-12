import { describe, it, expect } from 'vitest';
import { TUTORIAL_KEY, isTutorialSeen, markTutorialSeen } from './tutorialStore.js';

// A tiny in-memory localStorage stand-in, like savedStore.test.js uses.
function makeStorage(initial) {
  const map = new Map();
  if (initial !== undefined) map.set(TUTORIAL_KEY, initial);
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, value),
    _raw: () => map.get(TUTORIAL_KEY),
  };
}

// Storage whose access always throws, to prove the store never propagates it.
const throwingStorage = {
  getItem() {
    throw new Error('blocked');
  },
  setItem() {
    throw new Error('blocked');
  },
};

describe('tutorialStore', () => {
  it('reports not-seen for a fresh storage', () => {
    expect(isTutorialSeen(makeStorage())).toBe(false);
  });

  it('round-trips the seen flag through mark then read', () => {
    const storage = makeStorage();
    markTutorialSeen(storage);
    expect(storage._raw()).toBe('1');
    expect(isTutorialSeen(storage)).toBe(true);
  });

  it('treats any other stored value as not-seen', () => {
    expect(isTutorialSeen(makeStorage('0'))).toBe(false);
    expect(isTutorialSeen(makeStorage('yes'))).toBe(false);
  });

  it('never throws when storage access fails', () => {
    expect(() => markTutorialSeen(throwingStorage)).not.toThrow();
    expect(isTutorialSeen(throwingStorage)).toBe(false);
  });
});
