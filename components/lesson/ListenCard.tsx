"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SpeakButton, ToneKeys } from "@/components/ui/Controls";
import { ActionBar, SessionFooter } from "@/components/ui/SessionShell";
import { glossEn } from "@/lib/gloss";
import type { Word } from "@/lib/hanviet";
import { checkPinyin, type PinyinVerdict } from "@/lib/pinyinAnswer";
import { numericToMarks } from "@/lib/pinyinFormat";
import { playAlmost, playCorrect, playWrong } from "@/lib/sound";
import { speak } from "@/lib/speak";

interface ListenCardProps {
  word: Word;
  onDone: (correct: boolean) => void;
}

/** Hear a word, type its pinyin: the sound to spelling link, with nothing on screen to read. */
export function ListenCard({ word, onDone }: ListenCardProps) {
  const [answer, setAnswer] = useState("");
  const [verdict, setVerdict] = useState<PinyinVerdict | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  const say = useCallback(() => speak(word.simplified), [word.simplified]);
  const slow = useCallback(() => speak(word.simplified, 0.6), [word.simplified]);

  useEffect(() => {
    inputRef.current?.focus();
    const t = setTimeout(say, 250);
    return () => clearTimeout(t);
  }, [say]);

  const check = (given: string | null) => {
    if (verdict) return;
    const v = given === null ? "wrong" : checkPinyin(given, word.pinyin, word.pinyinNumeric);
    setVerdict(v);
    if (v === "correct") playCorrect();
    else if (v === "tones") playAlmost();
    else playWrong();
  };

  // Right sounds with a tone slip passes here: hearing tones is the drill's job.
  const passed = verdict === "correct" || verdict === "tones";
  const preview = /[0-5]/.test(answer) ? numericToMarks(answer) : null;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-2xl font-extrabold text-ink">Type what you hear</h2>
      <div className="flex items-center justify-center gap-4 py-4">
        <SpeakButton onClick={say} label="Play the word" />
        <SpeakButton onClick={slow} size="md" label="Play it slowly" />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (answer.trim()) check(answer);
        }}
        className="flex flex-col gap-2"
      >
        <input
          ref={inputRef}
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          disabled={verdict !== null}
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
        {verdict === null && (
          <ToneKeys
            onTone={(t) => {
              setAnswer((a) => a + t);
              inputRef.current?.focus();
            }}
          />
        )}
      </form>

      <SessionFooter>
        <ActionBar
          tone={verdict === null ? "idle" : verdict === "correct" ? "correct" : verdict === "tones" ? "almost" : "wrong"}
          title={
            verdict === null ? undefined : verdict === "correct" ? "Nicely done!" : verdict === "tones" ? "Right sounds, check the tones" : "It was:"
          }
          actions={
            verdict === null ? (
              <>
                <button type="button" className="btn btn-secondary flex-1" onClick={() => check(null)}>
                  Don&apos;t know
                </button>
                <button type="button" className="btn btn-primary flex-[1.4]" disabled={!answer.trim()} onClick={() => check(answer)}>
                  Check
                </button>
              </>
            ) : (
              <button
                type="button"
                className={`btn btn-block ${verdict === "correct" ? "btn-primary" : verdict === "tones" ? "btn-gold" : "btn-danger"}`}
                onClick={() => {
                  if (done.current) return;
                  done.current = true;
                  onDone(passed);
                }}
                autoFocus
              >
                Continue
              </button>
            )
          }
        >
          {verdict !== null && (
            <p className="font-bold">
              <span lang="zh-Hans" className="text-xl">
                {word.simplified}
              </span>{" "}
              {word.pinyin} · {glossEn(word, 1)}
            </p>
          )}
        </ActionBar>
      </SessionFooter>
    </div>
  );
}
