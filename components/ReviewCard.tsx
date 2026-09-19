"use client";

import { useEffect, useRef, useState } from "react";
import type { FalseFriend, Word } from "@/lib/hanviet";
import { Rating, type CardType } from "@/lib/srs";
import { CognateHint } from "./CognateHint";

type Grade = typeof Rating.Again | typeof Rating.Hard | typeof Rating.Good | typeof Rating.Easy;

/** Compares typed pinyin loosely: tone marks and spacing shouldn't decide correctness. */
function normalisePinyin(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[\s'’-]/g, "")
    .replace(/ü|v/g, "u")
    .toLowerCase()
    .trim();
}

export interface ReviewCardProps {
  word: Word;
  cardType: CardType;
  falseFriend?: FalseFriend;
  onGrade: (rating: Grade) => void;
  onPlayAudio?: () => void;
}

export function ReviewCard({ word, cardType, falseFriend, onGrade, onPlayAudio }: ReviewCardProps) {
  const [revealed, setRevealed] = useState(false);
  const [answer, setAnswer] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // No reset effect here: ReviewSession remounts this component via a key per
  // card, so useState already starts fresh for each one.
  useEffect(() => {
    if (!revealed && cardType !== "recognition") inputRef.current?.focus();
  }, [revealed, cardType]);

  const correct = normalisePinyin(answer) === normalisePinyin(word.pinyin);

  function reveal() {
    if (!revealed) setRevealed(true);
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-neutral-800 bg-neutral-900/50 p-6">
        {cardType === "hanviet" && word.hanviet ? (
          <>
            <span className="text-xs uppercase tracking-wide text-neutral-500">
              Predict the pinyin from Hán-Việt
            </span>
            <p className="text-3xl font-medium text-amber-300">{word.hanviet}</p>
          </>
        ) : (
          <p lang="zh-Hans" className="text-6xl font-medium tracking-wide">
            {word.simplified}
          </p>
        )}

        {revealed ? (
          <div className="flex flex-col items-center gap-1">
            <p className="text-2xl text-neutral-200">{word.pinyin}</p>
            {cardType === "hanviet" ? (
              <p lang="zh-Hans" className="text-4xl font-medium">
                {word.simplified}
              </p>
            ) : null}
            <p className="text-center text-neutral-400">{word.enGloss}</p>
          </div>
        ) : null}

        {onPlayAudio ? (
          <button
            type="button"
            onClick={onPlayAudio}
            className="mt-1 rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-400 active:bg-neutral-800"
          >
            ► audio
          </button>
        ) : null}
      </div>

      {!revealed ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            reveal();
          }}
          className="flex flex-col gap-3"
        >
          {cardType === "recognition" ? null : (
            <input
              ref={inputRef}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              placeholder="type the pinyin"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-center text-lg outline-none focus:border-amber-500/60"
            />
          )}
          <button
            type="submit"
            className="rounded-xl bg-neutral-100 px-4 py-3 font-medium text-neutral-900 active:bg-neutral-300"
          >
            Show answer
          </button>
        </form>
      ) : (
        <div className="flex flex-col gap-3">
          {cardType !== "recognition" && answer ? (
            <p className={`text-center text-sm ${correct ? "text-emerald-400" : "text-rose-400"}`}>
              {correct ? "correct" : `you typed "${answer}"`}
            </p>
          ) : null}

          <CognateHint word={word} falseFriend={falseFriend} />

          <div className="grid grid-cols-4 gap-2">
            {(
              [
                [Rating.Again, "Again", "bg-rose-600/80"],
                [Rating.Hard, "Hard", "bg-amber-600/80"],
                [Rating.Good, "Good", "bg-emerald-600/80"],
                [Rating.Easy, "Easy", "bg-sky-600/80"],
              ] as const
            ).map(([rating, label, cls]) => (
              <button
                key={label}
                type="button"
                onClick={() => onGrade(rating as Grade)}
                className={`rounded-xl px-2 py-3 text-sm font-medium text-white active:opacity-80 ${cls}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
