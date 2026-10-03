"use client";

import { motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { ActionBar, SessionFooter } from "@/components/ui/SessionShell";
import { glossEn } from "@/lib/gloss";
import type { Word } from "@/lib/hanviet";
import { playCorrect, playPress, playWrong } from "@/lib/sound";
import { speak } from "@/lib/speak";

function shuffle<T>(items: T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

interface MatchCardProps {
  words: Word[];
  speech: boolean;
  /** Passed with at most one wrong pairing. */
  onDone: (passed: boolean) => void;
}

/** Tap the pairs: characters on the left, meanings on the right. */
export function MatchCard({ words, speech, onDone }: MatchCardProps) {
  // Each column shuffled once: the parent remounts this per step.
  const [left] = useState(() => shuffle(words));
  const [right] = useState(() => shuffle(words));
  const [picked, setPicked] = useState<{ side: "zh" | "en"; id: string } | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [miss, setMiss] = useState<{ zh: string; en: string } | null>(null);
  const [mistakes, setMistakes] = useState(0);
  const done = useRef(false);
  const finished = matched.size === words.length;

  const tap = (side: "zh" | "en", id: string) => {
    if (matched.has(id) || finished) return;
    if (side === "zh" && speech) speak(words.find((w) => w.id === id)!.simplified);
    if (!picked || picked.side === side) {
      playPress();
      setPicked({ side, id });
      return;
    }
    const zh = side === "zh" ? id : picked.id;
    const en = side === "en" ? id : picked.id;
    setPicked(null);
    if (zh === en) {
      playCorrect();
      setMatched((m) => new Set(m).add(zh));
    } else {
      playWrong();
      setMistakes((n) => n + 1);
      setMiss({ zh, en });
      setTimeout(() => setMiss(null), 450);
    }
  };

  const state = (side: "zh" | "en", id: string) =>
    matched.has(id)
      ? "tile-correct opacity-60"
      : (side === "zh" ? miss?.zh : miss?.en) === id
        ? "tile-wrong"
        : picked?.side === side && picked.id === id
          ? "tile-selected"
          : "";

  const passed = mistakes <= 1;
  const columns = useMemo(
    () => [
      { side: "zh" as const, items: left },
      { side: "en" as const, items: right },
    ],
    [left, right],
  );

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-2xl font-extrabold text-ink">Tap the matching pairs</h2>
      <div className="grid grid-cols-2 gap-3">
        {columns.map(({ side, items }) => (
          <div key={side} className="flex flex-col gap-3">
            {items.map((w) => (
              <motion.button
                key={w.id}
                type="button"
                disabled={matched.has(w.id)}
                onClick={() => tap(side, w.id)}
                animate={(side === "zh" ? miss?.zh : miss?.en) === w.id ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
                transition={{ duration: 0.35 }}
                className={`tile h-16 px-2 ${state(side, w.id)}`}
              >
                {side === "zh" ? (
                  <span lang="zh-Hans" className="text-2xl leading-none">
                    {w.simplified}
                  </span>
                ) : (
                  <span className="text-center text-sm font-bold leading-tight text-ink">{glossEn(w, 1)}</span>
                )}
              </motion.button>
            ))}
          </div>
        ))}
      </div>

      <SessionFooter>
        <ActionBar
          tone={finished ? (passed ? "correct" : "almost") : "idle"}
          title={finished ? (passed ? "All matched!" : "Matched, with a few slips") : undefined}
          actions={
            <button
              type="button"
              className={`btn btn-block ${finished ? (passed ? "btn-primary" : "btn-gold") : "btn-primary"}`}
              disabled={!finished}
              onClick={() => {
                if (done.current) return;
                done.current = true;
                onDone(passed);
              }}
              autoFocus={finished}
            >
              Continue
            </button>
          }
        />
      </SessionFooter>
    </div>
  );
}
