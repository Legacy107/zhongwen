/**
 * Mandarin text-to-speech via the browser.
 *
 * Chromium populates the voice list asynchronously, so the first call before
 * `voiceschanged` fires returns an empty array and would silently pick no
 * voice. Prerendered audio replaces this later; this keeps Stage 1 free and
 * offline-capable in the meantime.
 *
 * Known limits: iOS silences speech when the hardware mute switch is on, and
 * Google's zh-CN voices are network-backed, so offline playback falls back to
 * whatever local voice exists.
 */

let voicesReady: Promise<SpeechSynthesisVoice[]> | null = null;

function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  if (voicesReady) return voicesReady;
  voicesReady = new Promise((resolve) => {
    const existing = speechSynthesis.getVoices();
    if (existing.length) return resolve(existing);
    const onChange = () => {
      speechSynthesis.removeEventListener("voiceschanged", onChange);
      resolve(speechSynthesis.getVoices());
    };
    speechSynthesis.addEventListener("voiceschanged", onChange);
    // Safari sometimes never fires the event; don't hang forever.
    setTimeout(() => resolve(speechSynthesis.getVoices()), 1000);
  });
  return voicesReady;
}

export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export async function speak(text: string, rate = 0.9): Promise<void> {
  if (!isSpeechSupported()) return;
  const voices = await loadVoices();
  const zh =
    voices.find((v) => v.lang === "zh-CN" && v.localService) ??
    voices.find((v) => v.lang === "zh-CN") ??
    voices.find((v) => v.lang.startsWith("zh"));

  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = "zh-CN";
  u.rate = rate;
  if (zh) u.voice = zh;
  speechSynthesis.speak(u);
}
