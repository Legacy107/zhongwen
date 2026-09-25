"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ReviewCard } from "@/components/ReviewCard";
import { loadFalseFriends, loadWordFrequency, loadWords } from "@/lib/data";
import { db, requestPersistence, saveGradedCard } from "@/lib/db/local";
import { type StoredCard } from "@/lib/db/wire";
import { getDeviceId, uuid } from "@/lib/device";
import type { FalseFriend, Word } from "@/lib/hanviet";
import { newCardRanker } from "@/lib/intake";
import { loadMinedWords } from "@/lib/mining";
import {
  buildQueue,
  cardId,
  grade,
  newCard,
  Rating,
  WORD_CARD_TYPES,
  type CardType,
} from "@/lib/srs";
import { playCorrect, playFanfare, playWrong, unlockAudio } from "@/lib/sfx";
import { speak, warmUpSpeech } from "@/lib/speak";

type Grade = Parameters<typeof grade>[1];

interface Deck {
  words: Map<string, Word>;
  falseFriends: Map<string, FalseFriend>;
}

async function loadDeck(): Promise<Deck> {
  const [words, falseFriends] = await Promise.all([loadWords(), loadFalseFriends()]);
  return { words, falseFriends };
}

/** Builds SRS rows for any deck word that doesn't have them yet. */
async function ensureCards(words: Word[], deviceId: string): Promise<void> {
  const existing = new Set((await db.cards.toArray()).map((c) => c.id));
  const missing: StoredCard[] = [];
  const now = new Date();
  for (const w of words) {
    for (const t of WORD_CARD_TYPES) {
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

  // Voices load asynchronously; start now so the first tap has a good one.
  useEffect(() => warmUpSpeech(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        void requestPersistence();
        const d = await loadDeck();
        if (cancelled) return;
        const deviceId = getDeviceId();
        await ensureCards([...d.words.values()], deviceId);
        // Sentence cards live in the same table but are drilled on /build,
        // and ReviewCard cannot render one.
        const all = (await db.cards.toArray()).filter((c) => c.cardType !== "sentence");
        const [frequency, mined] = await Promise.all([loadWordFrequency(), loadMinedWords()]);
        if (cancelled) return;
        setDeck(d);
        setQueue(
          buildQueue(all, new Date(), { rankNew: newCardRanker(d.words, frequency, mined) }),
        );
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
          id: uuid(),
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
        <div className="mt-4 flex flex-col items-stretch gap-2 self-stretch">
          <Link
            href="/build"
            className="rounded-xl bg-emerald-600 px-4 py-3 text-center font-medium text-white active:bg-emerald-700"
          >
            Build sentences
          </Link>
          <Link
            href="/"
            className="rounded-xl bg-neutral-800 px-4 py-3 text-center text-sm active:bg-neutral-700"
          >
            Home
          </Link>
        </div>
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
