"use client";

import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { playCorrect, playWrong } from "@/lib/sfx";
import { CONTRAST_LABEL, CONTRAST_NOTE, TONE_ANCHOR, type ToneDrill } from "@/lib/tones";

/** Tone contour glyphs, matching the shape each tone actually traces. */
const TONE_GLYPH: Record<number, string> = { 1: "ˉ", 2: "ˊ", 3: "ˇ", 4: "ˋ" };

function ToneOption({ tones, label }: { tones: number[]; label: string }) {
  return (
    <span className="flex flex-col items-center gap-0.5">
      <span className="text-xl leading-none">{tones.map((t) => TONE_GLYPH[t]).join(" ")}</span>
      <span className="text-[11px] text-neutral-400">{label}</span>
    </span>
  );
}

interface ToneDrillCardProps {
  drill: ToneDrill;
  onAnswer: (correct: boolean) => void;
  onPlayAudio: () => void;
}

export function ToneDrillCard({ drill, onAnswer, onPlayAudio }: ToneDrillCardProps) {
  const [picked, setPicked] = useState<number[] | null>(null);
  const correct = picked !== null && picked.join() === drill.answer.join();

  const choose = useCallback(
    (option: number[]) => {
      if (picked) return;
      setPicked(option);
      if (option.join() === drill.answer.join()) playCorrect();
      else playWrong();
    },
    [picked, drill.answer],
  );

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <p className="text-center text-[11px] uppercase tracking-wide text-neutral-500">
        {CONTRAST_LABEL[drill.contrast]}
      </p>

      <div className="flex flex-col items-center gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
        <span className="text-4xl">{drill.word.simplified}</span>
        {/* Pinyin is hidden until answered - it gives the tone away. */}
        <span className="text-sm text-neutral-500">
          {picked ? drill.word.pinyin : "which tone?"}
        </span>
        <button
          type="button"
          onClick={onPlayAudio}
          className="mt-1 rounded-full bg-neutral-800 px-3 py-1 text-xs active:bg-neutral-700"
        >
          ▶ audio
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {drill.options.map((option) => {
          const isAnswer = option.join() === drill.answer.join();
          const isPicked = picked?.join() === option.join();
          const tone = picked
            ? isAnswer
              ? "border-emerald-600 bg-emerald-950/50"
              : isPicked
                ? "border-rose-600 bg-rose-950/50"
                : "border-neutral-800 opacity-50"
            : "border-neutral-800 bg-neutral-900 active:bg-neutral-800";
          return (
            <motion.button
              key={option.join()}
              type="button"
              onClick={() => choose(option)}
              whileTap={{ scale: 0.97 }}
              className={`flex items-center justify-center rounded-xl border px-3 py-4 ${tone}`}
            >
              <ToneOption tones={option} label={option.join("-")} />
            </motion.button>
          );
        })}
      </div>

      {picked && (
        <div className="flex flex-col gap-3">
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              correct ? "bg-emerald-950/60 text-emerald-300" : "bg-rose-950/60 text-rose-300"
            }`}
          >
            {!correct && drill.foil && (
              <p className="mb-1 font-medium">
                {drill.word.simplified} is {drill.word.pinyin} — {drill.foil.simplified} is{" "}
                {drill.foil.pinyin}
              </p>
            )}
            <p className="text-neutral-300">{CONTRAST_NOTE[drill.contrast]}</p>
            <p className="mt-2 text-neutral-400">
              {drill.answer
                .map((t) => `${TONE_GLYPH[t]} ${TONE_ANCHOR[t].name}: ${TONE_ANCHOR[t].hint}`)
                .join(" · ")}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onAnswer(correct)}
            className="rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white active:bg-emerald-700"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
