"use client";

import { useEffect, useState } from "react";
import { PageHeader, SpeakButton } from "@/components/ui/Controls";
import { Icon } from "@/components/ui/Icon";
import { previewVoice, rankVoices, reloadVoices, setChosenVoice, shortVoiceName, speak, warmUpSpeech } from "@/lib/speak";
import { useSpeechPrefs } from "@/lib/useSpeechPrefs";

const SAMPLE = "你好，我是你的中文老师。多，锅。";

/**
 * Every voice this browser offers, each playable, to pick the one that sounds
 * best here. Each device and browser lists its own voices under its own names,
 * so the choice is saved on this device only.
 */
export function VoiceScreen() {
  const { voices, chosen, speaking, failure } = useSpeechPrefs();
  const [showAll, setShowAll] = useState(false);
  useEffect(() => warmUpSpeech(), []);

  const chinese = rankVoices(voices);
  const others = voices.filter((v) => !chinese.includes(v));
  const chosenHere = chosen !== null && voices.some((v) => v.name === chosen);

  const choose = (v: SpeechSynthesisVoice | null) => {
    setChosenVoice(v?.name ?? null);
    if (v) previewVoice(SAMPLE, v);
    else speak(SAMPLE);
  };

  const row = (v: SpeechSynthesisVoice) => {
    const active = chosenHere && v.name === chosen;
    return (
      <div key={v.voiceURI + v.name} className="flex items-center gap-3 px-4 py-3">
        <button
          type="button"
          role="radio"
          aria-checked={active}
          onClick={() => choose(v)}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
        >
          <Radio on={active} />
          <span className="min-w-0">
            <span className="block font-bold text-ink">{shortVoiceName(v)}</span>
            <span className="block break-words text-xs text-ink-3">
              {v.name} · {v.lang || "no language"} · {v.localService ? "on this device" : "online"}
            </span>
          </span>
        </button>
        <SpeakButton onClick={() => previewVoice(SAMPLE, v)} size="sm" label={`Play ${shortVoiceName(v)}`} />
      </div>
    );
  };

  return (
    <main className="flex flex-1 flex-col pb-28">
      <PageHeader title="Voice" back="/settings" />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4">
        <p className="px-1 text-sm text-ink-2">
          Tap a voice to use it, or the speaker to hear it first. Voices differ between phones and browsers, so the
          choice is saved on this device only.
        </p>

        <section className="flex flex-col gap-2">
          <h2 className="px-1 text-xs font-extrabold uppercase tracking-wider text-ink-3">Chinese voices</h2>
          <div className="card flex flex-col divide-y-2 divide-line">
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                type="button"
                role="radio"
                aria-checked={!chosenHere}
                onClick={() => choose(null)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <Radio on={!chosenHere} />
                <span className="min-w-0">
                  <span className="block font-bold text-ink">Best available</span>
                  <span className="block text-xs text-ink-3">
                    {speaking && !chosenHere ? `Now ${shortVoiceName(speaking)}. ` : ""}A natural voice when online, this
                    device&apos;s voice offline.
                  </span>
                </span>
              </button>
              <SpeakButton onClick={() => speak(SAMPLE)} size="sm" label="Play the best available voice" />
            </div>
            {chinese.map(row)}
            {chinese.length === 0 && (
              <p className="px-4 py-3 text-sm text-ink-3">
                {voices.length === 0 ? "No voices listed yet." : "None of this browser's voices say they speak Chinese."}
              </p>
            )}
          </div>
        </section>

        {failure && (
          <p className="flex gap-2 rounded-2xl bg-red-soft px-4 py-3 text-sm font-semibold text-red-ink">
            <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
            <span>
              {shortVoiceName({ name: failure.voice } as SpeechSynthesisVoice)} failed to speak ({failure.error}) at{" "}
              {new Date(failure.at).toLocaleTimeString()}.
            </span>
          </p>
        )}

        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-xs font-extrabold uppercase tracking-wider text-ink-3">Other voices ({others.length})</h2>
            <button type="button" onClick={() => setShowAll((s) => !s)} className="text-sm font-bold text-blue-ink">
              {showAll ? "Hide" : "Show"}
            </button>
          </div>
          {showAll && others.length > 0 && <div className="card flex flex-col divide-y-2 divide-line">{others.map(row)}</div>}
        </section>

        <button type="button" onClick={reloadVoices} className="btn btn-secondary btn-sm self-center">
          <Icon name="refresh" size={18} />
          Reload voice list
        </button>
      </div>
    </main>
  );
}

function Radio({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-6 shrink-0 place-items-center rounded-full border-2 ${on ? "border-blue bg-blue" : "border-line"}`}
    >
      {on && <span className="size-2.5 rounded-full bg-white" />}
    </span>
  );
}
