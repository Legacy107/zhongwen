"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { TileBuilder, type TileResult } from "@/components/TileBuilder";
import { db, saveGradedCard } from "@/lib/db/local";
import { type StoredCard } from "@/lib/db/wire";
import { getDeviceId } from "@/lib/device";
import type { Sentence } from "@/lib/sentences";
import { playFanfare, unlockAudio } from "@/lib/sfx";
import { buildQueue, cardId, grade, newCard, Rating } from "@/lib/srs";

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
          id: crypto.randomUUID(),
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
      <p className="text-xs text-neutral-500">
        {queue.length} left · {done} done
      </p>
      <TileBuilder key={`${current.id}:${done}`} sentence={sentence} onDone={onDone} />
    </div>
  );
}
