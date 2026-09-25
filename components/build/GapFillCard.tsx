"use client";

import { motion } from "motion/react";
import { useCallback, useRef, useState } from "react";
import { MascotBubble } from "@/components/ui/Bubble";
import { SpeakButton } from "@/components/ui/Controls";
import { ActionBar, SessionFooter } from "@/components/ui/SessionShell";
import { GAP_READINGS, type GapFill, type Sentence } from "@/lib/sentences";
import { playCorrect, playPress, playWrong } from "@/lib/sound";
import { speak } from "@/lib/speak";
import { LookupLine, TappableSentence, type GlossFor } from "./WordLookup";

interface GapFillCardProps {
  sentence: Sentence;
  gap: GapFill;
  /** Speak the sentence once the gap is filled. */
  speech?: boolean;
  showPinyin?: boolean;
  /** Short meaning for a word of the sentence, shown on tap after a wrong answer. */
  glossFor?: GlossFor;
  onDone: (correct: boolean) => void;
}

/**
 * Choose the missing particle or measure word. Select, then CHECK: picking is
 * not committing, so a second thought costs nothing, as in Duolingo.
 */
export function GapFillCard({ sentence, gap, speech = true, showPinyin = true, glossFor, onDone }: GapFillCardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  // Index into the sentence's tiles of the word being looked up.
  const [peek, setPeek] = useState<number | null>(null);
  const done = useRef(false);
  const correct = selected === gap.answer;

  const check = useCallback(() => {
    if (!selected || checked) return;
    setChecked(true);
    if (selected === gap.answer) playCorrect();
    else playWrong();
    // The gap is filled now, so the sentence is complete and safe to speak.
    if (speech) speak(sentence.hanzi);
  }, [selected, checked, gap.answer, sentence.hanzi, speech]);

  const filled = checked ? gap.answer : selected;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex flex-col gap-2">
        <span
          className={`self-start rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wider ${
            gap.isMeasureWord ? "bg-gold-soft text-gold-ink" : "bg-purple-soft text-purple-ink"
          }`}
        >
          {gap.isMeasureWord ? "Measure word" : "Particle"}
        </span>
        <h2 className="text-2xl font-extrabold text-ink">Fill in the blank</h2>
      </div>

      <MascotBubble mood={checked ? (correct ? "happy" : "sad") : "think"}>
        <p className="text-lg font-semibold leading-snug text-ink">{sentence.enGloss}</p>
      </MascotBubble>

      <p lang="zh-Hans" className="flex flex-wrap items-end justify-center gap-x-1 gap-y-3 py-2">
        {sentence.tiles.map((t, i) =>
          i === gap.gapIndex ? (
            <span key={`${i}:${t.text}`} className="flex flex-col items-center">
              {showPinyin && (
                <span className="text-xs font-semibold text-ink-3">{filled ? (GAP_READINGS[filled] ?? "") : "?"}</span>
              )}
              <motion.span
                key={filled ?? "empty"}
                initial={{ scale: 0.7, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 600, damping: 26 }}
                className={`min-w-14 rounded-xl border-2 border-dashed px-2 text-center text-3xl leading-tight ${
                  checked
                    ? "border-green bg-green-soft text-green-ink"
                    : filled
                      ? "border-blue bg-blue-soft text-blue-ink"
                      : "border-line-strong text-transparent"
                }`}
              >
                {filled ?? "口"}
              </motion.span>
            </span>
          ) : (
            <span key={`${i}:${t.text}`} className="flex flex-col items-center">
              {showPinyin && <span className="text-xs font-semibold text-ink-3">{t.pinyin}</span>}
              <span className="text-3xl leading-tight text-ink">{t.text}</span>
            </span>
          ),
        )}
      </p>

      <div className="grid grid-cols-2 gap-3">
        {gap.options.map((option) => {
          const isAnswer = option === gap.answer;
          const state = checked
            ? isAnswer
              ? "tile-correct"
              : option === selected
                ? "tile-wrong"
                : "opacity-50"
            : option === selected
              ? "tile-selected"
              : "";
          return (
            <button
              key={option}
              type="button"
              disabled={checked}
              onClick={() => {
                playPress();
                setSelected(option);
              }}
              className={`tile h-20 ${state}`}
            >
              <span lang="zh-Hans" className="text-3xl leading-none">
                {option}
              </span>
              <span className="mt-1 text-xs font-bold text-ink-3">{GAP_READINGS[option] ?? ""}</span>
            </button>
          );
        })}
      </div>

      <SessionFooter>
        <ActionBar
          tone={!checked ? "idle" : correct ? "correct" : "wrong"}
          title={!checked ? undefined : correct ? "Nicely done!" : "Correct answer:"}
          actions={
            !checked ? (
              <button type="button" className="btn btn-primary btn-block" disabled={!selected} onClick={check}>
                Check
              </button>
            ) : (
              <button
                type="button"
                className={`btn btn-block ${correct ? "btn-primary" : "btn-danger"}`}
                onClick={() => {
                  if (done.current) return;
                  done.current = true;
                  onDone(correct);
                }}
                autoFocus
              >
                Continue
              </button>
            )
          }
        >
          {checked && (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {glossFor ? (
                  <TappableSentence
                    hanzi={sentence.hanzi}
                    tiles={sentence.tiles}
                    selected={peek}
                    onTap={(i) => {
                      setPeek(i);
                      if (speech) speak(sentence.tiles[i].text);
                    }}
                  />
                ) : (
                  <p lang="zh-Hans" className="text-2xl text-ink">
                    {sentence.hanzi}
                  </p>
                )}
                <p className="font-bold">{sentence.pinyin}</p>
                {sentence.viGloss && <p className="text-sm font-semibold opacity-80">🇻🇳 {sentence.viGloss}</p>}
                {glossFor && (
                  <div className="mt-2">
                    <LookupLine
                      tile={peek === null ? null : sentence.tiles[peek]}
                      glossFor={glossFor}
                      showPinyin
                      placeholder="Tap any word to see what it means."
                      onPanel
                    />
                  </div>
                )}
              </div>
              <SpeakButton onClick={() => speak(sentence.hanzi)} size="sm" label="Replay sentence" />
            </div>
          )}
        </ActionBar>
      </SessionFooter>
    </div>
  );
}
