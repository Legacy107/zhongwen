"use client";

import { motion } from "motion/react";
import { useCallback, useState } from "react";
import { GAP_READINGS, type GapFill, type Sentence } from "@/lib/sentences";
import { playCorrect, playWrong } from "@/lib/sfx";
import { speak } from "@/lib/speak";

interface GapFillCardProps {
  sentence: Sentence;
  gap: GapFill;
  onDone: (correct: boolean) => void;
}

export function GapFillCard({ sentence, gap, onDone }: GapFillCardProps) {
  const [picked, setPicked] = useState<string | null>(null);
  const correct = picked === gap.answer;

  const choose = useCallback(
    (option: string) => {
      if (picked) return;
      setPicked(option);
      if (option === gap.answer) playCorrect();
      else playWrong();
      // The gap is filled now, so the sentence is complete and safe to speak.
      void speak(sentence.hanzi);
    },
    [picked, gap.answer, sentence.hanzi],
  );

  return (
    <div className="flex w-full max-w-md flex-col gap-4">
      <p className="text-center text-[11px] uppercase tracking-wide text-neutral-500">
        {gap.isMeasureWord ? "Measure word" : "Particle"}
      </p>
      <p className="text-center text-sm text-neutral-400">{sentence.enGloss}</p>

      <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
        {sentence.tiles.map((t, i) => (
          <span key={`${i}:${t.text}`} className="flex flex-col items-center">
            {i === gap.gapIndex ? (
              <span
                className={`min-w-10 rounded-md border-b-2 px-2 text-xl leading-tight ${
                  picked
                    ? correct
                      ? "border-emerald-500 text-emerald-300"
                      : "border-rose-500 text-rose-300"
                    : "border-neutral-600 text-neutral-700"
                }`}
              >
                {picked ?? "　"}
              </span>
            ) : (
              <span className="px-0.5 text-xl leading-tight">{t.text}</span>
            )}
            <span className="text-[10px] text-neutral-600">
              {i === gap.gapIndex ? "?" : t.pinyin}
            </span>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-2">
        {gap.options.map((option) => {
          const isAnswer = option === gap.answer;
          const tone = picked
            ? isAnswer
              ? "border-emerald-600 bg-emerald-950/50"
              : option === picked
                ? "border-rose-600 bg-rose-950/50"
                : "border-neutral-800 opacity-50"
            : "border-neutral-800 bg-neutral-900 active:bg-neutral-800";
          return (
            <motion.button
              key={option}
              type="button"
              onClick={() => choose(option)}
              whileTap={{ scale: 0.95 }}
              className={`flex flex-col items-center rounded-xl border py-3 ${tone}`}
            >
              <span className="text-xl leading-tight">{option}</span>
              <span className="text-[10px] text-neutral-500">{GAP_READINGS[option] ?? ""}</span>
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
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-medium">{sentence.hanzi}</p>
                <p className="mt-1 text-neutral-400">{sentence.pinyin}</p>
                <p className="mt-1 text-neutral-500">{sentence.viGloss}</p>
              </div>
              <button
                type="button"
                onClick={() => void speak(sentence.hanzi)}
                aria-label="Replay audio"
                className="shrink-0 rounded-full bg-neutral-800 px-3 py-1 text-xs text-neutral-200 active:bg-neutral-700"
              >
                ▶ audio
              </button>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onDone(correct)}
            className="rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white active:bg-emerald-700"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
