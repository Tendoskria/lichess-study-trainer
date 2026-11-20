import { vi } from 'vitest';
import type { Mock } from 'vitest';

interface FakeParam {
  value: number;
  setValueAtTime: Mock;
  exponentialRampToValueAtTime: Mock;
}

export interface FakeNode {
  connect: Mock;
  start: Mock;
  stop: Mock;
  [key: string]: unknown;
}

const createParam = (): FakeParam => ({
  value: 0,
  setValueAtTime: vi.fn(),
  exponentialRampToValueAtTime: vi.fn(),
});

/**
 * Minimal stand-in for the Web Audio API that records what was built, so the sound recipes
 * can be checked without a browser (or a speaker).
 */
export function createFakeAudio(state: AudioContextState = 'running') {
  const params: FakeParam[] = [];
  const oscillators: FakeNode[] = [];
  const sources: FakeNode[] = [];
  const filters: FakeNode[] = [];

  const param = (): FakeParam => {
    const created = createParam();
    params.push(created);
    return created;
  };
  const node = (extra: Record<string, unknown> = {}): FakeNode => ({
    connect: vi.fn((target: unknown) => target),
    start: vi.fn(),
    stop: vi.fn(),
    ...extra,
  });

  const raw = {
    state,
    currentTime: 1,
    sampleRate: 8000,
    destination: node(),
    resume: vi.fn(async () => {
      raw.state = 'running';
    }),
    createGain: vi.fn(() => node({ gain: param() })),
    createOscillator: vi.fn(() => {
      const oscillator = node({ type: 'sine', frequency: param() });
      oscillators.push(oscillator);
      return oscillator;
    }),
    createBiquadFilter: vi.fn(() => {
      const filter = node({ type: 'lowpass', frequency: param(), Q: param() });
      filters.push(filter);
      return filter;
    }),
    createBufferSource: vi.fn(() => {
      const source = node({ buffer: null });
      sources.push(source);
      return source;
    }),
    createBuffer: vi.fn((_channels: number, length: number) => ({
      getChannelData: () => new Float32Array(length),
    })),
  };

  return { ctx: raw as unknown as AudioContext, raw, params, oscillators, sources, filters };
}
