"use client";

import { LayoutGroup, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { MascotBubble } from "@/components/ui/Bubble";
import { SpeakButton } from "@/components/ui/Controls";
import { ActionBar, SessionFooter } from "@/components/ui/SessionShell";
import { englishTiles } from "@/lib/lesson";
import type { Sentence } from "@/lib/sentences";
import { playCorrect, playTilePlace, playTileRemove, playWrong } from "@/lib/sound";
import { speak } from "@/lib/speak";

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const SPRING = { type: "spring", stiffness: 620, damping: 38, mass: 0.8 } as const;

interface TranslateCardProps {
  sentence: Sentence;
  /** Wrong English words mixed into the bank. */
  distractors: string[];
  speech: boolean;
  onDone: (correct: boolean) => void;
}

/** Read the Chinese, build its English from word tiles: the reading direction of the tile builder. */
export function TranslateCard({ sentence, distractors, speech, onDone }: TranslateCardProps) {
  const target = useMemo(() => englishTiles(sentence.enGloss), [sentence.enGloss]);
  const [bank] = useState(() => shuffle([...target, ...distractors].map((text, i) => ({ key: `${i}:${text}`, text }))));
  const [placed, setPlaced] = useState<string[]>([]);
  const [checked, setChecked] = useState<boolean | null>(null);
  const done = useRef(false);
  const byKey = useMemo(() => new Map(bank.map((s) => [s.key, s])), [bank]);

  useEffect(() => {
    if (!speech) return;
    const t = setTimeout(() => speak(sentence.hanzi), 250);
    return () => clearTimeout(t);
  }, [speech, sentence.hanzi]);

  const check = () => {
    if (checked !== null) return;
    const ok = placed.map((k) => byKey.get(k)!.text).join(" ") === target.join(" ");
    setChecked(ok);
    if (ok) playCorrect();
    else playWrong();
  };

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-2xl font-extrabold text-ink">What does this mean?</h2>

      <MascotBubble mood={checked === false ? "sad" : checked ? "cheer" : "think"}>
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p lang="zh-Hans" className="text-2xl leading-snug text-ink">
              {sentence.hanzi}
            </p>
            <p className="text-sm font-semibold text-ink-3">{sentence.pinyin}</p>
          </div>
          <SpeakButton onClick={() => speak(sentence.hanzi)} size="sm" label="Replay sentence" />
        </div>
      </MascotBubble>

      <LayoutGroup>
        <div className="flex min-h-[7.5rem] flex-wrap content-start gap-2 border-b-2 border-line pb-3" aria-label="Your answer">
          {placed.map((key) => (
            <motion.button
              key={key}
              layoutId={key}
              type="button"
              transition={SPRING}
              onClick={() => {
                if (checked !== null) return;
                playTileRemove();
                setPlaced((p) => p.filter((k) => k !== key));
              }}
              className={`tile h-12 px-3 text-base font-bold ${checked === true ? "tile-correct" : checked === false ? "tile-wrong" : ""}`}
            >
              {byKey.get(key)!.text}
            </motion.button>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-2" aria-label="Word bank">
          {bank.map((slot) =>
            placed.includes(slot.key) ? (
              <span key={slot.key} aria-hidden className="h-12 rounded-[0.9rem] bg-surface-3 px-3 text-base font-bold text-transparent">
                {slot.text}
              </span>
            ) : (
              <motion.button
                key={slot.key}
                layoutId={slot.key}
                type="button"
                transition={SPRING}
                disabled={checked !== null}
                onClick={() => {
                  playTilePlace(placed.length);
                  setPlaced((p) => (p.includes(slot.key) ? p : [...p, slot.key]));
                }}
                className="tile h-12 px-3 text-base font-bold"
              >
                {slot.text}
              </motion.button>
            ),
          )}
        </div>
      </LayoutGroup>

      <SessionFooter>
        <ActionBar
          tone={checked === null ? "idle" : checked ? "correct" : "wrong"}
          title={checked === null ? undefined : checked ? "Nicely done!" : "Correct answer:"}
          actions={
            checked === null ? (
              <button type="button" className="btn btn-primary btn-block" disabled={placed.length === 0} onClick={check}>
                Check
              </button>
            ) : (
              <button
                type="button"
                className={`btn btn-block ${checked ? "btn-primary" : "btn-danger"}`}
                onClick={() => {
                  if (done.current) return;
                  done.current = true;
                  onDone(checked);
                }}
                autoFocus
              >
                Continue
              </button>
            )
          }
        >
          {checked !== null && (
            <div>
              <p className="font-bold">{sentence.enGloss}</p>
              {sentence.viGloss && <p className="text-sm font-semibold opacity-80">🇻🇳 {sentence.viGloss}</p>}
            </div>
          )}
        </ActionBar>
      </SessionFooter>
    </div>
  );
}
