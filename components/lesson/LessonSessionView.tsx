"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TileBuilder } from "@/components/build/TileBuilder";
import type { GlossFor } from "@/components/build/WordLookup";
import { ReviewCard, type GradeInfo } from "@/components/review/ReviewCard";
import { ErrorState, Loading, SpeakButton, TopBarToggle } from "@/components/ui/Controls";
import { formatDuration, SessionComplete, type CompletionStat } from "@/components/ui/SessionComplete";
import { SessionShell } from "@/components/ui/SessionShell";
import { recordActivity } from "@/lib/activity";
import {
  loadEmoji,
  loadFalseFriends,
  loadPhrases,
  loadPracticeSentences,
  loadReaderShards,
  READER_LEVELS,
  loadWordFrequency,
  loadWords,
} from "@/lib/data";
import { db, requestPersistence, saveGradedCard } from "@/lib/db/local";
import type { StoredCard } from "@/lib/db/wire";
import { getDeviceId, uuid } from "@/lib/device";
import { glossEn } from "@/lib/gloss";
import { getLessonLength, goalProgress, type GoalProgress } from "@/lib/goal";
import type { FalseFriend, Word } from "@/lib/hanviet";
import { drillableCards, ensureWordCards, frontierLevel, newCardRanker, newWordAllowance, newWordsToday } from "@/lib/intake";
import { planLesson, type Step } from "@/lib/lesson";
import { loadMinedWords, loadSavedSentences, toPracticeSentence } from "@/lib/mining";
import { wordStatuses, type ReaderSentence } from "@/lib/reader";
import type { Sentence } from "@/lib/sentences";
import { playCombo } from "@/lib/sound";
import { speak, warmUpSpeech } from "@/lib/speak";
import { grade, previewIntervals, Rating, State, type CardType, type Grade } from "@/lib/srs";
import { useSound } from "@/lib/useSound";
import { useStoredToggle } from "@/lib/useStoredToggle";
import { ChooseCard } from "./ChooseCard";
import { ListenCard } from "./ListenCard";
import { MatchCard } from "./MatchCard";
import { TranslateCard } from "./TranslateCard";

/** Sentences used in recent lessons, kept on this device so the pool rotates. */
const RECENT_KEY = "chinese.lessonRecent";
const RECENT_MAX = 120;

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function rememberRecent(ids: string[]) {
  const next = [...ids, ...readRecent().filter((id) => !ids.includes(id))].slice(0, RECENT_MAX);
  localStorage.setItem(RECENT_KEY, JSON.stringify(next));
}

/** A corpus sentence fit for building: no names, which are not vocabulary. */
const buildable = (s: ReaderSentence) => !s.tokens.some((t) => t.free?.kind === "name");

interface Loaded {
  words: Map<string, Word>;
  falseFriends: Map<string, FalseFriend>;
  cards: Map<string, StoredCard>;
  emoji: Record<string, string>;
  steps: Step[];
  newWords: number;
}

async function loadLesson(speech: boolean): Promise<Loaded> {
  void requestPersistence();
  const [words, falseFriends, frequency, mined, introduced, length, emoji] = await Promise.all([
    loadWords(),
    loadFalseFriends(),
    loadWordFrequency(),
    loadMinedWords(),
    newWordsToday(),
    getLessonLength(),
    loadEmoji(),
  ]);
  await ensureWordCards(words.values(), getDeviceId());
  const cards = drillableCards(await db.cards.toArray(), words, falseFriends);
  const status = wordStatuses(cards);
  const level = frontierLevel(words, (id) => (status.get(id) ?? "new") !== "new");
  const levels = READER_LEVELS.filter((l) => l <= level);

  const [phrases, reading, generated, saved] = await Promise.all([
    loadPhrases(),
    loadReaderShards(levels).catch(() => []),
    loadPracticeSentences().catch(() => [] as Sentence[]),
    loadSavedSentences(),
  ]);
  const sentences: Sentence[] = [
    ...phrases.map(toPracticeSentence),
    ...reading.filter(buildable).map(toPracticeSentence),
    ...generated,
    ...saved.map(toPracticeSentence),
  ];

  const ranker = newCardRanker(words, frequency, mined);
  const lesson = planLesson({
    words,
    cards,
    status,
    rank: (id) => ranker({ wordId: id, cardType: "recognition" }),
    newAllowance: newWordAllowance(introduced),
    sentences,
    recent: new Set(readRecent()),
    emoji,
    length,
  });

  // With speech off there is nothing to hear: ears-only steps become their reading versions.
  const steps = speech
    ? lesson.steps
    : lesson.steps.flatMap((s): Step[] =>
        s.kind === "listen"
          ? []
          : s.kind === "choose" && s.mode === "listen"
            ? [{ ...s, mode: "meaning" }]
            : s.kind === "build" && s.prompt === "audio"
              ? [{ ...s, prompt: "meaning" }]
              : [s],
      );

  return {
    words,
    falseFriends,
    cards: new Map(cards.map((c) => [c.id, c])),
    emoji,
    steps,
    newWords: lesson.newWordIds.length,
  };
}

interface Entry {
  step: Step;
  /** A second go at a mistake: practice only, never saved to the schedule. */
  retry: boolean;
  key: number;
}

const stepKey = (s: Step) =>
  s.kind === "recall" || s.kind === "intro" ? s.cardId : s.kind === "build" || s.kind === "translate" ? s.sentence.id : s.kind;

export function LessonSessionView() {
  const [data, setData] = useState<Loaded | null>(null);
  const [queue, setQueue] = useState<Entry[]>([]);
  const [done, setDone] = useState(0);
  const [score, setScore] = useState({ right: 0, wrong: 0 });
  const [combo, setCombo] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [finished, setFinished] = useState<{ ms: number; goal: GoalProgress; crossed: boolean } | null>(null);
  const [turn, setTurn] = useState(0);
  const sound = useSound();
  const [showPinyin, setShowPinyin] = useStoredToggle("chinese.tilePinyin", true);
  const [showMeaning] = useStoredToggle("chinese.tileMeaning", true);
  const startedAt = useRef(0);
  const goalBefore = useRef<GoalProgress | null>(null);
  const busy = useRef(false);
  const nextKey = useRef(0);

  useEffect(() => warmUpSpeech(), []);

  const begin = useCallback(async (loaded: Loaded) => {
    goalBefore.current = await goalProgress();
    setData(loaded);
    setQueue(loaded.steps.map((step) => ({ step, retry: false, key: nextKey.current++ })));
    setDone(0);
    setScore({ right: 0, wrong: 0 });
    setCombo(0);
    setFinished(null);
    startedAt.current = Date.now();
    busy.current = false;
  }, []);

  const start = useCallback(() => {
    setData(null);
    loadLesson(sound.speech)
      .then(begin)
      .catch((e) => setError(e instanceof Error ? e.message : "Could not plan a lesson"));
  }, [sound.speech, begin]);

  useEffect(() => {
    let cancelled = false;
    loadLesson(sound.speech)
      .then((loaded) => {
        if (!cancelled) void begin(loaded);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not plan a lesson"));
    return () => {
      cancelled = true;
    };
    // Planned once per visit; a sound toggle mid-lesson shouldn't replan it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const current = queue[0];

  const byText = useMemo(() => {
    const map = new Map<string, Word>();
    for (const w of data?.words.values() ?? []) if (!map.has(w.simplified)) map.set(w.simplified, w);
    return map;
  }, [data]);
  const glossFor = useCallback<GlossFor>(
    (tile) => {
      const word =
        (tile.wordId ? data?.words.get(tile.wordId) : undefined) ?? byText.get(tile.text) ?? byText.get(tile.text + tile.text);
      return word ? glossEn(word, 1) || undefined : undefined;
    },
    [data, byText],
  );

  const complete = useCallback(async (loaded: Loaded) => {
    await recordActivity("lesson");
    rememberRecent(loaded.steps.flatMap((s) => (s.kind === "build" || s.kind === "translate" ? [s.sentence.id] : [])));
    const goal = await goalProgress();
    const before = goalBefore.current;
    setFinished({ ms: Date.now() - startedAt.current, goal, crossed: Boolean(before && !before.met && goal.met) });
  }, []);

  /** Saves a grade to the schedule, the first time a card comes up in this lesson. */
  const save = useCallback(
    async (id: string, rating: Grade) => {
      if (!data) return;
      const card = data.cards.get(id);
      if (!card) return;
      const at = new Date();
      const result = grade(card, rating, at);
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
      data.cards.set(id, next);
    },
    [data],
  );

  /** Moves on. A missed step comes back once, at the end, as Duolingo's retry round does. */
  const advance = useCallback(
    async (passed: boolean, scored = true) => {
      if (!current || !data || busy.current) return;
      busy.current = true;
      if (scored && !current.retry) {
        setScore((s) => (passed ? { ...s, right: s.right + 1 } : { ...s, wrong: s.wrong + 1 }));
        const run = passed ? combo + 1 : 0;
        setCombo(run);
        if (run === 3 || run === 5 || run === 10 || (run > 10 && run % 10 === 0)) setTimeout(() => playCombo(run), 260);
      }
      const rest = queue.slice(1);
      if (!passed && !current.retry) rest.push({ step: current.step, retry: true, key: nextKey.current++ });
      setQueue(rest);
      setDone((n) => n + 1);
      setTurn((t) => t + 1);
      busy.current = false;
      if (rest.length === 0) await complete(data);
    },
    [current, data, queue, combo, complete],
  );

  const onRecall = useCallback(
    async (rating: Grade, info: GradeInfo) => {
      if (!current || current.step.kind !== "recall") return;
      const id = current.step.cardId;
      if (!current.retry) {
        // A card met for the first time and missed comes back tomorrow, not
        // as a lapse: an Again on a new card fixes FSRS difficulty high for good.
        const fresh = data?.cards.get(id)?.state === State.New;
        await save(id, fresh && rating === Rating.Again ? Rating.Hard : rating);
      }
      await advance(info.passed);
    },
    [current, data, save, advance],
  );

  if (error) return <ErrorState message={error} />;
  if (!data) return <Loading label="Planning your lesson…" />;

  if (finished || !current) {
    if (!finished) return <Loading label="Saving…" />;
    const answered = score.right + score.wrong;
    const stats: CompletionStat[] = [];
    if (data.newWords) stats.push({ label: "New words", value: data.newWords, icon: "bookPlus", color: "purple" });
    stats.push({
      label: "Accuracy",
      value: answered ? Math.round((score.right / answered) * 100) : 100,
      suffix: "%",
      icon: "target",
      color: "green",
    });
    stats.push({ label: "Time", value: Math.round(finished.ms / 1000), format: (s) => formatDuration(s * 1000), icon: "clock", color: "blue" });
    return (
      <SessionComplete
        title="Lesson complete!"
        subtitle={score.wrong ? "Your mistakes are saved and will come back." : "Every answer right first time."}
        stats={stats}
        goalMet={finished.crossed ? { streak: finished.goal.streak } : null}
        primary={{ label: "Continue", href: "/" }}
        secondary={{ label: "Another lesson", onClick: start }}
      />
    );
  }

  const step = current.step;
  const total = done + queue.length;
  let body: React.ReactNode = null;

  if (step.kind === "intro" || step.kind === "recall") {
    const card = data.cards.get(step.cardId);
    const word = card ? data.words.get(card.wordId) : undefined;
    if (card && word) {
      const now = new Date();
      body = (
        <ReviewCard
          word={word}
          cardType={card.cardType as CardType}
          wordSeen={step.kind === "recall"}
          falseFriend={data.falseFriends.get(word.simplified)}
          words={data.words}
          intervals={previewIntervals(card, now) as Record<Grade, Date>}
          now={now}
          speech={sound.speech}
          emoji={data.emoji[word.id]}
          onGrade={
            step.kind === "intro"
              ? async (rating) => {
                  await save(step.cardId, rating);
                  await advance(true, false);
                }
              : onRecall
          }
        />
      );
    }
  } else if (step.kind === "choose") {
    const word = data.words.get(step.wordId);
    const options = step.options.map((id) => data.words.get(id)).filter((w): w is Word => Boolean(w));
    if (word) {
      body = (
        <ChooseCard word={word} options={options} mode={step.mode} emoji={data.emoji} speech={sound.speech} onDone={(ok) => void advance(ok)} />
      );
    }
  } else if (step.kind === "match") {
    const words = step.wordIds.map((id) => data.words.get(id)).filter((w): w is Word => Boolean(w));
    body = <MatchCard words={words} speech={sound.speech} onDone={(ok) => void advance(ok)} />;
  } else if (step.kind === "listen") {
    const word = data.words.get(step.wordId);
    if (word) body = <ListenCard word={word} onDone={(ok) => void advance(ok)} />;
  } else if (step.kind === "translate") {
    body = <TranslateCard sentence={step.sentence} distractors={step.distractors} speech={sound.speech} onDone={(ok) => void advance(ok)} />;
  } else {
    const audio = step.prompt === "audio";
    body = (
      <TileBuilder
        sentence={step.sentence}
        glossFor={glossFor}
        distractors={step.distractors}
        speech={sound.speech}
        showPinyin={showPinyin}
        showMeaning={showMeaning}
        heading={audio ? "Tap what you hear" : undefined}
        prompt={
          audio ? (
            <AutoSpeak text={step.sentence.hanzi}>
              <SpeakButton onClick={() => speak(step.sentence.hanzi)} size="md" label="Replay sentence" />
            </AutoSpeak>
          ) : undefined
        }
        onDone={async (result) => {
          const ok = result === "correct";
          if (step.cardId && !current.retry) await save(step.cardId, ok ? Rating.Good : Rating.Again);
          await advance(ok);
        }}
      />
    );
  }

  // A step whose word or card has gone, from a deck change between plan and play.
  if (!body) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <p className="font-bold text-ink-3">This one is no longer in your deck.</p>
        <button type="button" className="btn btn-secondary" onClick={() => void advance(true, false)}>
          Skip
        </button>
      </div>
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
          key={`${current.key}:${stepKey(step)}:${turn}`}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex flex-1 flex-col"
        >
          {current.retry && (
            <p className="mb-3 self-start rounded-full bg-orange-soft px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-orange-ink">
              Another try
            </p>
          )}
          {body}
        </motion.div>
      </AnimatePresence>
    </SessionShell>
  );
}

/** Says the sentence once when the step appears, then leaves the replay button. */
function AutoSpeak({ text, children }: { text: string; children: React.ReactNode }) {
  useEffect(() => {
    const t = setTimeout(() => speak(text), 250);
    return () => clearTimeout(t);
  }, [text]);
  return <div className="flex items-center gap-3 py-1">{children}<span className="font-bold text-ink-2">Listen, then build it</span></div>;
}
