"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { MascotBubble } from "@/components/ui/Bubble";
import { SpeakButton } from "@/components/ui/Controls";
import { Icon } from "@/components/ui/Icon";
import { ActionBar, SessionFooter } from "@/components/ui/SessionShell";
import { glossEn } from "@/lib/gloss";
import { isEnteringTone, type FalseFriend, type Word } from "@/lib/hanviet";
import { checkPinyin, type PinyinVerdict } from "@/lib/pinyinAnswer";
import { numericToMarks } from "@/lib/pinyinFormat";
import { playAlmost, playCorrect, playPress, playWrong } from "@/lib/sound";
import { speak } from "@/lib/speak";
import { Rating, type CardType } from "@/lib/srs";
import { CognateHint } from "./CognateHint";

export type Grade = typeof Rating.Again | typeof Rating.Hard | typeof Rating.Good | typeof Rating.Easy;

/**
 * What a grade tells the session. `scored` is false for a word's first card
 * (a teaching card, or a first guess from Hán-Việt): meeting a word is not a
 * test of it, so it counts toward new words, not toward accuracy or a combo.
 */
export interface GradeInfo {
  scored: boolean;
  passed: boolean;
}

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

interface ReviewCardProps {
  word: Word;
  cardType: CardType;
  /** Any card of this word reviewed before: false makes this card an introduction. */
  wordSeen: boolean;
  falseFriend?: FalseFriend;
  /** The deck, for Hán-Việt compound examples. */
  words: Map<string, Word>;
  /** When the card would next be due at each grade. */
  intervals: Record<Grade, Date>;
  now: Date;
  speech: boolean;
  /** The reading sentence a mined word came from, shown on its first outing. */
  context?: { hanzi: string; en: string };
  onGrade: (rating: Grade, info: GradeInfo) => void;
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

/** The Hán-Việt to Mandarin tone rule, shown as a hint on a first guess. */
function ToneRule({ hanviet }: { hanviet: string }) {
  const entering = isEnteringTone(hanviet);
  return (
    <div className="rounded-2xl bg-gold-soft px-4 py-3 text-sm text-gold-ink">
      <p className="text-xs font-extrabold uppercase tracking-wider">Hint: the tone rule</p>
      <p className="mt-1 font-bold text-ink">ngang → 1 · huyền → 2 · hỏi, ngã → 3 · sắc, nặng → 4</p>
      {entering && <p className="mt-1 font-semibold">This one ends in -p, -t, -c or -ch, where the rule often breaks.</p>}
    </div>
  );
}

export function ReviewCard({
  word,
  cardType,
  wordSeen,
  falseFriend,
  words,
  intervals,
  now,
  speech,
  context,
  onGrade,
}: ReviewCardProps) {
  const hanvietPrompt = cardType === "hanviet" && Boolean(word.hanviet);
  const typed = cardType === "typing" || cardType === "hanviet";
  // A word's first card never tests it. A recognition card becomes a teaching
  // card; a Hán-Việt card becomes a hinted guess whose miss is not a failure.
  const intro = !wordSeen && cardType === "recognition";
  const firstGuess = !wordSeen && typed;

  const [answer, setAnswer] = useState("");
  const [revealed, setRevealed] = useState(intro);
  const [verdict, setVerdict] = useState<PinyinVerdict | null>(null);
  const [flash, setFlash] = useState<"correct" | "wrong" | null>(null);
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
        const v = given === null ? "wrong" : checkPinyin(given, word.pinyin, word.pinyinNumeric);
        setVerdict(v);
        if (v === "correct") playCorrect();
        else if (firstGuess) playPress();
        else if (v === "tones") playAlmost();
        else playWrong();
      }
      setRevealed(true);
      // Heard the moment the answer shows, never before: before, it would
      // read out the pinyin being tested.
      if (speech) speak(word.simplified);
    },
    [revealed, typed, firstGuess, word, speech],
  );

  const finish = useCallback(
    (rating: Grade) => {
      if (graded.current) return;
      graded.current = true;
      onGrade(rating, { scored: !intro && !firstGuess, passed: rating !== Rating.Again });
    },
    [intro, firstGuess, onGrade],
  );

  /** Self-graded recall: a flash of the result colour, then on to the next card. */
  const selfGrade = useCallback(
    (knew: boolean) => {
      if (graded.current || flash) return;
      if (knew) playCorrect();
      else playWrong();
      setFlash(knew ? "correct" : "wrong");
      setTimeout(() => finish(knew ? Rating.Good : Rating.Again), 260);
    },
    [flash, finish],
  );

  // A typed answer grades itself. Wrong tones are a miss: for a Vietnamese
  // speaker the tone is the word, and T1/T4 slips are the error to train out.
  const autoGrade: Grade = verdict === "correct" ? Rating.Good : Rating.Again;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (intro) {
        if (e.key === " " || e.key === "Enter") finish(Rating.Good);
        return;
      }
      if (!revealed) {
        if (e.key === " " || e.key === "Enter") {
          e.preventDefault();
          reveal(null);
        }
        return;
      }
      if (typed) {
        if (e.key === "Enter") finish(autoGrade);
      } else if (e.key === "1" || e.key === "ArrowLeft") selfGrade(false);
      else if (e.key === "2" || e.key === "ArrowRight" || e.key === " " || e.key === "Enter") selfGrade(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [revealed, intro, typed, autoGrade, finish, reveal, selfGrade]);

  const say = () => speak(word.simplified);
  const preview = /[0-5]/.test(answer) ? numericToMarks(answer) : null;

  const prompt = intro
    ? "New word"
    : cardType === "recognition"
      ? "What does this mean?"
      : hanvietPrompt
        ? "Guess the pinyin from Hán-Việt"
        : "Type the pinyin";

  let tone: "idle" | "correct" | "wrong" | "almost" | "info" = "idle";
  let title: string | undefined;
  if (flash) {
    tone = flash;
    title = flash === "correct" ? "Nice!" : "It'll come back soon";
  } else if (revealed && !intro) {
    if (!typed) {
      tone = "info";
      title = "Did you know it?";
    } else if (verdict === "correct") {
      tone = "correct";
      title = firstGuess ? "Great guess!" : "Correct!";
    } else if (firstGuess) {
      tone = "info";
      title = "Now you know it";
    } else if (verdict === "tones") {
      tone = "almost";
      title = "Right sounds, wrong tones";
    } else {
      tone = "wrong";
      title = answer.trim() ? "Not quite" : "Here it is";
    }
  }

  const mood = intro || verdict === "correct" || flash === "correct" ? "happy" : !revealed ? "think" : firstGuess ? "happy" : "sad";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div className="flex items-center gap-2">
        {firstGuess && (
          <span className="rounded-full bg-purple-soft px-3 py-1 text-xs font-extrabold uppercase tracking-wider text-purple-ink">
            New · guess
          </span>
        )}
        <h2 className={`text-2xl font-extrabold ${intro ? "text-purple-ink" : "text-ink"}`}>{prompt}</h2>
      </div>

      <MascotBubble mood={mood}>
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
      {firstGuess && hanvietPrompt && !revealed && <ToneRule hanviet={word.hanviet!} />}

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
                <span className="text-base leading-none text-ink-3">{["ˉ", "ˊ", "ˇ", "ˋ"][t - 1]}</span>
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
            <CognateHint word={word} falseFriend={falseFriend} showReading={!hanvietPrompt} words={words} />
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
                <button type="button" className="btn btn-secondary flex-1" onClick={() => finish(Rating.Easy)}>
                  I knew it
                </button>
                <button type="button" className="btn btn-primary flex-[1.4]" onClick={() => finish(Rating.Good)} autoFocus>
                  Got it
                </button>
              </>
            ) : !revealed ? (
              typed ? (
                <>
                  <button type="button" className="btn btn-secondary flex-1" onClick={() => reveal(null)}>
                    {firstGuess ? "Show me" : "Don't know"}
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
            ) : typed ? (
              <>
                {verdict !== "correct" && !firstGuess && answer.trim() && (
                  // Typos and spelling variants happen; the learner is trusted to say so.
                  <button type="button" className="btn btn-ghost flex-1" onClick={() => finish(Rating.Good)}>
                    I was right
                  </button>
                )}
                <button
                  type="button"
                  className={`btn flex-[1.6] ${
                    verdict === "correct" || firstGuess ? "btn-primary" : verdict === "tones" ? "btn-gold" : "btn-danger"
                  }`}
                  onClick={() => finish(autoGrade)}
                  autoFocus
                >
                  Continue
                </button>
              </>
            ) : (
              <div className="grid w-full grid-cols-2 gap-3">
                <button type="button" onClick={() => selfGrade(false)} className="btn btn-danger h-16 flex-col gap-1">
                  <span>Forgot</span>
                  <span className="text-xs font-bold normal-case tracking-normal opacity-85">
                    again in {formatInterval(intervals[Rating.Again], now)}
                  </span>
                </button>
                <button type="button" onClick={() => selfGrade(true)} className="btn btn-primary h-16 flex-col gap-1">
                  <span>Knew it</span>
                  <span className="text-xs font-bold normal-case tracking-normal opacity-85">
                    next in {formatInterval(intervals[Rating.Good], now)}
                  </span>
                </button>
              </div>
            )
          }
        >
          {revealed && !intro && typed && verdict !== "correct" && (
            <span className="text-base font-bold">{word.pinyin}</span>
          )}
          {revealed && !intro && typed && verdict === "correct" && (
            <span className="flex items-center gap-1 text-sm font-semibold">
              <Icon name="sparkles" size={16} /> {word.pinyin}
              {firstGuess && " · the tone rule worked"}
            </span>
          )}
        </ActionBar>
      </SessionFooter>
    </div>
  );
}
