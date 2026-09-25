"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorState, Loading, TopBarToggle } from "@/components/ui/Controls";
import { formatDuration, SessionComplete } from "@/components/ui/SessionComplete";
import { SessionShell } from "@/components/ui/SessionShell";
import { loadFalseFriends, loadWordFrequency, loadWords } from "@/lib/data";
import { db, requestPersistence, saveGradedCard } from "@/lib/db/local";
import { type StoredCard } from "@/lib/db/wire";
import { getDeviceId, uuid } from "@/lib/device";
import type { FalseFriend, Word } from "@/lib/hanviet";
import { DAILY_NEW_LIMIT, drillable, newAllowance, newCardRanker, newIntroducedToday } from "@/lib/intake";
import { loadMinedWords, type MinedWord } from "@/lib/mining";
import { playCombo } from "@/lib/sound";
import { warmUpSpeech } from "@/lib/speak";
import {
  buildQueue,
  cardId,
  grade,
  NEW_PER_SESSION,
  newCard,
  previewIntervals,
  Rating,
  State,
  WORD_CARD_TYPES,
  type CardType,
} from "@/lib/srs";
import { goalProgress, type GoalProgress } from "@/lib/goal";
import { useSound } from "@/lib/useSound";
import { ReviewCard, type Grade } from "./ReviewCard";

interface Deck {
  words: Map<string, Word>;
  falseFriends: Map<string, FalseFriend>;
  mined: Map<string, MinedWord>;
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

/** "in 10 min", "in 3 h", "tomorrow": when the next card falls due. */
function until(when: Date, now = new Date()): string {
  const minutes = Math.round((when.getTime() - now.getTime()) / 60_000);
  if (minutes < 60) return `in ${Math.max(1, minutes)} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `in ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? "tomorrow" : `in ${days} days`;
}

/** A missed card comes back this many cards later, like a lesson's retry round. */
const RETRY_GAP = 3;
/** Retries per card per session, so one stubborn word cannot trap the session. */
const MAX_RETRIES = 2;

interface Entry {
  card: StoredCard;
  retries: number;
}

export function ReviewSessionView() {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [queue, setQueue] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [cleared, setCleared] = useState(0);
  const [graded, setGraded] = useState({ count: 0, passed: 0 });
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [turn, setTurn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<{ ms: number; goal: GoalProgress; crossed: boolean } | null>(null);
  const [nextDue, setNextDue] = useState<Date | null>(null);
  const [capped, setCapped] = useState(false);
  const sound = useSound();
  const startedAt = useRef<number>(0);
  const goalBefore = useRef<GoalProgress | null>(null);
  // Set while a grade is being saved, so a double tap cannot grade twice.
  const busy = useRef(false);

  // Voices load asynchronously; start now so the first tap has a good one.
  useEffect(() => warmUpSpeech(), []);

  const load = useCallback(async (extra: boolean) => {
    void requestPersistence();
    const [words, falseFriends, frequency, mined, introduced] = await Promise.all([
      loadWords(),
      loadFalseFriends(),
      loadWordFrequency(),
      loadMinedWords(),
      newIntroducedToday(),
    ]);
    await ensureCards([...words.values()], getDeviceId());
    // Sentence cards share the table but are drilled on /build.
    const all = (await db.cards.toArray()).filter(
      (c) => c.cardType !== "sentence" && drillable(c, words, falseFriends),
    );
    goalBefore.current = await goalProgress();
    const q = buildQueue(all, new Date(), {
      rankNew: newCardRanker(words, frequency, mined),
      newPerSession: newAllowance(introduced, NEW_PER_SESSION, extra),
    });
    const nextDue = all
      .filter((c) => c.state !== State.New && !c.suspended)
      .reduce<Date | null>((min, c) => (min === null || c.due < min ? c.due : min), null);
    return { deck: { words, falseFriends, mined }, queue: q, nextDue, capped: introduced >= DAILY_NEW_LIMIT };
  }, []);

  const begin = useCallback(
    (loaded: Awaited<ReturnType<typeof load>>) => {
      setDeck(loaded.deck);
      setQueue(loaded.queue.map((card) => ({ card, retries: 0 })));
      setTotal(loaded.queue.length);
      setCleared(0);
      setGraded({ count: 0, passed: 0 });
      setCombo(0);
      setBestCombo(0);
      setFinished(null);
      setNextDue(loaded.nextDue);
      setCapped(loaded.capped);
      startedAt.current = Date.now();
      busy.current = false;
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;
    load(false)
      .then((loaded) => !cancelled && begin(loaded))
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load deck"));
    return () => {
      cancelled = true;
    };
  }, [load, begin]);

  const current = queue[0];
  const word = current && deck ? deck.words.get(current.card.wordId) : undefined;
  const now = useMemo(() => new Date(), [turn]); // eslint-disable-line react-hooks/exhaustive-deps
  const intervals = useMemo(
    () => (current ? (previewIntervals(current.card, now) as Record<Grade, Date>) : null),
    [current, now],
  );

  const finish = useCallback(async () => {
    const goal = await goalProgress();
    const before = goalBefore.current;
    setFinished({ ms: Date.now() - startedAt.current, goal, crossed: Boolean(before && !before.met && goal.met) });
  }, []);

  const onGrade = useCallback(
    async (rating: Grade) => {
      if (!current || busy.current) return;
      busy.current = true;
      const at = new Date();
      const result = grade(current.card, rating, at);
      const deviceId = getDeviceId();
      const next: StoredCard = { ...result.card, updatedAt: at, deviceId };
      await saveGradedCard(next, {
        id: uuid(),
        cardId: result.review.cardId,
        rating: result.review.rating,
        reviewedAt: at,
        state: result.review.state,
        durationMs: null,
        deviceId,
      });

      const missed = rating === Rating.Again;
      const retry = missed && current.retries < MAX_RETRIES;
      setGraded((g) => ({ count: g.count + 1, passed: g.passed + (missed ? 0 : 1) }));
      if (!retry) setCleared((n) => n + 1);

      const run = missed ? 0 : combo + 1;
      setCombo(run);
      setBestCombo((b) => Math.max(b, run));
      if (run === 3 || run === 5 || run === 10 || (run > 10 && run % 10 === 0)) {
        setTimeout(() => playCombo(run), 260);
      }

      const rest = queue.slice(1);
      if (retry) {
        rest.splice(Math.min(RETRY_GAP, rest.length), 0, { card: next, retries: current.retries + 1 });
      }
      setQueue(rest);
      setTurn((t) => t + 1);
      busy.current = false;
      if (rest.length === 0) void finish();
    },
    [current, queue, combo, finish],
  );

  if (error) return <ErrorState message={error} />;
  if (!deck) return <Loading label="Shuffling your cards…" />;

  if (finished || !current || !word || !intervals) {
    const accuracy = graded.count ? Math.round((graded.passed / graded.count) * 100) : 0;
    const more = () => {
      setDeck(null);
      load(true)
        .then(begin)
        .catch((e) => setError(e instanceof Error ? e.message : "Failed to load deck"));
    };
    const waitFor = nextDue && nextDue > new Date() ? until(nextDue) : null;
    return (
      <SessionComplete
        celebrate={graded.count > 0}
        title={graded.count > 0 ? "Review complete!" : "All caught up!"}
        subtitle={
          graded.count > 0
            ? bestCombo >= 5
              ? `Best run: ${bestCombo} in a row.`
              : "Every card is saved and scheduled."
            : capped
              ? `That's your ${DAILY_NEW_LIMIT} new words for today${waitFor ? `. Next review ${waitFor}` : ""}.`
              : `Nothing is due${waitFor ? `. Next review ${waitFor}` : " right now"}.`
        }
        stats={[
          { label: "Reviewed", value: graded.count, icon: "cards", color: "gold" },
          { label: "Accuracy", value: accuracy, suffix: "%", icon: "target", color: "green" },
          {
            label: "Time",
            value: Math.round((finished?.ms ?? 0) / 1000),
            format: (s) => formatDuration(s * 1000),
            icon: "clock",
            color: "blue",
          },
        ]}
        goalMet={finished?.crossed ? { streak: finished.goal.streak } : null}
        primary={{ label: "Continue", href: "/" }}
        secondary={
          capped ? { label: "Learn 8 more words anyway", onClick: more } : { label: "Build sentences", href: "/build" }
        }
      />
    );
  }

  const mined = deck.mined.get(word.id);
  const firstOuting = current.card.reps === 0 && current.retries === 0;

  return (
    <SessionShell
      progress={total ? cleared / total : 0}
      combo={combo}
      actions={
        <TopBarToggle
          on={sound.any}
          onChange={sound.setAll}
          iconOn="speaker"
          iconOff="speakerOff"
          label={sound.any ? "Mute all sound" : "Turn sound on"}
        />
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${current.card.id}:${turn}`}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex flex-1 flex-col"
        >
          <ReviewCard
            word={word}
            cardType={current.card.cardType as CardType}
            isNew={current.card.state === State.New}
            falseFriend={deck.falseFriends.get(word.simplified)}
            intervals={intervals}
            now={now}
            speech={sound.speech}
            context={firstOuting ? mined?.context : undefined}
            onGrade={onGrade}
          />
        </motion.div>
      </AnimatePresence>
    </SessionShell>
  );
}
