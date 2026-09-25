/**
 * Sound effects, synthesised with WebAudio rather than sampled.
 *
 * No audio files means no asset licensing, nothing extra to precache, and
 * nothing to fail to load offline. The voices are built to sound like struck
 * mallet instruments rather than test tones: a sine fundamental with a few
 * decaying partials, a short noise transient for the strike, a compressor so
 * layered cues never clip, and a small generated reverb for space.
 *
 * iOS will not start an AudioContext outside a user gesture, so
 * `unlockAudio()` runs on the first tap anywhere (see AudioUnlock) before any
 * cue can be heard. iOS also silences WebAudio when the ringer switch is off.
 */

type Ctx = AudioContext;

let ctx: Ctx | null = null;
let dry: GainNode | null = null;
let wet: GainNode | null = null;
let noiseBuffer: AudioBuffer | null = null;
let enabled: boolean | null = null;
/** Set while resume() is in flight. */
let resuming: Promise<void> | null = null;

const SETTING_KEY = 'sfxEnabled';

function context(): Ctx | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/** A generated room: decaying stereo noise, so there is no impulse-response file. */
function impulse(c: Ctx, seconds: number, decay: number): AudioBuffer {
  const length = Math.floor(c.sampleRate * seconds);
  const buffer = c.createBuffer(2, length, c.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length) ** decay;
  }
  return buffer;
}

function bus(): { c: Ctx; dry: GainNode; wet: GainNode } | null {
  const c = context();
  // The first tap resumes the context and plays a cue in the same handler.
  // resume() is async, so the cue must schedule while it is in flight: the
  // clock is frozen until then, and the notes start the moment it runs.
  if (!c || (c.state !== 'running' && !resuming)) return null;
  if (!dry || !wet) {
    const compressor = c.createDynamicsCompressor();
    compressor.threshold.value = -16;
    compressor.knee.value = 10;
    compressor.ratio.value = 4;
    compressor.attack.value = 0.002;
    compressor.release.value = 0.2;

    const master = c.createGain();
    master.gain.value = 0.85;
    master.connect(compressor).connect(c.destination);

    dry = c.createGain();
    dry.connect(master);

    const reverb = c.createConvolver();
    reverb.buffer = impulse(c, 1.2, 3);
    wet = c.createGain();
    wet.gain.value = 0.22;
    wet.connect(reverb).connect(master);
  }
  return { c, dry, wet };
}

function noise(c: Ctx): AudioBuffer {
  if (!noiseBuffer) {
    noiseBuffer = c.createBuffer(1, c.sampleRate / 2, c.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noiseBuffer;
}

interface Env {
  /** Seconds after the cue starts. */
  at: number;
  /** Peak gain. */
  gain: number;
  /** Seconds to decay to silence. */
  decay: number;
  attack?: number;
}

/** One enveloped oscillator into the dry and (optionally) reverb bus. */
function partial(
  freq: number,
  type: OscillatorType,
  { at, gain, decay, attack = 0.004 }: Env,
  reverb = 1,
  glideFrom?: number,
): void {
  const b = bus();
  if (!b) return;
  const { c } = b;
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const env = c.createGain();
  osc.type = type;
  if (glideFrom) {
    osc.frequency.setValueAtTime(glideFrom, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + Math.min(0.08, decay / 2));
  } else {
    osc.frequency.setValueAtTime(freq, t);
  }
  // Ramping from zero on both ends; a hard start or stop is an audible click.
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  osc.connect(env);
  env.connect(b.dry);
  if (reverb > 0) {
    const send = c.createGain();
    send.gain.value = reverb;
    env.connect(send).connect(b.wet);
  }
  osc.start(t);
  osc.stop(t + attack + decay + 0.05);
}

/** A filtered noise burst: the stick hitting the bar, or a soft whoosh. */
function hiss(
  { at, gain, decay, attack = 0.001 }: Env,
  filter: BiquadFilterType,
  freq: number,
  q = 1,
  sweepTo?: number,
): void {
  const b = bus();
  if (!b) return;
  const { c } = b;
  const t = c.currentTime + at;
  const src = c.createBufferSource();
  src.buffer = noise(c);
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + attack + decay);
  f.Q.value = q;
  const env = c.createGain();
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  src.connect(f).connect(env).connect(b.dry);
  src.start(t);
  src.stop(t + attack + decay + 0.05);
}

/**
 * A struck bar: glockenspiel-bright when `bright`, marimba-warm otherwise.
 * The partial ratios are what make it read as an instrument; the upper ones
 * die faster than the fundamental, as they do on a real bar.
 */
function mallet(freq: number, at: number, gain: number, decay = 0.45, bright = true): void {
  partial(freq, 'sine', { at, gain, decay });
  partial(freq * 2.0, 'sine', { at, gain: gain * 0.28, decay: decay * 0.55 });
  partial(freq * (bright ? 3.01 : 4.0), 'sine', { at, gain: gain * 0.14, decay: decay * 0.3 });
  partial(freq * 0.5, 'triangle', { at, gain: gain * 0.12, decay: decay * 0.7 }, 0.4);
  hiss({ at, gain: gain * 0.35, decay: 0.012 }, 'highpass', 5000, 0.7);
}

/** A short woody pop with a falling pitch, for taps. */
function pop(freq: number, at: number, gain: number, decay = 0.07): void {
  partial(freq, 'sine', { at, gain, decay, attack: 0.002 }, 0.15, freq * 1.6);
  hiss({ at, gain: gain * 0.25, decay: 0.008 }, 'bandpass', 2600, 1.2);
}

const NOTE = {
  G4: 392,
  C5: 523.25,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
  A5: 880,
  C6: 1046.5,
  D6: 1174.66,
  E6: 1318.51,
  G6: 1567.98,
  A6: 1760,
  C7: 2093,
  E7: 2637,
  G7: 3136,
} as const;

function on(): boolean {
  if (enabled === null) {
    try {
      enabled = localStorage.getItem(SETTING_KEY) !== '0';
    } catch {
      enabled = true;
    }
  }
  return enabled;
}

/** Call from any tap handler. Safe to call repeatedly. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state === 'suspended' && !resuming) {
    resuming = c
      .resume()
      .catch(() => {})
      .finally(() => {
        resuming = null;
      });
  }
}

export function setSfxEnabled(value: boolean): void {
  enabled = value;
  try {
    localStorage.setItem(SETTING_KEY, value ? '1' : '0');
  } catch {
    // Private mode; the in-memory flag still holds for this session.
  }
}

export function isSfxEnabled(): boolean {
  return on();
}

function cue(play: () => void, vibrate?: number | number[]): void {
  if (!on()) return;
  unlockAudio();
  play();
  // Android only: iOS Safari has no vibration API, so this is a no-op there.
  if (vibrate && typeof navigator !== 'undefined') navigator.vibrate?.(vibrate);
}

/** Picking up a word tile. */
export function playTap(): void {
  cue(() => pop(760, 0, 0.3));
}

/**
 * Placing the nth tile of an answer when speech is off: each one a step up a
 * pentatonic scale, so building a sentence sounds like it is going somewhere.
 */
export function playTilePlace(slot: number): void {
  const scale = [NOTE.E5, 739.99, 830.61, 987.77, 1108.73, NOTE.E6];
  cue(() => pop(scale[Math.min(slot, scale.length - 1)], 0, 0.26, 0.09));
}

/** Putting a tile back. Lower, so the two directions sound different. */
export function playTileRemove(): void {
  cue(() => pop(520, 0, 0.26));
}

/** A plain button or option press. Barely there. */
export function playPress(): void {
  cue(() => {
    hiss({ at: 0, gain: 0.08, decay: 0.01 }, 'bandpass', 3200, 1.5);
    partial(1400, 'sine', { at: 0, gain: 0.05, decay: 0.03, attack: 0.001 }, 0);
  });
}

/** Correct answer: a bright rising fifth with a sparkle on top. */
export function playCorrect(): void {
  cue(() => {
    mallet(NOTE.C6, 0, 0.32, 0.35);
    mallet(NOTE.G6, 0.085, 0.34, 0.55);
    partial(NOTE.G7, 'sine', { at: 0.09, gain: 0.05, decay: 0.25 }, 1);
  });
}

/** Wrong answer: a soft, low two-note droop. Kind, because it fires while learning. */
export function playWrong(): void {
  cue(() => {
    for (const [freq, at] of [
      [311.13, 0],
      [233.08, 0.13],
    ] as const) {
      partial(freq, 'triangle', { at, gain: 0.22, decay: 0.2, attack: 0.008 }, 0.2);
      partial(freq * 1.004, 'square', { at, gain: 0.035, decay: 0.12, attack: 0.008 }, 0);
      partial(freq / 2, 'sine', { at, gain: 0.16, decay: 0.18, attack: 0.006 }, 0);
    }
  }, [30, 60, 30]);
}

/** Several right in a row. Climbs higher the longer the run. */
export function playCombo(run: number): void {
  const scale = [NOTE.C6, NOTE.D6, NOTE.E6, NOTE.G6, NOTE.A6, NOTE.C7];
  const count = run >= 10 ? 6 : run >= 5 ? 5 : 4;
  cue(() => {
    scale.slice(0, count).forEach((f, i) => mallet(f, i * 0.055, 0.2, 0.3));
    partial(NOTE.E7, 'sine', { at: count * 0.055, gain: 0.05, decay: 0.4 }, 1);
  });
}

/** Session complete: an arpeggio resolving onto a ringing chord. */
export function playFanfare(): void {
  cue(() => {
    [NOTE.C5, NOTE.E5, NOTE.G5].forEach((f, i) => mallet(f, i * 0.1, 0.26, 0.4, false));
    for (const f of [NOTE.C6, NOTE.E6, NOTE.G6]) mallet(f, 0.3, 0.2, 1.1);
    [NOTE.C7, NOTE.E7, NOTE.G7].forEach((f, i) =>
      partial(f, 'sine', { at: 0.42 + i * 0.06, gain: 0.04, decay: 0.5 }, 1),
    );
  });
}

/** Daily goal met: brighter and longer than a session, with a rising whoosh. */
export function playGoal(): void {
  cue(() => {
    hiss({ at: 0, gain: 0.12, decay: 0.45, attack: 0.25 }, 'bandpass', 600, 0.8, 5000);
    [NOTE.G5, NOTE.C6, NOTE.E6, NOTE.G6].forEach((f, i) => mallet(f, 0.25 + i * 0.07, 0.24, 0.4));
    for (const f of [NOTE.C6, NOTE.E6, NOTE.G6, NOTE.C7]) mallet(f, 0.56, 0.16, 1.3);
    [NOTE.E7, NOTE.G7, NOTE.C7 * 2].forEach((f, i) =>
      partial(f, 'sine', { at: 0.62 + i * 0.05, gain: 0.035, decay: 0.6 }, 1),
    );
  }, [20, 40, 20, 40, 60]);
}

/** A word added to reviews: an upward bubble and a small chime. */
export function playMined(): void {
  cue(() => {
    partial(1350, 'sine', { at: 0, gain: 0.2, decay: 0.12, attack: 0.003 }, 0.3, 480);
    mallet(NOTE.E6, 0.07, 0.14, 0.3);
    mallet(NOTE.A6, 0.12, 0.12, 0.4);
  });
}

/** A new sentence or card sliding in. Very quiet; it only marks the beat. */
export function playNext(): void {
  cue(() => hiss({ at: 0, gain: 0.05, decay: 0.12, attack: 0.03 }, 'bandpass', 900, 0.6, 2400));
}
