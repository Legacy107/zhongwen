"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useMemo, useState } from "react";
import type { Sentence, SentenceTile } from "@/lib/sentences";
import { playCorrect, playTap, playWrong } from "@/lib/sfx";
import { speak } from "@/lib/speak";

/** A tile plus a stable key, since the same word can appear twice in a sentence. */
interface Slot {
  key: string;
  tile: SentenceTile;
}

/** Deterministic shuffle is wrong here - the learner would memorise positions. */
function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export type TileResult = "correct" | "wrong";

interface TileBuilderProps {
  sentence: Sentence;
  /**
   * Language of the prompt being translated *from*. English by default.
   *
   * The Vietnamese gloss is still carried on every sentence and drives the
   * word-order correction on a wrong answer; this only controls the prompt.
   */
  promptLang?: "en" | "vi";
  /** Speak each tile as it is tapped, and the sentence on reveal. */
  autoSpeak?: boolean;
  onDone: (result: TileResult) => void;
}

export function TileBuilder({
  sentence,
  promptLang = "en",
  autoSpeak = true,
  onDone,
}: TileBuilderProps) {
  // Slots are built once per sentence and are the single source of identity for
  // both lists. Deriving keys in two places lets the same tile text collide -
  // a sentence may legitimately repeat a word - and React then duplicates or
  // drops tiles. The parent remounts on sentence change (key={current.id}), so
  // initialising from useState is safe.
  const [bank, setBank] = useState<Slot[]>(() =>
    shuffle(sentence.tiles.map((tile, i) => ({ key: `${i}:${tile.text}`, tile }))),
  );
  const [built, setBuilt] = useState<Slot[]>([]);
  const [checked, setChecked] = useState<TileResult | null>(null);

  const answer = built.map((s) => s.tile.text).join("");
  const target = useMemo(() => sentence.tiles.map((t) => t.text).join(""), [sentence]);

  const pick = useCallback(
    (slot: Slot) => {
      if (checked) return;
      // Hearing the word as you place it ties sound to character. The blip
      // stands in when speech is muted, so the tap still gets feedback.
      if (autoSpeak) void speak(slot.tile.text);
      else playTap();
      setBank((b) => b.filter((s) => s.key !== slot.key));
      setBuilt((b) => [...b, slot]);
    },
    [checked, autoSpeak],
  );

  const unpick = useCallback((slot: Slot) => {
    if (checked) return;
    playTap();
    setBuilt((b) => b.filter((s) => s.key !== slot.key));
    setBank((b) => [...b, slot]);
  }, [checked]);

  const check = useCallback(() => {
    const result: TileResult = answer === target ? "correct" : "wrong";
    setChecked(result);
    if (result === "correct") playCorrect();
    else playWrong();
    // Hearing it only makes sense once the order is settled; playing earlier
    // would read the answer out loud.
    if (autoSpeak) void speak(sentence.hanzi);
  }, [answer, target, sentence.hanzi, autoSpeak]);

  /**
   * A wrong answer that follows Vietnamese word order gets a specific
   * correction rather than a generic "incorrect" - the whole point of tagging
   * viContrast during generation.
   */
  const viHint =
    checked === "wrong" && sentence.viContrast ? sentence.viContrast.note : null;

  const prompt = promptLang === "vi" ? sentence.viGloss : sentence.enGloss;

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <p className="text-center text-sm text-neutral-400">{prompt}</p>

      {/* Build area */}
      <div className="flex min-h-20 flex-wrap items-start justify-center gap-2 rounded-2xl border border-dashed border-neutral-800 p-3">
        <AnimatePresence mode="popLayout">
          {built.map((slot) => (
            <motion.button
              key={slot.key}
              layout
              type="button"
              onClick={() => unpick(slot)}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className="flex flex-col items-center rounded-xl bg-neutral-800 px-3 py-2 active:bg-neutral-700"
            >
              <span className="text-lg leading-tight">{slot.tile.text}</span>
              <span className="text-[10px] text-neutral-500">{slot.tile.pinyin}</span>
            </motion.button>
          ))}
        </AnimatePresence>
        {built.length === 0 && (
          <span className="self-center text-xs text-neutral-600">Tap the tiles in order</span>
        )}
      </div>

      {/* Tile bank */}
      <div className="flex flex-wrap justify-center gap-2">
        <AnimatePresence mode="popLayout">
          {bank.map((slot) => (
            <motion.button
              key={slot.key}
              layout
              type="button"
              onClick={() => pick(slot)}
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={{ type: "spring", stiffness: 500, damping: 32 }}
              className="flex flex-col items-center rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 active:bg-neutral-800"
            >
              <span className="text-lg leading-tight">{slot.tile.text}</span>
              <span className="text-[10px] text-neutral-500">{slot.tile.pinyin}</span>
            </motion.button>
          ))}
        </AnimatePresence>
      </div>

      {checked === null ? (
        <button
          type="button"
          onClick={check}
          disabled={built.length === 0}
          className="rounded-xl bg-neutral-100 px-4 py-3 font-medium text-neutral-900 disabled:opacity-40"
        >
          Check
        </button>
      ) : (
        <div className="flex flex-col gap-3">
          <div
            className={`rounded-xl px-4 py-3 text-sm ${
              checked === "correct"
                ? "bg-emerald-950/60 text-emerald-300"
                : "bg-rose-950/60 text-rose-300"
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
            {viHint && <p className="mt-2 text-rose-200">{viHint}</p>}
          </div>
          <button
            type="button"
            onClick={() => onDone(checked)}
            className="rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white active:bg-emerald-700"
          >
            Continue
          </button>
        </div>
      )}
    </div>
  );
}
