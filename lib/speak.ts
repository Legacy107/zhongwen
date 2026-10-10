/**
 * Mandarin text-to-speech via the browser.
 *
 * Three constraints shape this module:
 *
 * - iOS Safari only lets a page speak from inside the user's tap. Any `await`
 *   before `speechSynthesis.speak()` leaves that call stack and the utterance
 *   is silently dropped, so `speak()` is synchronous. The voice list loads
 *   asynchronously in every browser, so it is cached as it arrives; a call made
 *   before it lands speaks with `lang` alone and lets the browser choose.
 *
 * - Voice choice matters for a learner. Edge, on Android as well as desktop,
 *   offers Microsoft's neural voices (Xiaoxiao and others, the Read Aloud
 *   voices), which are far clearer than the device's own. macOS and iOS list
 *   Apple's novelty voices (Eddy, Grandma, Rocko…) first alphabetically, and
 *   taking the first zh-CN voice picked one of those. Voices are ranked instead.
 *
 * - The neural voices are fetched from Microsoft as they speak, so they fail
 *   offline. Offline, or after one fails, the best local voice speaks instead.
 *
 * Voice and speed are kept per device in localStorage: each device has its own
 * voices, and a speed only means something for the voice it was chosen with.
 */

let voices: SpeechSynthesisVoice[] = [];
let listening = false;
const voiceListeners = new Set<() => void>();

/** Held so Chrome cannot garbage-collect an utterance mid-speech and cut it off. */
let current: SpeechSynthesisUtterance | null = null;

/** When a network voice last failed. They are skipped for a while after. */
let networkFailedAt = 0;
const NETWORK_RETRY_MS = 5 * 60_000;

/** Apple's Eloquence character voices: fine for fun, wrong for learning tones. */
const NOVELTY =
  /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;

/** Microsoft's neural voices, which Edge names "Microsoft Xiaoxiao Online (Natural) - …". */
const NATURAL = /Online \(Natural\)/i;

/** Neural voices, best first: the clear, even-paced ones suit a beginner. */
const NATURAL_PREFERRED = [/Xiaoxiao|晓晓/i, /Xiaoyi|晓伊/i, /Yunxi\b|云希/i, /Yunjian|云健/i, /Yunyang|云扬/i];

/** Natural-sounding local Mandarin voices, best first. */
const PREFERRED = [/Tingting/i, /Li-?Mu/i, /Yu-?shu/i, /普通话|Mandarin/i];

export type SpeechSpeed = "slow" | "relaxed" | "natural";

export const SPEECH_RATE: Record<SpeechSpeed, number> = { slow: 0.7, relaxed: 0.85, natural: 1 };

/** The slow replay: always slower than the chosen speed. */
const SLOW_RATE = 0.55;

const SPEED_KEY = "chinese.speechSpeed";
const VOICE_KEY = "chinese.voice";

function notify(): void {
  voiceListeners.forEach((l) => l());
}

function refreshVoices(): void {
  voices = speechSynthesis.getVoices();
  notify();
}

function ensureVoiceList(): void {
  if (listening) return;
  listening = true;
  refreshVoices();
  speechSynthesis.addEventListener("voiceschanged", refreshVoices);
  // Going offline or back online changes which voice speaks.
  window.addEventListener("online", notify);
  window.addEventListener("offline", notify);
}

/** Android reports `zh_CN`, others `zh-CN`; Google's Android voices say `cmn-CN`. */
function region(v: SpeechSynthesisVoice): "mainland" | "other" | null {
  const lang = v.lang.replace("_", "-");
  if (/^(zh|cmn)-(CN|Hans)/i.test(lang)) return "mainland";
  if (/^(zh|cmn)\b/i.test(lang)) return "other";
  return null;
}

function score(v: SpeechSynthesisVoice, online: boolean): number {
  const r = region(v);
  let s = r === "mainland" ? 100 : r === "other" ? 10 : 0;
  if (NOVELTY.test(v.name)) s -= 1000;
  if (NATURAL.test(v.name)) {
    const rank = NATURAL_PREFERRED.findIndex((re) => re.test(v.name));
    s += online ? 80 - (rank === -1 ? NATURAL_PREFERRED.length : rank) * 2 : -60;
  } else {
    const rank = PREFERRED.findIndex((re) => re.test(v.name));
    if (rank !== -1) s += 50 - rank * 5;
  }
  if (v.localService) s += 20;
  else if (!online) s -= 60;
  return s;
}

export interface VoiceOptions {
  /** Whether network voices can be reached. Defaults to true. */
  online?: boolean;
  /** The name of the voice chosen in Settings, if any. */
  chosen?: string | null;
}

/** This device's Chinese voices, best first. */
export function rankVoices(list: SpeechSynthesisVoice[], { online = true }: VoiceOptions = {}): SpeechSynthesisVoice[] {
  return list
    .filter((v) => region(v) && score(v, online) > 0)
    .sort((a, b) => score(b, online) - score(a, online));
}

export function pickVoice(list: SpeechSynthesisVoice[], options: VoiceOptions = {}): SpeechSynthesisVoice | undefined {
  const online = options.online ?? true;
  const chosen = options.chosen ? list.find((v) => v.name === options.chosen) : undefined;
  // A chosen network voice can't speak offline; fall back to the ranking then.
  if (chosen && (online || chosen.localService)) return chosen;
  return rankVoices(list, { online })[0];
}

/** "Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)" → "Xiaoxiao". */
export function shortVoiceName(v: SpeechSynthesisVoice): string {
  const ms = v.name.match(/^Microsoft (\S+)/);
  return ms ? ms[1] : v.name;
}

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Starts loading the voice list early, so the first tap has a good voice. */
export function warmUpSpeech(): void {
  if (isSpeechSupported()) ensureVoiceList();
}

let unlocked = false;

/**
 * iOS lets a page speak only once speech has been started from a user
 * gesture. Speaking a silent utterance on the first touch anywhere unlocks
 * it for the life of the page, so audio that plays on arrival (a new word, the
 * first tone drill) is heard rather than silently dropped. Call from a
 * pointerdown handler.
 */
export function unlockSpeech(): void {
  if (unlocked || !isSpeechSupported()) return;
  unlocked = true;
  ensureVoiceList();
  const u = new SpeechSynthesisUtterance(" ");
  u.volume = 0;
  speechSynthesis.speak(u);
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Private mode: the choice just won't persist.
  }
  notify();
}

export function getSpeechSpeed(): SpeechSpeed {
  const s = read(SPEED_KEY);
  return s === "slow" || s === "natural" ? s : "relaxed";
}

export function setSpeechSpeed(speed: SpeechSpeed): void {
  write(SPEED_KEY, speed);
}

/** The voice chosen in Settings, or null for the best available. */
export function getChosenVoice(): string | null {
  return read(VOICE_KEY);
}

export function setChosenVoice(name: string | null): void {
  write(VOICE_KEY, name);
}

function networkOk(): boolean {
  return navigator.onLine && Date.now() - networkFailedAt > NETWORK_RETRY_MS;
}

/** Calls back when the voice list arrives or a speech preference changes. */
export function onSpeechChange(listener: () => void): () => void {
  voiceListeners.add(listener);
  return () => voiceListeners.delete(listener);
}

/** The cached voice list: a new array only when it changes. */
export function getVoiceList(): SpeechSynthesisVoice[] {
  return voices;
}

/** The voice the next utterance would use, once warmUpSpeech has loaded the list. */
export function currentVoice(): SpeechSynthesisVoice | undefined {
  if (!isSpeechSupported()) return undefined;
  return pickVoice(voices, { online: networkOk(), chosen: getChosenVoice() });
}

function utter(text: string, rate: number, voice: SpeechSynthesisVoice | undefined): void {
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  u.rate = rate;
  if (voice) u.voice = voice;
  current = u;
  u.onend = () => {
    if (current === u) current = null;
  };
  if (voice && !voice.localService) {
    u.onerror = (e) => {
      // Cut off by the next word, not a failure.
      if (e.error === "interrupted" || e.error === "canceled" || current !== u) return;
      networkFailedAt = Date.now();
      notify();
      utter(text, rate, pickVoice(voices, { online: false }));
    };
  }
  speechSynthesis.speak(u);
}

export function speak(text: string, { slow = false }: { slow?: boolean } = {}): void {
  if (!isSpeechSupported()) return;
  ensureVoiceList();

  // Cancel only when something is playing: rapid taps then interrupt the
  // previous word, as Duolingo does, instead of queueing behind it.
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();

  utter(text, slow ? SLOW_RATE : SPEECH_RATE[getSpeechSpeed()], currentVoice());
}
