"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TileBuilder, type TileResult } from "@/components/TileBuilder";
import type { Sentence } from "@/lib/sentences";
import { playFanfare, unlockAudio } from "@/lib/sfx";

/**
 * Sentence-construction practice.
 *
 * Reads a fixture set for now; the generated corpus lands at
 * /data/sentences.json once `yarn sentences:generate` has been run with an API
 * key, and this switches to it without any change to the exercise itself.
 */
const SOURCES = ["/data/sentences.json", "/data/sentences-fixture.json"];

/** Sentences per session. The corpus is 279 long; a session is not. */
const SESSION_SIZE = 12;

/** Fisher-Yates over a copy, so each session draws a different set. */
function sample<T>(items: T[], n: number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.slice(0, n);
}

export function BuildSession() {
  const [sentences, setSentences] = useState<Sentence[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  // Alternate prompt languages: Vietnamese prompts are the more valuable half,
  // but English keeps the meaning unambiguous when the gloss is thin.
  const [promptLang, setPromptLang] = useState<"en" | "vi">("vi");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const url of SOURCES) {
        try {
          const r = await fetch(url);
          if (!r.ok) continue;
          const data = (await r.json()) as Sentence[];
          if (!cancelled && data.length) {
            setSentences(sample(data, SESSION_SIZE));
            return;
          }
        } catch {
          // Try the next source.
        }
      }
      if (!cancelled) setError("No sentence set found. Run yarn sentences:generate.");
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const onDone = (result: TileResult) => {
    setScore((s) => ({
      correct: s.correct + (result === "correct" ? 1 : 0),
      wrong: s.wrong + (result === "wrong" ? 1 : 0),
    }));
    setPromptLang((l) => (l === "vi" ? "en" : "vi"));
    setI((n) => {
      const next = n + 1;
      if (sentences && next >= sentences.length) playFanfare();
      return next;
    });
  };

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
  if (!sentences) return <p className="text-sm text-neutral-500">Loading sentences…</p>;

  const current = sentences[i];
  if (!current) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-4xl">完成</p>
        <p className="text-sm text-neutral-400">
          {score.correct} correct · {score.wrong} to review
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
        {i + 1} / {sentences.length}
      </p>
      <TileBuilder
        key={current.id}
        sentence={current}
        promptLang={promptLang}
        onDone={onDone}
      />
    </div>
  );
}
