"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ErrorState, Loading, TopBarToggle } from "@/components/ui/Controls";
import { formatDuration, SessionComplete } from "@/components/ui/SessionComplete";
import { SessionShell } from "@/components/ui/SessionShell";
import { loadFalseFriends, loadPracticeSentences, loadWords } from "@/lib/data";
import { db, saveGradedCard } from "@/lib/db/local";
import { type StoredCard } from "@/lib/db/wire";
import { getDeviceId, uuid } from "@/lib/device";
import { glossEn } from "@/lib/gloss";
import { goalProgress, type GoalProgress } from "@/lib/goal";
import type { Word } from "@/lib/hanviet";
import { drillableCards } from "@/lib/intake";
import { wordStatuses } from "@/lib/reader";
import { loadSavedSentences, toPracticeSentence } from "@/lib/mining";
import { buildGapFill, pickDistractors, type GapFill, type Sentence } from "@/lib/sentences";
import { playCombo } from "@/lib/sound";
import { warmUpSpeech } from "@/lib/speak";
import { buildQueue, cardId, grade, newCard, Rating } from "@/lib/srs";
import { useSound } from "@/lib/useSound";
import { useStoredToggle } from "@/lib/useStoredToggle";
import { GapFillCard } from "./GapFillCard";
import { TileBuilder, type TileResult } from "./TileBuilder";
import type { GlossFor } from "./WordLookup";

/**
 * Sentence-construction practice, scheduled by the same FSRS engine as
 * vocabulary.
 *
 * Each sentence is one card of type `sentence`, whose `wordId` holds the
 * sentence id. Sentences you get wrong come back tomorrow; ones you build
 * cleanly recede.
 */

/** Sentences per session, and how many unseen ones may enter it. */
const SESSION_SIZE = 12;
const NEW_PER_SESSION = 6;

/**
 * The generated set plus sentences saved from reading. Saved ones are the
 * learner's own picks, each met in context with one new word, so they are
 * taken in before the generated set's unseen sentences.
 */
async function loadSentences(): Promise<{ sentences: Sentence[]; saved: Set<string> }> {
  const [generated, saved] = await Promise.all([loadPracticeSentences(), loadSavedSentences()]);
  const fromReading = saved.map(toPracticeSentence);
  return {
    sentences: [...fromReading, ...generated],
    saved: new Set(fromReading.map((s) => s.id)),
  };
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

export function BuildSessionView() {
  const [byId, setById] = useState<Map<string, Sentence> | null>(null);
  const [words, setWords] = useState<Map<string, Word> | null>(null);
  const [queue, setQueue] = useState<StoredCard[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(0);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [combo, setCombo] = useState(0);
  const [finished, setFinished] = useState<{ ms: number; goal: GoalProgress; crossed: boolean } | null>(null);
  const sound = useSound();
  const [showPinyin, setShowPinyin] = useStoredToggle("chinese.tilePinyin", true);
  const [showMeaning, setShowMeaning] = useStoredToggle("chinese.tileMeaning", true);
  const startedAt = useRef(0);
  const goalBefore = useRef<GoalProgress | null>(null);

  useEffect(() => warmUpSpeech(), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [{ sentences, saved }, deck, falseFriends] = await Promise.all([
          loadSentences(),
          loadWords(),
          loadFalseFriends(),
        ]);
        await ensureCards(sentences, getDeviceId());
        const all = await db.cards.toArray();
        const cards = all.filter((c) => c.cardType === "sentence");
        const status = wordStatuses(drillableCards(all, deck, falseFriends));
        goalBefore.current = await goalProgress();
        if (cancelled) return;
        // New sentences in the order they can be built: saved from reading
        // first, then the fewest words not yet studied, then the shortest. A
        // first session full of 手机, 桌子 and 医院 is guesswork, not practice.
        const sentenceById = new Map(sentences.map((s) => [s.id, s]));
        const unstudied = (s: Sentence) =>
          s.tiles.filter((t) => t.wordId && (status.get(t.wordId) ?? "new") === "new").length;
        const q = buildQueue(cards, new Date(), {
          sessionSize: SESSION_SIZE,
          newPerSession: NEW_PER_SESSION,
          rankNew: (c) => {
            const s = sentenceById.get(c.wordId);
            if (!s) return 1e9;
            return (saved.has(c.wordId) ? 0 : 10_000) + unstudied(s) * 100 + s.tiles.length;
          },
        });
        setWords(deck);
        setById(sentenceById);
        setQueue(q);
        setTotal(q.length);
        startedAt.current = Date.now();
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

  // Alternate the two exercise types over a card's life: a sentence only ever
  // reassembled from tiles is not the same as one where you chose the measure
  // word. Memoised: buildGapFill shuffles, so calling it bare in render would
  // reorder the options on every re-render.
  const gap: GapFill | null = useMemo(
    () => (sentence && current && current.reps % 2 === 1 ? buildGapFill(sentence) : null),
    [sentence, current],
  );

  // Wrong tiles in the bank: one for a short sentence, two for a longer one.
  // Keyed on the card and turn, so they stay put while the card is shown.
  const distractors = useMemo(
    () =>
      sentence && byId && !gap
        ? pickDistractors(sentence, [...byId.values()], sentence.tiles.length <= 4 ? 1 : 2)
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sentence?.id, done, gap],
  );

  // A tile with no deck word is usually a short form (妈 for 妈妈), so it
  // falls back to the word it shortens, found by its text.
  const byText = useMemo(() => {
    const map = new Map<string, Word>();
    for (const w of words?.values() ?? []) if (!map.has(w.simplified)) map.set(w.simplified, w);
    return map;
  }, [words]);
  const glossFor = useCallback<GlossFor>(
    (tile) => {
      const word =
        (tile.wordId ? words?.get(tile.wordId) : undefined) ?? byText.get(tile.text) ?? byText.get(tile.text + tile.text);
      return word ? glossEn(word, 1) || undefined : undefined;
    },
    [words, byText],
  );

  const onDone = useCallback(
    async (result: TileResult) => {
      if (!current) return;
      // Ordering is right or wrong, with no partial credit: Good or Again.
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
      const run = result === "correct" ? combo + 1 : 0;
      setCombo(run);
      if (run === 3 || run === 5 || run === 10) setTimeout(() => playCombo(run), 200);
      setScore((s) => ({
        correct: s.correct + (result === "correct" ? 1 : 0),
        wrong: s.wrong + (result === "wrong" ? 1 : 0),
      }));
      setDone((n) => n + 1);
      const rest = queue.slice(1);
      setQueue(rest);
      if (rest.length === 0) {
        const goal = await goalProgress();
        const before = goalBefore.current;
        setFinished({ ms: Date.now() - startedAt.current, goal, crossed: Boolean(before && !before.met && goal.met) });
      }
    },
    [current, queue, combo],
  );

  if (error) return <ErrorState message={error} />;
  if (!byId) return <Loading label="Setting out the tiles…" />;

  if (finished || !current || !sentence) {
    const count = score.correct + score.wrong;
    return (
      <SessionComplete
        celebrate={count > 0}
        title={count > 0 ? "Sentences built!" : "Nothing to build"}
        subtitle={
          count > 0
            ? score.wrong > 0
              ? `${score.wrong} will come back for another try.`
              : "Every one right first time."
            : "No sentences are due. Read something to save new ones."
        }
        stats={[
          { label: "Built", value: count, icon: "blocks", color: "purple" },
          {
            label: "Accuracy",
            value: count ? Math.round((score.correct / count) * 100) : 0,
            suffix: "%",
            icon: "target",
            color: "green",
          },
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
        secondary={{ label: "Read sentences", href: "/read" }}
      />
    );
  }

  return (
    <SessionShell
      progress={total ? done / total : 0}
      combo={combo}
      actions={
        <>
          <TopBarToggle
            on={showPinyin}
            onChange={setShowPinyin}
            iconOn="eye"
            iconOff="eyeOff"
            label={showPinyin ? "Hide pinyin on tiles" : "Show pinyin on tiles"}
          />
          <TopBarToggle
            on={showMeaning}
            onChange={setShowMeaning}
            iconOn="translate"
            iconOff="translateOff"
            label={showMeaning ? "Hide meanings on tiles" : "Show meanings on tiles"}
          />
          <TopBarToggle
            on={sound.any}
            onChange={sound.setAll}
            iconOn="speaker"
            iconOff="speakerOff"
            label={sound.any ? "Mute all sound" : "Turn sound on"}
          />
        </>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={`${current.id}:${done}`}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex flex-1 flex-col"
        >
          {gap ? (
            <GapFillCard
              sentence={sentence}
              gap={gap}
              speech={sound.speech}
              showPinyin={showPinyin}
              glossFor={glossFor}
              showMeaning={showMeaning}
              onDone={(ok) => onDone(ok ? "correct" : "wrong")}
            />
          ) : (
            <TileBuilder
              sentence={sentence}
              glossFor={glossFor}
              distractors={distractors}
              speech={sound.speech}
              showPinyin={showPinyin}
              showMeaning={showMeaning}
              onDone={onDone}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </SessionShell>
  );
}
