"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MascotBubble } from "@/components/ui/Bubble";
import { SpeakButton } from "@/components/ui/Controls";
import { Icon } from "@/components/ui/Icon";
import { ActionBar, SessionFooter } from "@/components/ui/SessionShell";
import { glossEn } from "@/lib/gloss";
import type { FalseFriend, Word } from "@/lib/hanviet";
import { checkPinyin, type PinyinVerdict } from "@/lib/pinyinAnswer";
import { numericToMarks } from "@/lib/pinyinFormat";
import { playCorrect, playPress, playWrong } from "@/lib/sound";
import { speak } from "@/lib/speak";
import { Rating, type CardType } from "@/lib/srs";
import { CognateHint } from "./CognateHint";

export type Grade = typeof Rating.Again | typeof Rating.Hard | typeof Rating.Good | typeof Rating.Easy;

/** "<1m", "10m", "1d", "3w": the gap before the card returns at each grade. */
export function formatInterval(due: Date, now: Date): string {
  const minutes = (due.getTime() - now.getTime()) / 60_000;
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = minutes / 60;
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = hours / 24;
  if (days < 14) return `${Math.round(days)}d`;
  if (days < 60) return `${Math.round(days / 7)}w`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
}

const GRADES: Array<{ rating: Grade; label: string; cls: string }> = [
  { rating: Rating.Again, label: "Again", cls: "btn-danger" },
  { rating: Rating.Hard, label: "Hard", cls: "btn-gold" },
  { rating: Rating.Good, label: "Good", cls: "btn-primary" },
  { rating: Rating.Easy, label: "Easy", cls: "btn-info" },
];

interface ReviewCardProps {
  word: Word;
  cardType: CardType;
  /** Never reviewed: a recognition card becomes a teaching card. */
  isNew: boolean;
  falseFriend?: FalseFriend;
  /** When the card would next be due at each grade. */
  intervals: Record<Grade, Date>;
  now: Date;
  speech: boolean;
  /** The reading sentence a mined word came from, shown on its first outing. */
  context?: { hanzi: string; en: string };
  onGrade: (rating: Grade) => void;
}

function Answer({ word }: { word: Word }) {
  return (
    <div className="flex flex-col items-center gap-1 text-center">
      <p className="text-3xl font-extrabold text-ink">{word.pinyin}</p>
      <p className="text-lg text-ink-2">{glossEn(word)}</p>
    </div>
  );
}

function Context({ context, full }: { context: { hanzi: string; en: string }; full: boolean }) {
  return (
    <div className="rounded-2xl bg-blue-soft px-4 py-3 text-sm text-blue-ink">
      <p className="text-xs font-extrabold uppercase tracking-wider">From your reading</p>
      <p lang="zh-Hans" className="mt-1 text-lg text-ink">
        {context.hanzi}
      </p>
      {full && <p className="text-ink-2">{context.en}</p>}
    </div>
  );
}

export function ReviewCard({
  word,
  cardType,
  isNew,
  falseFriend,
  intervals,
  now,
  speech,
  context,
  onGrade,
}: ReviewCardProps) {
  const hanvietPrompt = cardType === "hanviet" && Boolean(word.hanviet);
  const typed = cardType === "typing" || cardType === "hanviet";
  // A word seen for the first time is taught, not tested: everything shown at
  // once, then "Got it". Testing recall of a word never seen is just a guess.
  const intro = isNew && cardType === "recognition";

  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(intro);
  const [verdict, setVerdict] = useState<PinyinVerdict | null>(null);
  const graded = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // No reset effect: the session remounts this per card with a key, so state
  // already starts fresh for each one.
  useEffect(() => {
    if (typed) inputRef.current?.focus();
  }, [typed]);

  useEffect(() => {
    if (intro && speech) speak(word.simplified);
  }, [intro, speech, word.simplified]);

  const reveal = useCallback(
    (given: string | null) => {
      if (revealed) return;
      if (typed) {
        const v = given === null ? "wrong" : checkPinyin(given, word.pinyin, word.toneNumbers);
        setVerdict(v);
        if (v === "correct") playCorrect();
        else if (v === "wrong") playWrong();
        else playPress();
      }
      setRevealed(true);
      // Heard the moment the answer shows, never before: before, it would
      // read out the pinyin being tested.
      if (speech) speak(word.simplified);
    },
    [revealed, typed, word, speech],
  );

  const grade = useCallback(
    (rating: Grade) => {
      if (graded.current) return;
      graded.current = true;
      if (!typed && !intro) {
        if (rating === Rating.Again) playWrong();
        else playCorrect();
      }
      onGrade(rating);
    },
    [typed, intro, onGrade],
  );

  // The grade a typed answer implies; emphasised in the panel.
  const suggested: Grade = verdict === "wrong" ? Rating.Again : verdict === "tones" ? Rating.Hard : Rating.Good;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (!revealed) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          reveal(null);
        }
        return;
      }
      if (intro) {
        if (e.key === " " || e.key === "Enter") grade(Rating.Good);
        return;
      }
      const n = Number(e.key);
      if (n >= 1 && n <= 4) grade(n as Grade);
      else if (e.key === "Enter" && typed) grade(suggested);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, intro, typed, suggested, grade, reveal]);

  const say = () => speak(word.simplified);
  const preview = /[0-5]/.test(answer) ? numericToMarks(answer) : null;

  const prompt = intro
    ? "New word"
    : cardType === "recognition"
      ? "What does this mean?"
      : hanvietPrompt
        ? "Guess the pinyin from Hán-Việt"
        : "Type the pinyin";

  const title =
    !revealed || intro
      ? undefined
      : verdict === "correct"
        ? "Correct!"
        : verdict === "tones"
          ? "Right sounds, check the tones"
          : verdict === "wrong"
            ? answer.trim()
              ? "Not quite"
              : "Here it is"
            : undefined;

  const tone =
    !revealed || intro
      ? "idle"
      : verdict === "correct"
        ? "correct"
        : verdict === "tones"
          ? "almost"
          : verdict === "wrong"
            ? "wrong"
            : "info";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center gap-2">
        {intro && (
          <span className="rounded-full bg-purple-soft px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-purple-ink">
            New
          </span>
        )}
        <h2 className="text-2xl font-extrabold text-ink">{prompt}</h2>
      </div>

      <MascotBubble mood={intro ? "happy" : !revealed ? "think" : verdict === "wrong" ? "sad" : "happy"}>
        {hanvietPrompt && !intro ? (
          <div className="flex flex-col py-1">
            <span className="text-xs font-extrabold uppercase tracking-wider text-gold-ink">Hán-Việt</span>
            <span className="text-3xl font-extrabold text-gold-ink">{word.hanviet}</span>
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3">
            <span lang="zh-Hans" className="text-6xl font-medium leading-tight text-ink">
              {word.simplified}
            </span>
            {revealed && <SpeakButton onClick={say} size="md" />}
          </div>
        )}
      </MascotBubble>

      {context && !revealed && <Context context={context} full={false} />}

      {typed && !revealed && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (answer.trim()) reveal(answer);
          }}
          className="flex flex-col gap-2"
        >
          <input
            ref={inputRef}
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="Type the pinyin"
            aria-label="Pinyin"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            className="field text-center text-xl"
          />
          <p className="h-5 text-center text-sm font-bold text-blue-ink" aria-live="polite">
            {preview && preview !== answer ? `→ ${preview}` : ""}
          </p>
          <div className="flex items-center justify-center gap-2">
            <span className="text-xs font-bold text-ink-3">Tones (optional)</span>
            {[1, 2, 3, 4].map((t) => (
              <button
                key={t}
                type="button"
                // Keep focus in the field, so the phone keyboard stays up.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  setAnswer((a) => a + t);
                  inputRef.current?.focus();
                }}
                aria-label={`Tone ${t}`}
                className="tile h-11 w-12 text-sm font-extrabold"
              >
                {t}
                <span className="text-xs leading-none text-ink-3">{["ˉ", "ˊ", "ˇ", "ˋ"][t - 1]}</span>
              </button>
            ))}
          </div>
        </form>
      )}

      <AnimatePresence>
        {revealed && (
          <motion.div
            initial={intro ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 30 }}
            className="flex flex-col gap-4"
          >
            <div className="card flex flex-col items-center gap-3 px-4 py-5">
              {hanvietPrompt && !intro && (
                <div className="flex items-center gap-3">
                  <span lang="zh-Hans" className="text-5xl font-medium text-ink">
                    {word.simplified}
                  </span>
                  <SpeakButton onClick={say} size="sm" />
                </div>
              )}
              <Answer word={word} />
              {typed && answer.trim() && verdict !== "correct" && (
                <p className="text-sm text-ink-3">
                  You typed <span className="font-bold text-ink-2">{preview ?? answer}</span>
                </p>
              )}
            </div>
            <CognateHint word={word} falseFriend={falseFriend} />
            {context && <Context context={context} full />}
          </motion.div>
        )}
      </AnimatePresence>

      <SessionFooter>
        <ActionBar
          tone={tone}
          title={title}
          actions={
            intro ? (
              <>
                <button type="button" className="btn btn-secondary flex-1" onClick={() => grade(Rating.Easy)}>
                  I knew it
                </button>
                <button type="button" className="btn btn-primary flex-[1.4]" onClick={() => grade(Rating.Good)} autoFocus>
                  Got it
                </button>
              </>
            ) : !revealed ? (
              typed ? (
                <>
                  <button type="button" className="btn btn-secondary flex-1" onClick={() => reveal(null)}>
                    Don&apos;t know
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary flex-[1.4]"
                    disabled={!answer.trim()}
                    onClick={() => reveal(answer)}
                  >
                    Check
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-primary btn-block" onClick={() => reveal(null)}>
                  Show answer
                </button>
              )
            ) : (
              <div className="grid w-full grid-cols-4 gap-2">
                {GRADES.map((g) => {
                  const emphasised = !typed || g.rating === suggested;
                  return (
                    <button
                      key={g.rating}
                      type="button"
                      onClick={() => grade(g.rating)}
                      className={`btn btn-sm h-16 flex-col gap-1 px-1 ${emphasised ? g.cls : "btn-secondary"}`}
                    >
                      <span>{g.label}</span>
                      <span className="text-xs font-bold normal-case tracking-normal opacity-85">
                        {formatInterval(intervals[g.rating], now)}
                      </span>
                    </button>
                  );
                })}
              </div>
            )
          }
        >
          {revealed && !intro && typed && verdict !== "correct" && (
            <span className="text-base font-bold">
              {word.pinyin}
              {verdict === "tones" && <span className="font-semibold"> · you typed {preview ?? answer}</span>}
            </span>
          )}
          {revealed && !intro && !typed && (
            <span className="text-sm font-semibold text-ink-2">How well did you know it?</span>
          )}
          {revealed && !intro && typed && verdict === "correct" && (
            <span className="flex items-center gap-1 text-sm font-semibold">
              <Icon name="sparkles" size={16} /> {word.pinyin}
            </span>
          )}
        </ActionBar>
      </SessionFooter>
    </div>
  );
}
