/**
 * Every sound of the app, built from Web Audio primitives: the project ships no audio file.
 * All recipes are original (nothing is derived from a recording).
 */

export type SoundName = 'move' | 'capture' | 'error' | 'victory';

export interface Synth {
  readonly ctx: AudioContext;
  /** Node every sound is connected to (master volume). */
  readonly out: AudioNode;
  /** Shared white-noise buffer. */
  readonly noise: AudioBuffer;
  /** A single sharp click, used to excite the wood resonances. */
  readonly impulse: AudioBuffer;
  /** Random source in [0, 1), injectable so tests are deterministic. */
  readonly random: () => number;
}

export function createNoiseBuffer(ctx: AudioContext, seconds = 0.3): AudioBuffer {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

/** A few samples long (~0.15 ms): a hard tap, rich in all frequencies. */
export function createImpulseBuffer(ctx: AudioContext): AudioBuffer {
  const buffer = ctx.createBuffer(1, 8, ctx.sampleRate);
  buffer.getChannelData(0).set([0, 1, 0.6, -0.3, -0.15, 0.05, 0, 0]);
  return buffer;
}

/**
 * A knock on wood is not a note: a hard tap excites a few heavily damped resonances of the
 * board, which ring for milliseconds and are gone. Pure sine tones with long decays sound
 * like a plucked string instead, so each resonance here is a narrow band-pass filter fed with
 * a tap, and rings for about `Q / (π · freq)` seconds (a few ms): high resonances die faster than
 * low ones. Keep the Q values low: higher ones ring on and make the knock sound reverberated.
 *
 * `gain` values are calibrated so that a normal move peaks around 0.7 before the master volume.
 */
const WOOD_MODES = [
  { freq: 170, q: 3, gain: 18.4 },
  { freq: 360, q: 4, gain: 15.5 },
  { freq: 680, q: 5, gain: 11.4 },
  { freq: 1100, q: 6, gain: 6.4 },
  { freq: 1700, q: 6, gain: 3 },
] as const;

/** Volume of a knock relative to the other sounds (1 = the calibrated peak of ~0.7). */
const KNOCK_LEVEL = 0.7;
/** Multiplies the resonances above 1 kHz: raise for a brighter knock, lower for a duller one. */
const BRIGHTNESS = 1;
/** Everything above this is removed, so knocks never get shrill. */
const KNOCK_LOWPASS_HZ = 2400;
/** How much noise ("grit") is mixed into the tap, relative to the clean click. */
const GRIT = 0.5;

interface KnockOptions {
  /** How hard the piece lands (1 = a normal move). */
  readonly force: number;
  /** Frequency multiplier: below 1 sounds heavier. */
  readonly pitch: number;
}

function woodKnock(synth: Synth, t: number, { force, pitch }: KnockOptions): void {
  const { ctx, out, random } = synth;
  // Each knock differs slightly in pitch, damping and force, so repeated moves never sound
  // mechanical.
  const wobble = 1 + (random() - 0.5) * 0.06;
  const strength = force * (0.9 + random() * 0.2);

  const tap = ctx.createGain();
  const click = ctx.createBufferSource();
  click.buffer = synth.impulse;
  click.connect(tap);
  const grit = ctx.createBufferSource();
  grit.buffer = synth.noise;
  const gritEnvelope = ctx.createGain();
  gritEnvelope.gain.setValueAtTime(0.0001, t);
  gritEnvelope.gain.exponentialRampToValueAtTime(GRIT, t + 0.0005);
  gritEnvelope.gain.exponentialRampToValueAtTime(0.0001, t + 0.004);
  grit.connect(gritEnvelope).connect(tap);

  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = KNOCK_LOWPASS_HZ;
  tone.Q.value = 0.707;
  tone.connect(out);

  for (const mode of WOOD_MODES) {
    const resonance = ctx.createBiquadFilter();
    resonance.type = 'bandpass';
    resonance.frequency.value = mode.freq * pitch * wobble * (1 + (random() - 0.5) * 0.02);
    resonance.Q.value = mode.q * (1 + (random() - 0.5) * 0.16);
    const level = ctx.createGain();
    level.gain.value = mode.gain * strength * KNOCK_LEVEL * (mode.freq > 1000 ? BRIGHTNESS : 1);
    tap.connect(resonance).connect(level).connect(tone);
  }

  click.start(t);
  click.stop(t + 0.01);
  grit.start(t, random() * 0.2); // a different slice of noise each time
  grit.stop(t + 0.01);
}

interface ThumpOptions {
  /** Final pitch of the low thump, in Hz. */
  readonly pitch: number;
  /** Loudness of the thump (0-1). */
  readonly body: number;
  /** Loudness of the noise click (0-1). */
  readonly noise: number;
  /** Duration of the click, in seconds (the thump lasts 1.6x longer). */
  readonly decay: number;
  /** Centre frequency of the click, in Hz: lower sounds duller. */
  readonly brightness: number;
}

/** A dull impact: a quick pitch-dropping thump plus a short filtered noise burst. */
function thump(synth: Synth, t: number, options: ThumpOptions): void {
  const { ctx, out } = synth;
  const tail = options.decay * 1.6;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(options.pitch * 1.6, t);
  osc.frequency.exponentialRampToValueAtTime(options.pitch, t + 0.04);
  const oscGain = ctx.createGain();
  oscGain.gain.setValueAtTime(options.body, t);
  oscGain.gain.exponentialRampToValueAtTime(0.001, t + tail);
  osc.connect(oscGain).connect(out);
  osc.start(t);
  osc.stop(t + tail + 0.02);

  const click = ctx.createBufferSource();
  click.buffer = synth.noise;
  const filter = ctx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = options.brightness;
  filter.Q.value = 0.9;
  const clickGain = ctx.createGain();
  clickGain.gain.setValueAtTime(options.noise, t);
  clickGain.gain.exponentialRampToValueAtTime(0.001, t + options.decay);
  click.connect(filter).connect(clickGain).connect(out);
  click.start(t);
  click.stop(t + options.decay + 0.02);
}

interface ToneOptions {
  readonly freq: number;
  readonly type: OscillatorType;
  readonly peak: number;
  /** Seconds until the note has faded out. */
  readonly duration: number;
  /** Optional low-pass cut-off, in Hz, to soften harsh waveforms. */
  readonly lowpass?: number;
}

/** A pitched note with a fast attack and an exponential release. */
function tone(synth: Synth, t: number, options: ToneOptions): void {
  const { ctx, out } = synth;
  const osc = ctx.createOscillator();
  osc.type = options.type;
  osc.frequency.setValueAtTime(options.freq, t);

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(options.peak, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + options.duration);

  if (options.lowpass) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = options.lowpass;
    osc.connect(filter).connect(gain).connect(out);
  } else {
    osc.connect(gain).connect(out);
  }
  osc.start(t);
  osc.stop(t + options.duration + 0.02);
}

/** Delay before the victory jingle, matching the banner's fade-in. */
const VICTORY_DELAY_S = 0.3;
const VICTORY_ARPEGGIO_HZ = [523.25, 659.25, 783.99, 1046.5]; // C5 E5 G5 C6
const VICTORY_SPARKLE_HZ = [2093, 2637, 3136];

export const recipes: Record<SoundName, (synth: Synth, t: number) => void> = {
  move: (synth, t) => woodKnock(synth, t, { force: 1, pitch: 1 }),

  // A single, heavier and lower knock. (Two similar impacts in a row sound like an echo.)
  capture: (synth, t) => woodKnock(synth, t, { force: 1.4, pitch: 0.9 }),

  error: (synth, t) => {
    thump(synth, t, { pitch: 75, body: 0.6, noise: 0.25, decay: 0.12, brightness: 500 });
    tone(synth, t, { freq: 196, type: 'sawtooth', peak: 0.25, duration: 0.1, lowpass: 900 });
    tone(synth, t + 0.11, {
      freq: 147,
      type: 'sawtooth',
      peak: 0.25,
      duration: 0.14,
      lowpass: 900,
    });
  },

  victory: (synth, t) => {
    const start = t + VICTORY_DELAY_S;
    VICTORY_ARPEGGIO_HZ.forEach((freq, index) => {
      const isLast = index === VICTORY_ARPEGGIO_HZ.length - 1;
      tone(synth, start + index * 0.11, {
        freq,
        type: 'triangle',
        peak: 0.22,
        duration: isLast ? 1.1 : 0.5,
      });
    });
    VICTORY_SPARKLE_HZ.forEach((freq, index) => {
      tone(synth, start + 0.5 + index * 0.12, { freq, type: 'sine', peak: 0.07, duration: 0.35 });
    });
  },
};
