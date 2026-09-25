"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ReaderSentenceView } from "@/components/ReaderSentenceView";
import { WordSheet } from "@/components/WordSheet";
import { loadFalseFriends, loadReaderShards, loadWords, READER_LEVELS } from "@/lib/data";
import { db } from "@/lib/db/local";
import type { FalseFriend, Word } from "@/lib/hanviet";
import { frontierLevel } from "@/lib/intake";
import { loadMinedWords, mineWord } from "@/lib/mining";
import {
  drawReadingSession,
  planReading,
  tatoebaUrl,
  unknownWords,
  wordStatuses,
  type ReaderSentence,
  type ReaderToken,
  type ReadingPlan,
  type WordStatus,
} from "@/lib/reader";
import { playCorrect, playFanfare, unlockAudio } from "@/lib/sfx";
import { speak, warmUpSpeech } from "@/lib/speak";
import { useAutoSpeak } from "@/lib/useAutoSpeak";
import { useStoredToggle } from "@/lib/useStoredToggle";

const SESSION_SIZE = 8;

interface Library {
  words: Map<string, Word>;
  falseFriends: Map<string, FalseFriend>;
  status: Map<string, WordStatus>;
  sentences: ReaderSentence[];
  levels: string[];
}

/**
 * Levels worth loading: everything up to the one being learned, plus the next,
 * whose one-new-word sentences are exactly the stretch reading should offer.
 */
async function loadLibrary(): Promise<{ library: Library; mined: Set<string> }> {
  const [words, falseFriends, cards, mined] = await Promise.all([
    loadWords(),
    loadFalseFriends(),
    db.cards.toArray(),
    loadMinedWords(),
  ]);
  const status = wordStatuses(cards);
  const frontier = frontierLevel(words, (id) => (status.get(id) ?? "new") !== "new");
  const top = Math.min(READER_LEVELS.length, Number(frontier) + 1);
  const levels = READER_LEVELS.slice(0, top);
  const sentences = await loadReaderShards(levels);
  return { library: { words, falseFriends, status, sentences, levels }, mined: new Set(mined.keys()) };
}

type Phase = "hub" | "session" | "summary";

export function ReadView() {
  const [library, setLibrary] = useState<Library | null>(null);
  const [mined, setMined] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>("hub");
  const [session, setSession] = useState<ReaderSentence[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [sheet, setSheet] = useState<{ token: ReaderToken; index: number } | null>(null);
  const [addedThisSession, setAddedThisSession] = useState<string[]>([]);
  const [showPinyin, setShowPinyin] = useStoredToggle("chinese.readerPinyin", true);
  const [autoSpeak, setAutoSpeak] = useAutoSpeak();

  useEffect(() => warmUpSpeech(), []);

  useEffect(() => {
    let cancelled = false;
    loadLibrary()
      .then(({ library, mined }) => {
        if (cancelled) return;
        setLibrary(library);
        setMined(mined);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not load reading"));
    return () => {
      cancelled = true;
    };
  }, []);

  const plan: ReadingPlan | null = useMemo(
    () => (library ? planReading(library.sentences, library.status) : null),
    [library],
  );

  const start = useCallback(() => {
    if (!library || !plan) return;
    unlockAudio();
    setSession(drawReadingSession(plan, library.status, SESSION_SIZE));
    setIndex(0);
    setRevealed(false);
    setAddedThisSession([]);
    setPhase("session");
  }, [library, plan]);

  const mine = useCallback(async (wordId: string, from?: ReaderSentence) => {
    await mineWord(wordId, from);
    setMined((m) => new Set(m).add(wordId));
    setAddedThisSession((a) => (a.includes(wordId) ? a : [...a, wordId]));
    playCorrect();
  }, []);

  const next = useCallback(() => {
    setSheet(null);
    setRevealed(false);
    if (index + 1 >= session.length) {
      playFanfare();
      setPhase("summary");
    } else {
      setIndex((i) => i + 1);
    }
  }, [index, session.length]);

  if (error) return <p className="text-sm text-rose-400">{error}</p>;
  if (!library || !plan) return <p className="text-sm text-neutral-500">Loading sentences…</p>;

  if (phase === "summary") {
    return (
      <div className="flex w-full max-w-md flex-col items-center gap-3 text-center">
        <p className="text-4xl">读完了</p>
        <p className="text-lg font-medium">Read {session.length} sentences</p>
        <p className="text-sm text-neutral-400">
          {addedThisSession.length > 0
            ? `${addedThisSession.length} new ${addedThisSession.length === 1 ? "word" : "words"} added to your reviews: ${addedThisSession
                .map((id) => library.words.get(id)?.simplified)
                .join("、")}`
            : "No new words added this time."}
        </p>
        <div className="mt-3 flex flex-col items-stretch gap-2 self-stretch">
          {addedThisSession.length > 0 && (
            <Link
              href="/review"
              className="rounded-xl bg-emerald-600 px-4 py-3 font-medium text-white active:bg-emerald-700"
            >
              Review them now
            </Link>
          )}
          <button
            type="button"
            onClick={() => {
              // Reload so words learned since the page opened count as known.
              setLibrary(null);
              setPhase("hub");
              loadLibrary().then(({ library, mined }) => {
                setLibrary(library);
                setMined(mined);
              });
            }}
            className="rounded-xl bg-neutral-800 px-4 py-3 text-sm active:bg-neutral-700"
          >
            Read more
          </button>
          <Link href="/" className="rounded-xl px-4 py-3 text-sm text-neutral-400 active:bg-neutral-900">
            Home
          </Link>
        </div>
      </div>
    );
  }

  if (phase === "session") {
    const sentence = session[index];
    const unknown = unknownWords(sentence, library.status);
    const target = unknown[0] ? library.words.get(unknown[0]) : undefined;
    const sheetWord = sheet?.token.wordId ? library.words.get(sheet.token.wordId) : undefined;

    return (
      <div className="flex w-full max-w-md flex-col gap-5">
        <div className="flex items-center justify-between text-xs text-neutral-500">
          <span>
            {index + 1} / {session.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowPinyin(!showPinyin)}
              aria-pressed={showPinyin}
              className="rounded-full bg-neutral-900 px-3 py-1 text-neutral-300 active:bg-neutral-800"
            >
              {showPinyin ? "拼音 on" : "拼音 off"}
            </button>
            <button
              type="button"
              onClick={() => setAutoSpeak(!autoSpeak)}
              aria-pressed={autoSpeak}
              className="rounded-full bg-neutral-900 px-3 py-1 text-neutral-300 active:bg-neutral-800"
            >
              {autoSpeak ? "🔊 on" : "🔇 off"}
            </button>
          </div>
        </div>

        <div className="flex min-h-48 flex-col items-center justify-center gap-4 rounded-2xl border border-neutral-800 bg-neutral-900/50 px-4 py-8">
          <span className="text-[11px] uppercase tracking-wide text-neutral-500">
            {unknown.length === 0
              ? "All words you've studied"
              : unknown.length === 1
                ? "One new word"
                : `${unknown.length} new words`}
          </span>
          <ReaderSentenceView
            sentence={sentence}
            status={library.status}
            mined={mined}
            showPinyin={showPinyin}
            selected={sheet?.index ?? null}
            onTap={(token, i) => {
              if (autoSpeak) speak(token.text);
              setSheet({ token, index: i });
            }}
          />
          <button
            type="button"
            onClick={() => speak(sentence.hanzi, 0.85)}
            className="rounded-full bg-neutral-800 px-4 py-1.5 text-xs text-neutral-200 active:bg-neutral-700"
          >
            ▶ Listen to the sentence
          </button>
        </div>

        {revealed ? (
          <div className="flex flex-col gap-2 rounded-xl bg-neutral-900/70 px-4 py-3">
            <p className="text-neutral-100">{sentence.en}</p>
            {sentence.vi && <p className="text-sm text-neutral-400">🇻🇳 {sentence.vi}</p>}
            <a
              href={tatoebaUrl(sentence.id)}
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-neutral-600 underline-offset-2 active:underline"
            >
              Tatoeba #{sentence.id.slice(1)}
              {sentence.author ? ` by ${sentence.author}` : ""} · CC BY 2.0 FR
            </a>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRevealed(true)}
            className="rounded-xl border border-neutral-800 px-4 py-3 text-sm text-neutral-300 active:bg-neutral-900"
          >
            Show translation
          </button>
        )}

        {target && !mined.has(target.id) && (
          <button
            type="button"
            onClick={() => void mine(target.id, sentence)}
            className="rounded-xl bg-sky-600/90 px-4 py-3 text-sm font-medium text-white active:bg-sky-700"
          >
            Add {target.simplified} ({target.pinyin}) to reviews
          </button>
        )}
        {target && mined.has(target.id) && (
          <p className="text-center text-xs text-emerald-400">
            {target.simplified} is in your reviews, with this sentence to build.
          </p>
        )}

        <button
          type="button"
          onClick={next}
          className="rounded-xl bg-neutral-100 px-4 py-3 font-medium text-neutral-900 active:bg-neutral-300"
        >
          {index + 1 >= session.length ? "Finish" : "Next"}
        </button>

        <WordSheet
          token={sheet?.token ?? null}
          word={sheetWord}
          status={sheetWord ? (library.status.get(sheetWord.id) ?? "new") : undefined}
          mined={sheetWord ? mined.has(sheetWord.id) : false}
          falseFriend={sheetWord ? library.falseFriends.get(sheetWord.simplified) : undefined}
          onMine={() => sheetWord && void mine(sheetWord.id, sentence)}
          onClose={() => setSheet(null)}
        />
      </div>
    );
  }

  const available = plan.onePlus.length + plan.easy.length + plan.twoPlus.length;
  const suggestions = plan.unlockers.filter((u) => !mined.has(u.wordId)).slice(0, 6);

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Read</h1>
        <p className="text-sm text-neutral-400">
          Real sentences, picked so each one has at most one word you haven&apos;t studied.
          Tap any word for its meaning.
        </p>
      </header>

      <section className="grid grid-cols-2 gap-2">
        <div className="flex flex-col items-center rounded-xl bg-neutral-900 px-3 py-3">
          <span className="text-xl font-semibold tabular-nums">{plan.onePlus.length.toLocaleString()}</span>
          <span className="text-[11px] text-neutral-500">one new word</span>
        </div>
        <div className="flex flex-col items-center rounded-xl bg-neutral-900 px-3 py-3">
          <span className="text-xl font-semibold tabular-nums">{plan.easy.length.toLocaleString()}</span>
          <span className="text-[11px] text-neutral-500">all words studied</span>
        </div>
      </section>

      <button
        type="button"
        onClick={start}
        disabled={available === 0}
        className="rounded-2xl bg-emerald-600 px-5 py-4 font-medium text-white active:bg-emerald-700 disabled:opacity-40"
      >
        {available === 0 ? "Learn a few words first" : `Start reading · ${Math.min(SESSION_SIZE, available)} sentences`}
      </button>

      {suggestions.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl bg-neutral-900/60 p-4">
          <h2 className="text-sm font-medium text-neutral-300">Words that unlock the most reading</h2>
          <p className="text-xs text-neutral-500">
            Each is the only new word in that many sentences. Adding one puts it first in your
            next review.
          </p>
          <ul className="flex flex-col divide-y divide-neutral-800">
            {suggestions.map(({ wordId, sentences }) => {
              const w = library.words.get(wordId);
              if (!w) return null;
              return (
                <li key={wordId} className="flex items-center justify-between gap-3 py-2">
                  <button
                    type="button"
                    onClick={() => speak(w.simplified)}
                    className="flex min-w-0 items-baseline gap-2 text-left"
                  >
                    <span lang="zh-Hans" className="text-xl">
                      {w.simplified}
                    </span>
                    <span className="text-sm text-neutral-400">{w.pinyin}</span>
                    <span className="truncate text-xs text-neutral-500">{w.enGloss?.split(";")[0]}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void mine(wordId)}
                    className="shrink-0 rounded-lg bg-neutral-800 px-3 py-1.5 text-xs text-neutral-200 active:bg-neutral-700"
                  >
                    +{sentences} · Add
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <p className="text-center text-[11px] text-neutral-600">
        {library.sentences.length.toLocaleString()} sentences loaded (HSK {library.levels[0]}–
        {library.levels[library.levels.length - 1]}) · from Tatoeba, CC BY 2.0 FR
      </p>
    </div>
  );
}
