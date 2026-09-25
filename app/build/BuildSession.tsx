"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { GapFillCard } from "@/components/GapFillCard";
import { TileBuilder, type TileResult } from "@/components/TileBuilder";
import { db, saveGradedCard } from "@/lib/db/local";
import { type StoredCard } from "@/lib/db/wire";
import { getDeviceId, uuid } from "@/lib/device";
import { buildGapFill, type GapFill, type Sentence } from "@/lib/sentences";
import { playFanfare, unlockAudio } from "@/lib/sfx";
import { buildQueue, cardId, grade, newCard, Rating } from "@/lib/srs";
import { useAutoSpeak } from "@/lib/useAutoSpeak";

/**
 * Sentence-construction practice, scheduled by the same FSRS engine as
 * vocabulary.
 *
 * Each sentence is one card of type `sentence`, whose `wordId` holds the
 * sentence id. Sentences you get wrong come back tomorrow; ones you build
 * cleanly recede. Without this the session was a random draw that stored
 * nothing, so nothing was actually being learned.
 */
const SOURCES = ["/data/sentences.json", "/data/sentences-fixture.json"];

/** Sentences per session, and how many unseen ones may enter it. */
const SESSION_SIZE = 12;
const NEW_PER_SESSION = 6;

async function loadSentences(): Promise<Sentence[]> {
  for (const url of SOURCES) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const data = (await r.json()) as Sentence[];
      if (data.length) return data;
    } catch {
      // Try the next source.
    }
  }
  throw new Error("No sentence set found. Run yarn sentences:generate.");
}

/** Creates SRS rows for sentences that don't have one yet. */
async function ensureCards(sentences: Sentence[], deviceId: string): Promise<void> {
  const existing = new Set((await db.cards.toArray()).map((c) => c.id));
  const now = new Date();
  const missing: StoredCard[] = [];
  for (const s of sentences) {
    if (existing.has(cardId(s.id, "sentence"))) continue;
    missing.push({ ...newCard(s.id, "sentence", now), updatedAt: now, deviceId });
  }
  if (missing.length) await db.cards.bulkPut(missing);
}

export function BuildSession() {
  const [byId, setById] = useState<Map<string, Sentence> | null>(null);
  const [queue, setQueue] = useState<StoredCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [autoSpeak, setAutoSpeak] = useAutoSpeak();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const sentences = await loadSentences();
        if (cancelled) return;
        const deviceId = getDeviceId();
        await ensureCards(sentences, deviceId);
        const cards = (await db.cards.toArray()).filter((c) => c.cardType === "sentence");
        if (cancelled) return;
        setById(new Map(sentences.map((s) => [s.id, s])));
        setQueue(
          buildQueue(cards, new Date(), {
            sessionSize: SESSION_SIZE,
            newPerSession: NEW_PER_SESSION,
          }) as StoredCard[],
        );
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load sentences");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = queue[0];
  const sentence = current && byId ? byId.get(current.wordId) : undefined;

  // Alternate the two exercise types over a card's life: a sentence you have
  // only ever reassembled from tiles is not the same as one where you chose
  // the right measure word. Reps is stable across a reload, so the exercise
  // does not flip under the learner mid-card.
  // Memoised: buildGapFill shuffles, so calling it bare in render would pick a
  // different gap and reorder the options on every keystroke-driven re-render.
  const gap: GapFill | null = useMemo(
    () => (sentence && current && current.reps % 2 === 1 ? buildGapFill(sentence) : null),
    [sentence, current],
  );

  const onDone = useCallback(
    async (result: TileResult) => {
      if (!current) return;
      // Tile ordering is right or wrong - there is no partial credit to grade,
      // so a correct build is Good and a wrong one is Again.
      const rating = result === "correct" ? Rating.Good : Rating.Again;
      const now = new Date();
      const graded = grade(current, rating, now);
      const deviceId = getDeviceId();
      await saveGradedCard(
        { ...graded.card, updatedAt: now, deviceId },
        {
          id: uuid(),
          cardId: graded.review.cardId,
          rating: graded.review.rating,
          reviewedAt: now,
          state: graded.review.state,
          durationMs: null,
          deviceId,
        },
      );
      setScore((s) => ({
        correct: s.correct + (result === "correct" ? 1 : 0),
        wrong: s.wrong + (result === "wrong" ? 1 : 0),
      }));
      setDone((n) => n + 1);
      setQueue((q) => {
        const rest = q.slice(1);
        if (rest.length === 0) playFanfare();
        return rest;
      });
    },
    [current],
  );

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
  if (!byId) return <p className="text-sm text-neutral-500">Loading sentences…</p>;

  if (!current || !sentence) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-4xl">完成</p>
        <p className="text-sm text-neutral-400">
          {done > 0 ? `${score.correct} correct · ${score.wrong} to review` : "Nothing due."}
        </p>
        <Link href="/" className="mt-2 text-sm text-neutral-400 underline">
          Home
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-4" onPointerDown={unlockAudio}>
      <div className="flex w-full max-w-md items-center justify-between">
        <p className="text-xs text-neutral-500">
          {queue.length} left · {done} done
        </p>
        <button
          type="button"
          onClick={() => setAutoSpeak(!autoSpeak)}
          aria-pressed={autoSpeak}
          className="rounded-full bg-neutral-900 px-3 py-1 text-xs text-neutral-300 active:bg-neutral-800"
        >
          {autoSpeak ? "🔊 Sound on" : "🔇 Muted"}
        </button>
      </div>
      {gap ? (
        <GapFillCard
          key={`${current.id}:${done}:gap`}
          sentence={sentence}
          gap={gap}
          autoSpeak={autoSpeak}
          onDone={(ok) => onDone(ok ? "correct" : "wrong")}
        />
      ) : (
        <TileBuilder
          key={`${current.id}:${done}`}
          sentence={sentence}
          autoSpeak={autoSpeak}
          onDone={onDone}
        />
      )}
    </div>
  );
}
