"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MascotBubble } from "@/components/ui/Bubble";
import { SpeakButton } from "@/components/ui/Controls";
import { ActionBar, SessionFooter } from "@/components/ui/SessionShell";
import { glossEn } from "@/lib/gloss";
import type { Word } from "@/lib/hanviet";
import type { ChooseMode } from "@/lib/lesson";
import { playCorrect, playPress, playWrong } from "@/lib/sound";
import { speak } from "@/lib/speak";

interface ChooseCardProps {
  word: Word;
  /** Four words, the right one among them, already shuffled. */
  options: Word[];
  mode: ChooseMode;
  emoji: Record<string, string>;
  speech: boolean;
  onDone: (correct: boolean) => void;
}

/**
 * Pick a word met moments ago out of four: by its picture and meaning, by its
 * characters' meaning, or by ear. Recognition, not recall, which is the point
 * for a word this new. Select, then Check, as in the gap-fill.
 */
export function ChooseCard({ word, options, mode, emoji, speech, onDone }: ChooseCardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const done = useRef(false);
  const correct = selected === word.id;

  const say = useCallback(() => speak(word.simplified), [word.simplified]);

  // Deferred and cancelled on cleanup, so Strict Mode's double mount says it once.
  useEffect(() => {
    if (mode !== "listen" || !speech) return;
    const t = setTimeout(say, 250);
    return () => clearTimeout(t);
  }, [mode, speech, say]);

  const check = () => {
    if (!selected || checked) return;
    setChecked(true);
    if (selected === word.id) playCorrect();
    else playWrong();
    if (speech && mode !== "listen") say();
  };

  const finish = () => {
    if (done.current) return;
    done.current = true;
    onDone(correct);
  };

  const heading =
    mode === "listen" ? "What do you hear?" : mode === "meaning" ? "What does this mean?" : `Which one is “${glossEn(word, 1)}”?`;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-2xl font-extrabold text-ink">{heading}</h2>

      {mode === "listen" ? (
        <div className="flex justify-center py-4">
          <SpeakButton onClick={say} label="Play the word" />
        </div>
      ) : mode === "meaning" ? (
        <MascotBubble mood={checked ? (correct ? "happy" : "sad") : "think"}>
          <div className="flex items-center justify-between gap-3">
            <span lang="zh-Hans" className="text-5xl font-medium leading-tight text-ink">
              {word.simplified}
            </span>
            <SpeakButton onClick={say} size="md" />
          </div>
        </MascotBubble>
      ) : null}

      <div className="grid grid-cols-2 gap-3">
        {options.map((option) => {
          const state = checked
            ? option.id === word.id
              ? "tile-correct"
              : option.id === selected
                ? "tile-wrong"
                : "opacity-50"
            : option.id === selected
              ? "tile-selected"
              : "";
          return (
            <button
              key={option.id}
              type="button"
              disabled={checked}
              onClick={() => {
                playPress();
                setSelected(option.id);
                if (speech && mode === "picture") speak(option.simplified);
              }}
              className={`tile flex-col gap-1 px-2 ${mode === "picture" ? "h-36" : "h-20"} ${state}`}
            >
              {mode === "picture" && (
                <span className="text-5xl leading-none" aria-hidden>
                  {emoji[option.id] ?? "❔"}
                </span>
              )}
              {mode === "meaning" ? (
                <span className="text-center text-base font-bold leading-tight text-ink">{glossEn(option, 1)}</span>
              ) : (
                <span lang="zh-Hans" className="text-3xl leading-none">
                  {option.simplified}
                </span>
              )}
              {mode === "picture" && <span className="text-xs font-bold text-ink-3">{option.pinyin}</span>}
            </button>
          );
        })}
      </div>

      <SessionFooter>
        <ActionBar
          tone={checked ? (correct ? "correct" : "wrong") : "idle"}
          title={checked ? (correct ? "Nicely done!" : "Correct answer:") : undefined}
          actions={
            checked ? (
              <button type="button" className={`btn btn-block ${correct ? "btn-primary" : "btn-danger"}`} onClick={finish} autoFocus>
                Continue
              </button>
            ) : (
              <button type="button" className="btn btn-primary btn-block" disabled={!selected} onClick={check}>
                Check
              </button>
            )
          }
        >
          {checked && (
            <p className="font-bold">
              <span lang="zh-Hans" className="text-xl">
                {word.simplified}
              </span>{" "}
              {word.pinyin} · {glossEn(word, 2)}
            </p>
          )}
        </ActionBar>
      </SessionFooter>
    </div>
  );
}
