"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorState, Loading, SpeakButton, TopBarToggle } from "@/components/ui/Controls";
import { Icon } from "@/components/ui/Icon";
import { formatDuration, SessionComplete } from "@/components/ui/SessionComplete";
import { ActionBar, SessionFooter, SessionShell } from "@/components/ui/SessionShell";
import { recordActivity } from "@/lib/activity";
import { glossEn } from "@/lib/gloss";
import { mineWord } from "@/lib/mining";
import {
  drawReadingSession,
  planReading,
  tatoebaUrl,
  unknownWords,
  type ReaderSentence,
  type ReaderToken,
} from "@/lib/reader";
import { loadReadingLibrary, type ReadingLibrary } from "@/lib/readingLibrary";
import { playMined, playNext } from "@/lib/sound";
import { speak, warmUpSpeech } from "@/lib/speak";
import { useSound } from "@/lib/useSound";
import { useStoredToggle } from "@/lib/useStoredToggle";
import { ReaderLegend, ReaderSentenceView } from "./ReaderSentenceView";
import { WordSheet } from "./WordSheet";

const SESSION_SIZE = 8;

export function ReadSessionView() {
  const [library, setLibrary] = useState<ReadingLibrary | null>(null);
  const [session, setSession] = useState<ReaderSentence[]>([]);
  const [mined, setMined] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sheet, setSheet] = useState<{ token: ReaderToken; index: number } | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const [finishedMs, setFinishedMs] = useState<number | null>(null);
  const [showPinyin, setShowPinyin] = useStoredToggle("chinese.readerPinyin", true);
  const sound = useSound();
  const startedAt = useRef(0);
  // The sentence last advanced from, so a double tap cannot skip one.
  const advanced = useRef(-1);

  useEffect(() => warmUpSpeech(), []);

  const start = useCallback(async () => {
    const l = await loadReadingLibrary();
    setLibrary(l);
    setMined(l.mined);
    setSession(drawReadingSession(planReading(l.sentences, l.status), l.status, SESSION_SIZE));
    setIndex(0);
    setRevealed(false);
    setAdded([]);
    setFinishedMs(null);
    advanced.current = -1;
    startedAt.current = Date.now();
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadReadingLibrary()
      .then((l) => {
        if (cancelled) return;
        setLibrary(l);
        setMined(l.mined);
        setSession(drawReadingSession(planReading(l.sentences, l.status), l.status, SESSION_SIZE));
        startedAt.current = Date.now();
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load reading"));
    return () => {
      cancelled = true;
    };
  }, []);

  const mine = useCallback(async (wordId: string, from?: ReaderSentence) => {
    await mineWord(wordId, from);
    setMined((m) => new Set(m).add(wordId));
    setAdded((a) => (a.includes(wordId) ? a : [...a, wordId]));
    playMined();
  }, []);

  const next = useCallback(() => {
    if (advanced.current === index) return;
    advanced.current = index;
    setSheet(null);
    setRevealed(false);
    void recordActivity("read");
    if (index + 1 >= session.length) {
      setFinishedMs(Date.now() - startedAt.current);
    } else {
      playNext();
      setIndex((i) => i + 1);
    }
  }, [index, session.length]);

  if (error) return <ErrorState message={error} />;
  if (!library) return <Loading label="Finding sentences you can read…" />;

  if (finishedMs !== null || session.length === 0) {
    return (
      <SessionComplete
        celebrate={session.length > 0}
        title={session.length ? "Great reading!" : "Nothing to read yet"}
        subtitle={
          session.length === 0
            ? "Learn a few words in review, and sentences made of them will appear here."
            : added.length
              ? `Added ${added.map((id) => library.words.get(id)?.simplified).join("、")} to your reviews.`
              : "Every word you tapped is one step closer to reading freely."
        }
        stats={[
          { label: "Read", value: session.length, icon: "book", color: "blue" },
          { label: "New words", value: added.length, icon: "bookPlus", color: "purple" },
          {
            label: "Time",
            value: Math.round((finishedMs ?? 0) / 1000),
            format: (s) => formatDuration(s * 1000),
            icon: "clock",
            color: "gold",
          },
        ]}
        primary={added.length ? { label: "Review new words", href: "/review" } : { label: "Continue", href: "/read" }}
        secondary={session.length ? { label: "Read more", onClick: () => void start() } : { label: "Start a review", href: "/review" }}
      />
    );
  }

  const sentence = session[index];
  const unknown = unknownWords(sentence, library.status);
  const target = unknown[0] ? library.words.get(unknown[0]) : undefined;
  // The new word as it is said in this sentence, matching the pinyin above it.
  const targetPinyin = target ? (sentence.tokens.find((t) => t.wordId === target.id)?.pinyin ?? target.pinyin) : "";
  const sheetWord = sheet?.token.wordId ? library.words.get(sheet.token.wordId) : undefined;

  return (
    <SessionShell
      progress={index / session.length}
      exitHref="/read"
      actions={
        <>
          <TopBarToggle
            on={showPinyin}
            onChange={setShowPinyin}
            iconOn="eye"
            iconOff="eyeOff"
            label={showPinyin ? "Hide pinyin" : "Show pinyin"}
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
          key={sentence.id}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex flex-1 flex-col gap-6"
        >
          <div className="flex flex-col gap-2">
            <span
              className={`self-start rounded-full px-3 py-1 text-xs font-extrabold uppercase tracking-wider ${
                unknown.length === 0 ? "bg-green-soft text-green-ink" : "bg-blue-soft text-blue-ink"
              }`}
            >
              {unknown.length === 0 ? "You know every word" : unknown.length === 1 ? "One new word" : `${unknown.length} new words`}
            </span>
            <h2 className="text-2xl font-extrabold text-ink">Read this sentence</h2>
            <p className="text-sm text-ink-2">Tap any word you&apos;re unsure of.</p>
          </div>

          <div className="card flex flex-col items-center gap-5 px-3 py-7">
            <ReaderSentenceView
              sentence={sentence}
              status={library.status}
              mined={mined}
              showPinyin={showPinyin}
              selected={sheet?.index ?? null}
              onTap={(token, i) => {
                if (sound.speech) speak(token.text);
                setSheet({ token, index: i });
              }}
            />
            <ReaderLegend sentence={sentence} status={library.status} mined={mined} />
            <div className="flex items-center gap-3">
              <SpeakButton onClick={() => speak(sentence.hanzi, 0.9)} size="md" label="Play the sentence" />
              <button
                type="button"
                onClick={() => speak(sentence.hanzi, 0.6)}
                className="btn btn-secondary btn-sm"
                aria-label="Play the sentence slowly"
              >
                Slow
              </button>
            </div>
          </div>

          {revealed ? (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl bg-surface-2 px-4 py-3"
            >
              <p className="text-lg font-semibold text-ink">{sentence.en}</p>
              {sentence.vi && <p className="text-ink-2">🇻🇳 {sentence.vi}</p>}
              <a
                href={tatoebaUrl(sentence.id)}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs text-ink-3 underline-offset-2 hover:underline"
              >
                Tatoeba #{sentence.id.slice(1)}
                {sentence.author ? ` by ${sentence.author}` : ""} · CC BY 2.0 FR
              </a>
            </motion.div>
          ) : (
            <button type="button" onClick={() => setRevealed(true)} className="btn btn-secondary btn-block">
              <Icon name="eye" size={20} /> Show translation
            </button>
          )}

          {target && (
            <div className="flex items-center gap-3 rounded-2xl border-2 border-blue/40 bg-blue-soft px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-extrabold uppercase tracking-wider text-blue-ink">New word</p>
                <p className="text-ink">
                  <span lang="zh-Hans" className="text-2xl">
                    {target.simplified}
                  </span>{" "}
                  <span className="font-bold">{targetPinyin}</span>
                </p>
                <p className="truncate text-sm text-ink-2">{glossEn(target, 1)}</p>
              </div>
              {mined.has(target.id) ? (
                <span className="flex items-center gap-1 text-sm font-extrabold text-green-ink">
                  <Icon name="check" size={20} strokeWidth={3.5} /> Added
                </span>
              ) : (
                <button type="button" onClick={() => void mine(target.id, sentence)} className="btn btn-info btn-sm">
                  <Icon name="plus" size={18} strokeWidth={3.5} /> Add
                </button>
              )}
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      <SessionFooter>
        <ActionBar
          tone="idle"
          actions={
            <button type="button" className="btn btn-primary btn-block" onClick={next}>
              {index + 1 >= session.length ? "Finish" : "Continue"}
            </button>
          }
        />
      </SessionFooter>

      <WordSheet
        token={sheet?.token ?? null}
        word={sheetWord}
        status={sheetWord ? (library.status.get(sheetWord.id) ?? "new") : undefined}
        mined={sheetWord ? mined.has(sheetWord.id) : false}
        falseFriend={sheetWord ? library.falseFriends.get(sheetWord.simplified) : undefined}
        onMine={() => sheetWord && void mine(sheetWord.id, sentence)}
        onClose={() => setSheet(null)}
      />
    </SessionShell>
  );
}
