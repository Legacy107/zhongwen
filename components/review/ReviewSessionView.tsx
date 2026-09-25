"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorState, Loading, TopBarToggle } from "@/components/ui/Controls";
import { formatDuration, SessionComplete, type CompletionStat } from "@/components/ui/SessionComplete";
import { SessionShell } from "@/components/ui/SessionShell";
import { loadFalseFriends, loadWordFrequency, loadWords } from "@/lib/data";
import { db, requestPersistence, saveGradedCard } from "@/lib/db/local";
import { type StoredCard } from "@/lib/db/wire";
import { getDeviceId, uuid } from "@/lib/device";
import { goalProgress, type GoalProgress } from "@/lib/goal";
import type { FalseFriend, Word } from "@/lib/hanviet";
import { DAILY_NEW_LIMIT, drillableCards, newCardRanker, newWordAllowance, newWordsToday } from "@/lib/intake";
import { loadMinedWords, type MinedWord } from "@/lib/mining";
import { playCombo } from "@/lib/sound";
import { warmUpSpeech } from "@/lib/speak";
import {
  buildQueue,
  cardId,
  grade,
  newCard,
  previewIntervals,
  Rating,
  State,
  WORD_CARD_TYPES,
  type CardType,
} from "@/lib/srs";
import { useSound } from "@/lib/useSound";
import { ReviewCard, type Grade, type GradeInfo } from "./ReviewCard";

interface Deck {
  words: Map<string, Word>;
  falseFriends: Map<string, FalseFriend>;
  mined: Map<string, MinedWord>;
}

interface Loaded {
  deck: Deck;
  queue: StoredCard[];
  /** Words with any card studied before this session. */
  seen: Set<string>;
  nextDue: Date | null;
  capped: boolean;
}

/** Builds SRS rows for any deck word that doesn't have them yet. */
async function ensureCards(words: Word[], deviceId: string): Promise<void> {
  const existing = new Set((await db.cards.toCollection().primaryKeys()) as string[]);
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

async function loadSession(extra: boolean): Promise<Loaded> {
  void requestPersistence();
  const [words, falseFriends, frequency, mined, introduced] = await Promise.all([
    loadWords(),
    loadFalseFriends(),
    loadWordFrequency(),
    loadMinedWords(),
    newWordsToday(),
  ]);
  await ensureCards([...words.values()], getDeviceId());
  // Sentence cards share the table but are drilled on /build.
  const all = drillableCards(
    (await db.cards.toArray()).filter((c) => c.cardType !== "sentence"),
    words,
    falseFriends,
  );
  const queue = buildQueue(all, new Date(), {
    rankNew: newCardRanker(words, frequency, mined),
    newWordLimit: newWordAllowance(introduced, extra),
  });
  const now = Date.now();
  let nextDue: Date | null = null;
  const seen = new Set<string>();
  for (const c of all) {
    if (c.state === State.New || c.suspended) continue;
    seen.add(c.wordId);
    if (c.due.getTime() > now && (nextDue === null || c.due < nextDue)) nextDue = c.due;
  }
  return {
    deck: { words, falseFriends, mined },
    queue,
    seen,
    nextDue,
    capped: !extra && introduced >= DAILY_NEW_LIMIT,
  };
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

interface Tally {
  /** Scored answers: recall of words already met. */
  scored: number;
  passed: number;
  /** Words met for the first time this session. */
  newWords: number;
}

export function ReviewSessionView() {
  const [deck, setDeck] = useState<Deck | null>(null);
  const [queue, setQueue] = useState<Entry[]>([]);
  const [total, setTotal] = useState(0);
  const [cleared, setCleared] = useState(0);
  const [tally, setTally] = useState<Tally>({ scored: 0, passed: 0, newWords: 0 });
  const [combo, setCombo] = useState(0);
  const [bestCombo, setBestCombo] = useState(0);
  const [turn, setTurn] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<{
    ms: number;
    goal: GoalProgress;
    crossed: boolean;
    next: Loaded;
  } | null>(null);
  const [nextDue, setNextDue] = useState<Date | null>(null);
  const [capped, setCapped] = useState(false);
  const [firstTime, setFirstTime] = useState(false);
  const sound = useSound();
  const startedAt = useRef<number>(0);
  const goalBefore = useRef<GoalProgress | null>(null);
  // Words met before (or during) this session; a word's first card teaches instead of testing.
  const [seen, setSeen] = useState<Set<string>>(new Set());
  // Set while a grade is being saved, so a double tap cannot grade twice.
  const busy = useRef(false);

  // Voices load asynchronously; start now so the first tap has a good one.
  useEffect(() => warmUpSpeech(), []);

  const begin = useCallback(async (loaded: Loaded) => {
    goalBefore.current = await goalProgress();
    setSeen(loaded.seen);
    setDeck(loaded.deck);
    setQueue(loaded.queue.map((card) => ({ card, retries: 0 })));
    setTotal(loaded.queue.length);
    setCleared(0);
    setTally({ scored: 0, passed: 0, newWords: 0 });
    setCombo(0);
    setBestCombo(0);
    setFinished(null);
    setNextDue(loaded.nextDue);
    setCapped(loaded.capped);
    startedAt.current = Date.now();
    busy.current = false;
  }, []);

  useEffect(() => {
    let cancelled = false;
    // The very first session writes a card for every word in the deck, which
    // takes a few seconds on a phone; say so rather than look stuck.
    void db.cards.count().then((n) => !cancelled && n === 0 && setFirstTime(true));
    // "Learn more anyway", from the end screen or home, arrives as ?more=1.
    const extra = new URLSearchParams(window.location.search).has("more");
    loadSession(extra)
      .then((loaded) => {
        if (!cancelled) void begin(loaded);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load deck"));
    return () => {
      cancelled = true;
    };
  }, [begin]);

  const current = queue[0];
  const word = current && deck ? deck.words.get(current.card.wordId) : undefined;
  const now = useMemo(() => new Date(), [turn]); // eslint-disable-line react-hooks/exhaustive-deps
  const intervals = useMemo(
    () => (current ? (previewIntervals(current.card, now) as Record<Grade, Date>) : null),
    [current, now],
  );

  const finish = useCallback(async () => {
    // Load the next session now, so "Keep going" can say how much is left.
    const [goal, next] = await Promise.all([goalProgress(), loadSession(false)]);
    const before = goalBefore.current;
    setFinished({
      ms: Date.now() - startedAt.current,
      goal,
      crossed: Boolean(before && !before.met && goal.met),
      next,
    });
  }, []);

  const onGrade = useCallback(
    async (rating: Grade, info: GradeInfo) => {
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

      const wordId = current.card.wordId;
      const firstMeeting = !seen.has(wordId);
      if (firstMeeting) setSeen((prev) => new Set(prev).add(wordId));
      setTally((t) =>
        info.scored
          ? { ...t, scored: t.scored + 1, passed: t.passed + (info.passed ? 1 : 0) }
          : { ...t, newWords: t.newWords + (firstMeeting ? 1 : 0) },
      );

      const missed = rating === Rating.Again;
      const retry = missed && current.retries < MAX_RETRIES;
      if (!retry) setCleared((n) => n + 1);

      // Only real recall moves the combo: meeting a word is not a win.
      if (info.scored) {
        const run = info.passed ? combo + 1 : 0;
        setCombo(run);
        setBestCombo((b) => Math.max(b, run));
        if (run === 3 || run === 5 || run === 10 || (run > 10 && run % 10 === 0)) {
          setTimeout(() => playCombo(run), 260);
        }
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
    [current, queue, combo, seen, finish],
  );

  if (error) return <ErrorState message={error} />;
  if (!deck) {
    return <Loading label={firstTime ? "Setting up your deck. This happens once…" : "Shuffling your cards…"} />;
  }

  if (!current || !word || !intervals) {
    if (total > 0 && !finished) return <Loading label="Saving…" />;
    const accuracy = tally.scored ? Math.round((tally.passed / tally.scored) * 100) : 0;
    const more = finished?.next.queue.length ?? 0;
    const waitFor = nextDue && nextDue > new Date() ? until(nextDue) : null;
    const empty = tally.scored + tally.newWords === 0;

    const stats: CompletionStat[] = [];
    if (tally.newWords) stats.push({ label: "New words", value: tally.newWords, icon: "bookPlus", color: "purple" });
    if (tally.scored) {
      stats.push({ label: "Reviewed", value: tally.scored, icon: "cards", color: "gold" });
      stats.push({ label: "Accuracy", value: accuracy, suffix: "%", icon: "target", color: "green" });
    }
    if (!empty) {
      stats.push({
        label: "Time",
        value: Math.round((finished?.ms ?? 0) / 1000),
        format: (s) => formatDuration(s * 1000),
        icon: "clock",
        color: "blue",
      });
    }

    return (
      <SessionComplete
        celebrate={!empty}
        title={empty ? "All caught up!" : tally.scored ? "Review complete!" : "New words learned!"}
        subtitle={
          empty
            ? capped
              ? `That's your ${DAILY_NEW_LIMIT} new words for today${waitFor ? `. Next review ${waitFor}` : ""}.`
              : `Nothing is due${waitFor ? `. Next review ${waitFor}` : " right now"}.`
            : bestCombo >= 5
              ? `Best run: ${bestCombo} in a row.`
              : "Every card is saved and scheduled."
        }
        stats={stats}
        goalMet={finished?.crossed ? { streak: finished.goal.streak } : null}
        primary={
          more > 0 && finished
            ? { label: `Keep going · ${more}`, onClick: () => void begin(finished.next) }
            : { label: "Continue", href: "/" }
        }
        secondary={
          more > 0
            ? { label: "Done for now", href: "/" }
            : capped
              ? {
                  label: "Learn 8 more words anyway",
                  onClick: () => {
                    setDeck(null);
                    loadSession(true)
                      .then(begin)
                      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load deck"));
                  },
                }
              : { label: "Practise tones", href: "/tones" }
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
            wordSeen={seen.has(word.id)}
            falseFriend={deck.falseFriends.get(word.simplified)}
            words={deck.words}
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
