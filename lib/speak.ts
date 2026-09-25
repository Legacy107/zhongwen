/**
 * Mandarin text-to-speech via the browser.
 *
 * Two constraints shape this module:
 *
 * - iOS Safari only lets a page speak from inside the user's tap. Any `await`
 *   before `speechSynthesis.speak()` leaves that call stack and the utterance
 *   is silently dropped, so `speak()` is synchronous. The voice list loads
 *   asynchronously in every browser, so it is cached as it arrives; a call made
 *   before it lands speaks with `lang` alone and lets the browser choose.
 *
 * - Voice choice matters for a learner. macOS and iOS list Apple's novelty
 *   voices (Eddy, Grandma, Rocko…) first alphabetically, and taking the first
 *   zh-CN voice picked one of those. Voices are ranked instead.
 *
 * Known limits: iOS silences speech when the hardware mute switch is on, and
 * network-backed voices (Google, Microsoft Online) do not work offline, so
 * local voices rank above them.
 */

let voices: SpeechSynthesisVoice[] = [];
let listening = false;

/** Held so Chrome cannot garbage-collect an utterance mid-speech and cut it off. */
let current: SpeechSynthesisUtterance | null = null;

/** Apple's Eloquence character voices: fine for fun, wrong for learning tones. */
const NOVELTY =
  /^(Eddy|Flo|Grandma|Grandpa|Reed|Rocko|Sandy|Shelley)\b/i;

/** Natural-sounding Mandarin voices, best first. */
const PREFERRED = [/Tingting/i, /Li-?Mu/i, /Yu-?shu/i, /Xiaoxiao|晓晓/i, /Natural/i, /普通话|Mandarin/i];

function refreshVoices(): void {
  voices = speechSynthesis.getVoices();
}

function ensureVoiceList(): void {
  if (listening) return;
  listening = true;
  refreshVoices();
  speechSynthesis.addEventListener("voiceschanged", refreshVoices);
}

function score(v: SpeechSynthesisVoice): number {
  let s = 0;
  if (v.lang === "zh-CN") s += 100;
  else if (v.lang.startsWith("zh")) s += 10;
  if (NOVELTY.test(v.name)) s -= 1000;
  const rank = PREFERRED.findIndex((re) => re.test(v.name));
  if (rank !== -1) s += 50 - rank * 5;
  if (v.localService) s += 20;
  return s;
}

export function pickVoice(list: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const zh = list.filter((v) => v.lang.startsWith("zh") || /cmn/i.test(v.lang));
  let best: SpeechSynthesisVoice | undefined;
  for (const v of zh) if (!best || score(v) > score(best)) best = v;
  return best && score(best) > 0 ? best : undefined;
}

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Starts loading the voice list early, so the first tap has a good voice. */
export function warmUpSpeech(): void {
  if (isSpeechSupported()) ensureVoiceList();
}

export function speak(text: string, rate = 0.9): void {
  if (!isSpeechSupported()) return;
  ensureVoiceList();

  // Cancel only when something is playing: rapid taps then interrupt the
  // previous word, as Duolingo does, instead of queueing behind it.
  if (speechSynthesis.speaking || speechSynthesis.pending) speechSynthesis.cancel();

  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  u.rate = rate;
  const voice = pickVoice(voices);
  if (voice) u.voice = voice;
  current = u;
  u.onend = () => {
    if (current === u) current = null;
  };
  speechSynthesis.speak(u);
}
