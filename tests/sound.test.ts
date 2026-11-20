import { describe, expect, it, vi } from 'vitest';
import type { SoundPlayerOptions } from '../src/services/sound';
import { SoundPlayer } from '../src/services/sound';
import type { SoundName } from '../src/services/synth';
import { createFakeAudio } from './helpers/fake-audio';
import type { FakeNode } from './helpers/fake-audio';

/** Deterministic: no random variation at all. */
const noJitter = (): number => 0.5;

const setup = (state: AudioContextState = 'running', options: SoundPlayerOptions = {}) => {
  const audio = createFakeAudio(state);
  const factory = vi.fn(() => audio.ctx);
  return {
    ...audio,
    factory,
    player: new SoundPlayer({ createContext: factory, random: noJitter, ...options }),
  };
};

const paramValue = (node: FakeNode, name: 'frequency' | 'Q'): number =>
  (node[name] as { value: number }).value;

const bandpasses = (filters: FakeNode[]): FakeNode[] =>
  filters.filter((filter) => filter.type === 'bandpass');

describe('SoundPlayer', () => {
  it('creates nothing while disabled', () => {
    const { player, factory } = setup('running', { enabled: false });
    player.play('error');
    player.unlock();
    expect(player.enabled).toBe(false);
    expect(factory).not.toHaveBeenCalled();
  });

  it('can be enabled and disabled later', () => {
    const { player, factory } = setup('running', { enabled: false });
    player.setEnabled(true);
    player.play('error');
    expect(factory).toHaveBeenCalledOnce();
    player.setEnabled(false);
    expect(player.enabled).toBe(false);
  });

  it('builds the audio graph once and reuses it', () => {
    const { player, factory, raw } = setup();
    player.play('move');
    player.play('move');
    expect(factory).toHaveBeenCalledOnce();
    // One noise buffer and one impulse buffer, created once.
    expect(raw.createBuffer).toHaveBeenCalledTimes(2);
  });

  describe('sounds', () => {
    it.each<[SoundName, number, number]>([
      ['move', 0, 2],
      ['capture', 0, 2],
      ['error', 3, 1],
      ['victory', 7, 0],
    ])('%s uses %i oscillator(s) and %i buffer source(s)', (name, oscillators, sources) => {
      const audio = setup();
      audio.player.play(name);
      expect(audio.oscillators).toHaveLength(oscillators);
      expect(audio.sources).toHaveLength(sources);
    });

    it.each<SoundName>(['move', 'capture', 'error', 'victory'])(
      '%s schedules valid, ordered times and never ramps to zero',
      (name) => {
        const { player, oscillators, sources, params, raw } = setup();
        player.play(name);

        for (const source of [...oscillators, ...sources]) {
          const start = source.start.mock.calls[0]?.[0] as number;
          const stop = source.stop.mock.calls[0]?.[0] as number;
          expect(Number.isFinite(start)).toBe(true);
          expect(start).toBeGreaterThanOrEqual(raw.currentTime);
          expect(stop).toBeGreaterThan(start);
        }
        for (const param of params) {
          const ramps = param.exponentialRampToValueAtTime.mock.calls as [number, number][];
          for (const [value, time] of ramps) {
            expect(value).toBeGreaterThan(0);
            expect(Number.isFinite(time)).toBe(true);
          }
        }
      },
    );
  });

  describe('wood knock', () => {
    it('is built from damped resonances, not from pitched tones', () => {
      const { player, oscillators, filters } = setup();
      player.play('move');
      expect(oscillators).toHaveLength(0);
      expect(bandpasses(filters)).toHaveLength(5);
    });

    it('rings at the base resonance when there is no random variation', () => {
      const { player, filters } = setup();
      player.play('move');
      expect(paramValue(bandpasses(filters)[0] as FakeNode, 'frequency')).toBeCloseTo(170);
    });

    it('lets high resonances die faster than low ones', () => {
      const { player, filters } = setup();
      player.play('move');
      // A band-pass filter rings for about Q / (π · freq) seconds.
      const ringTimes = bandpasses(filters).map(
        (filter) => paramValue(filter, 'Q') / paramValue(filter, 'frequency'),
      );
      expect(ringTimes).toEqual([...ringTimes].sort((a, b) => b - a));
    });

    it('removes the highs so knocks are never shrill', () => {
      const { player, filters } = setup();
      player.play('move');
      const lowpass = filters.find((filter) => filter.type === 'lowpass');
      expect(paramValue(lowpass as FakeNode, 'frequency')).toBeLessThanOrEqual(4000);
    });

    it('rings only for a few milliseconds, so it never sounds reverberated', () => {
      const { player, filters } = setup();
      player.play('move');
      for (const filter of bandpasses(filters)) {
        const ringSeconds = paramValue(filter, 'Q') / (Math.PI * paramValue(filter, 'frequency'));
        expect(ringSeconds).toBeLessThan(0.008);
      }
    });

    it('makes captures lower and heavier, as a single impact (two would sound like an echo)', () => {
      const { player, filters } = setup();
      player.play('capture');
      const resonances = bandpasses(filters);
      expect(resonances).toHaveLength(5);
      expect(paramValue(resonances[0] as FakeNode, 'frequency')).toBeCloseTo(170 * 0.9);
    });

    it('varies a little from one move to the next', () => {
      let calls = 0;
      const random = (): number => [0.1, 0.9, 0.3, 0.7, 0.5][calls++ % 5] ?? 0.5;
      const { player, filters } = setup('running', { random });
      player.play('move');
      player.play('move');

      const [first, , , , , second] = [...bandpasses(filters)];
      const a = paramValue(first as FakeNode, 'frequency');
      const b = paramValue(second as FakeNode, 'frequency');
      expect(a).not.toBeCloseTo(b, 1);
      // ...but stays within a few percent: it is still the same instrument.
      expect(Math.abs(a / b - 1)).toBeLessThan(0.08);
    });
  });

  it('plays the victory jingle shortly after the move, to follow the banner', () => {
    const { player, oscillators, raw } = setup();
    player.play('victory');
    const firstStart = oscillators[0]?.start.mock.calls[0]?.[0] as number;
    expect(firstStart - raw.currentTime).toBeGreaterThan(0.25);
  });

  describe('browser constraints', () => {
    it('drops sounds until the context is unlocked, then plays', async () => {
      const { player, oscillators, raw } = setup('suspended');
      player.play('error');
      expect(raw.resume).toHaveBeenCalled();
      expect(oscillators).toHaveLength(0);

      await raw.resume.mock.results[0]?.value;
      player.play('error');
      expect(oscillators).toHaveLength(3);
    });

    it('resumes a suspended context on unlock, only when needed', () => {
      const suspended = setup('suspended');
      suspended.player.unlock();
      expect(suspended.raw.resume).toHaveBeenCalledOnce();

      const running = setup('running');
      running.player.unlock();
      expect(running.raw.resume).not.toHaveBeenCalled();
    });

    it('stays silent when Web Audio is unsupported or fails', () => {
      expect(() => new SoundPlayer({ createContext: () => null }).play('move')).not.toThrow();
      expect(() =>
        new SoundPlayer({
          createContext: () => {
            throw new Error('no audio device');
          },
        }).play('move'),
      ).not.toThrow();

      const broken = setup();
      broken.raw.createBiquadFilter.mockImplementation(() => {
        throw new Error('boom');
      });
      expect(() => broken.player.play('move')).not.toThrow();
    });
  });
});
