/**
 * Review sound effects, synthesised with WebAudio rather than sampled.
 *
 * No audio files means no asset licensing, nothing to precache, and no 30 KB
 * playback library. The cues here are short pitched blips; they only need to be
 * distinguishable, not musical.
 *
 * iOS will not start an AudioContext outside a user gesture, so `unlockAudio()`
 * must be called from a real tap before any cue can be heard.
 */

let ctx: AudioContext | null = null;
let enabled = true;

const SETTING_KEY = 'sfxEnabled';

function context(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  return ctx;
}

/** Call from a tap handler. Safe to call repeatedly. */
export function unlockAudio(): void {
  const c = context();
  if (c && c.state === 'suspended') void c.resume();
}

export function setSfxEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(SETTING_KEY, on ? '1' : '0');
  } catch {
    // Private mode; the in-memory flag still holds for this session.
  }
}

export function isSfxEnabled(): boolean {
  try {
    const raw = localStorage.getItem(SETTING_KEY);
    if (raw !== null) enabled = raw === '1';
  } catch {
    // Ignore; fall back to the in-memory default.
  }
  return enabled;
}

interface Blip {
  freq: number;
  /** Seconds. */
  duration: number;
  type?: OscillatorType;
  /** Seconds from the start of the cue. */
  at?: number;
  gain?: number;
}

function play(blips: Blip[]): void {
  if (!enabled) return;
  const c = context();
  if (!c || c.state !== 'running') return;

  const now = c.currentTime;
  for (const b of blips) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    const start = now + (b.at ?? 0);
    const peak = b.gain ?? 0.08;

    osc.type = b.type ?? 'sine';
    osc.frequency.setValueAtTime(b.freq, start);

    // A short ramp on both ends; a raw start/stop produces an audible click.
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + b.duration);

    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + b.duration + 0.02);
  }
}

/** Correct answer: a rising two-note cue. */
export function playCorrect(): void {
  play([
    { freq: 660, duration: 0.11 },
    { freq: 880, duration: 0.16, at: 0.09 },
  ]);
}

/** Wrong answer: low and short. Deliberately soft — this fires while learning. */
export function playWrong(): void {
  play([{ freq: 196, duration: 0.18, type: 'triangle', gain: 0.06 }]);
}

/** Tile tap: barely-there click for tactile feedback. */
export function playTap(): void {
  play([{ freq: 520, duration: 0.045, gain: 0.035 }]);
}

/** Session or goal complete: a small arpeggio. */
export function playFanfare(): void {
  play([
    { freq: 523.25, duration: 0.14 },
    { freq: 659.25, duration: 0.14, at: 0.1 },
    { freq: 783.99, duration: 0.14, at: 0.2 },
    { freq: 1046.5, duration: 0.3, at: 0.3 },
  ]);
}
