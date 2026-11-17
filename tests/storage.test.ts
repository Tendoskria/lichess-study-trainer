import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../src/services/storage';

describe('SettingsStore', () => {
  it('round-trips values under a namespaced key', () => {
    const data = new Map<string, string>();
    const store = new SettingsStore({
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => void data.set(key, value),
    });
    store.write('username', 'Tendoskria');
    expect(store.read('username')).toBe('Tendoskria');
    expect(store.read('pgn')).toBeNull();
    expect([...data.keys()]).toEqual(['lichess-study-trainer:username']);
  });

  it('never throws when storage fails or is unavailable', () => {
    const failing = new SettingsStore({
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    });
    expect(() => failing.write('pgn', 'x')).not.toThrow();
    expect(failing.read('pgn')).toBeNull();
    expect(new SettingsStore(null).read('pgn')).toBeNull();
  });
});
