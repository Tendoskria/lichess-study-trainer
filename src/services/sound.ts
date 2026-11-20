import { createImpulseBuffer, createNoiseBuffer, recipes } from './synth';
import type { SoundName, Synth } from './synth';

export type { SoundName };

/** What the rest of the app needs from the audio layer (easy to stub in tests). */
export interface SoundOutput {
  readonly enabled: boolean;
  setEnabled(enabled: boolean): void;
  /** Prepares audio; call from a user gesture, browsers refuse to start sound before. */
  unlock(): void;
  play(name: SoundName): void;
}

const MASTER_VOLUME = 0.7;
/** Tiny scheduling margin so the first samples are not clipped. */
const LEAD_IN_S = 0.005;

type ContextFactory = () => AudioContext | null;

export interface SoundPlayerOptions {
  readonly enabled?: boolean;
  /** Injectable for tests. */
  readonly createContext?: ContextFactory;
  readonly random?: () => number;
}

function defaultContextFactory(): AudioContext | null {
  const Constructor =
    globalThis.AudioContext ??
    (globalThis as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Constructor ? new Constructor() : null;
}

/**
 * Plays the app's synthesised sounds. The audio context is created lazily, and every failure
 * (no Web Audio support, blocked autoplay...) degrades to silence: sound is a bonus.
 */
export class SoundPlayer implements SoundOutput {
  private active: boolean;
  private synth: Synth | null = null;
  private readonly createContext: ContextFactory;
  private readonly random: () => number;

  constructor(options: SoundPlayerOptions = {}) {
    this.active = options.enabled ?? true;
    this.createContext = options.createContext ?? defaultContextFactory;
    this.random = options.random ?? Math.random;
  }

  get enabled(): boolean {
    return this.active;
  }

  setEnabled(enabled: boolean): void {
    this.active = enabled;
  }

  unlock(): void {
    if (!this.active) return;
    const synth = this.ensureSynth();
    if (synth?.ctx.state === 'suspended') void synth.ctx.resume().catch(() => undefined);
  }

  play(name: SoundName): void {
    if (!this.active) return;
    const synth = this.ensureSynth();
    if (!synth) return;

    if (synth.ctx.state !== 'running') {
      // Not unlocked yet: drop this sound rather than letting it play late.
      void synth.ctx.resume().catch(() => undefined);
      return;
    }
    try {
      recipes[name](synth, synth.ctx.currentTime + LEAD_IN_S);
    } catch {
      // A sound must never break the exercise.
    }
  }

  private ensureSynth(): Synth | null {
    if (this.synth) return this.synth;
    try {
      const ctx = this.createContext();
      if (!ctx) return null;
      const master = ctx.createGain();
      master.gain.value = MASTER_VOLUME;
      master.connect(ctx.destination);
      this.synth = {
        ctx,
        out: master,
        noise: createNoiseBuffer(ctx),
        impulse: createImpulseBuffer(ctx),
        random: this.random,
      };
      return this.synth;
    } catch {
      return null;
    }
  }
}
