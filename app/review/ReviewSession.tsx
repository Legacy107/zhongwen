"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ReviewCard } from "@/components/ReviewCard";
import { db, requestPersistence, saveGradedCard } from "@/lib/db/local";
import { type StoredCard } from "@/lib/db/wire";
import { getDeviceId } from "@/lib/device";
import type { FalseFriend, Word } from "@/lib/hanviet";
import { buildQueue, CARD_TYPES, cardId, grade, newCard, Rating, type CardType } from "@/lib/srs";
import { playCorrect, playFanfare, playWrong, unlockAudio } from "@/lib/sfx";
import { speak } from "@/lib/speak";

type Grade = Parameters<typeof grade>[1];

interface Deck {
  words: Map<string, Word>;
  falseFriends: Map<string, FalseFriend>;
}

async function loadDeck(): Promise<Deck> {
  const [words, falseFriends] = await Promise.all([
    fetch("/data/words.json").then((r) => r.json() as Promise<Word[]>),
    fetch("/data/false-friends.json")
      .then((r) => r.json() as Promise<FalseFriend[]>)
      .catch(() => [] as FalseFriend[]),
  ]);
  return {
    words: new Map(words.map((w) => [w.id, w])),
    falseFriends: new Map(falseFriends.map((f) => [f.simplified, f])),
  };
}

/** Builds SRS rows for any deck word that doesn't have them yet. */
async function ensureCards(words: Word[], deviceId: string): Promise<void> {
  const existing = new Set((await db.cards.toArray()).map((c) => c.id));
  const missing: StoredCard[] = [];
  const now = new Date();
  for (const w of words) {
    for (const t of CARD_TYPES) {
      if (existing.has(cardId(w.id, t))) continue;
      const c = newCard(w.id, t as CardType, now);
      missing.push({ ...c, updatedAt: now, deviceId });
    }
  }
  if (missing.length) await db.cards.bulkPut(missing);
}

export function ReviewSession() {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [queue, setQueue] = useState<StoredCard[]>([]);
  const [done, setDone] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        void requestPersistence();
        const d = await loadDeck();
        if (cancelled) return;
        const deviceId = getDeviceId();
        await ensureCards([...d.words.values()], deviceId);
        const all = await db.cards.toArray();
        if (cancelled) return;
        setDeck(d);
        setQueue(buildQueue(all) as StoredCard[]);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load deck");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const current = queue[0];
  const word = useMemo(
    () => (current && deck ? deck.words.get(current.wordId) : undefined),
    [current, deck],
  );

  const onGrade = useCallback(
    async (rating: Grade) => {
      if (!current) return;
      const now = new Date();
      const result = grade(current, rating, now);
      const deviceId = getDeviceId();
      await saveGradedCard(
        { ...result.card, updatedAt: now, deviceId },
        {
          id: crypto.randomUUID(),
          cardId: result.review.cardId,
          rating: result.review.rating,
          reviewedAt: now,
          state: result.review.state,
          durationMs: null,
          deviceId,
        },
      );
      // Again means the card comes back; anything else is a pass worth a cue.
      if (rating === Rating.Again) playWrong();
      else playCorrect();

      setDone((n) => n + 1);
      setQueue((q) => {
        const rest = q.slice(1);
        if (rest.length === 0) playFanfare();
        return rest;
      });
    },
    [current],
  );

  if (error) return <p className="text-sm text-rose-400">{error}</p>;
  if (!deck) return <p className="text-sm text-neutral-500">Loading deck…</p>;

  if (!current || !word) {
    return (
      <div className="flex flex-col items-center gap-2 text-center">
        <p className="text-4xl">完成</p>
        <p className="text-lg font-medium">Nothing due</p>
        <p className="text-sm text-neutral-400">
          {done > 0 ? `${done} reviewed this session.` : "Come back later."}
        </p>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <p className="text-xs text-neutral-500">
        {queue.length} left · {done} done
      </p>
      <ReviewCard
        key={`${current.id}:${done}`}
        word={word}
        cardType={current.cardType as CardType}
        falseFriend={deck.falseFriends.get(word.simplified)}
        onGrade={onGrade}
        onFirstInteraction={unlockAudio}
        onPlayAudio={() => speak(word.simplified)}
      />
    </div>
  );
}
