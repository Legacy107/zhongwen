"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ToneDrillCard } from "@/components/ToneDrillCard";
import type { Word } from "@/lib/hanviet";
import { playFanfare, unlockAudio } from "@/lib/sfx";
import { speak } from "@/lib/speak";
import { buildToneDrills, drawSession, type ToneDrill } from "@/lib/tones";

const SESSION_SIZE = 12;

/**
 * Tone training weighted to the Vietnamese error profile.
 *
 * Not FSRS-scheduled: a tone contrast is a perceptual skill drilled to
 * automaticity, not a fact with a forgetting curve. The session is redrawn
 * each time, weighted so the Vietnamese-specific confusions come up most.
 */
export function ToneSession() {
  const [drills, setDrills] = useState<ToneDrill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const words = (await fetch("/data/words.json").then((r) => r.json())) as Word[];
        if (cancelled) return;
        // Drill what he is actually learning, not the whole 5,497-word deck.
        const pool = words.filter((w) => w.level === "1" || w.level === "2" || w.level === "S");
        setDrills(drawSession(buildToneDrills(pool), SESSION_SIZE));
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load words");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 text-center">
        <p className="text-sm text-rose-400">{error}</p>
        <Link href="/" className="text-sm text-neutral-400 underline">
          Home
        </Link>
      </div>
    );
  }
  if (!drills) return <p className="text-sm text-neutral-500">Loading tones…</p>;

  const current = drills[i];
  if (!current) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-4xl">完成</p>
        <p className="text-sm text-neutral-400">
          {score.correct} correct · {score.wrong} missed
        </p>
        <Link href="/" className="mt-2 text-sm text-neutral-400 underline">
          Home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-4" onPointerDown={unlockAudio}>
      <p className="text-xs text-neutral-500">
        {i + 1} / {drills.length}
      </p>
      <ToneDrillCard
        key={current.id}
        drill={current}
        onPlayAudio={() => speak(current.word.simplified)}
        onAnswer={(ok) => {
          setScore((s) => ({
            correct: s.correct + (ok ? 1 : 0),
            wrong: s.wrong + (ok ? 0 : 1),
          }));
          setI((n) => {
            const next = n + 1;
            if (next >= drills.length) playFanfare();
            return next;
          });
        }}
      />
    </div>
  );
}
