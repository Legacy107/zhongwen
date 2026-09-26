"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { MascotBubble } from "@/components/ui/Bubble";
import { SpeakButton, ToneKeys } from "@/components/ui/Controls";
import { Icon } from "@/components/ui/Icon";
import { ActionBar, SessionFooter } from "@/components/ui/SessionShell";
import { numericToMarks } from "@/lib/pinyinFormat";
import { bareHanzi, checkSentence, markTyped, type SentenceCheck } from "@/lib/sentenceAnswer";
import { isHanzi, type Sentence } from "@/lib/sentences";
import { playAlmost, playCorrect, playWrong } from "@/lib/sound";
import { speak } from "@/lib/speak";
import { Rating, type Grade } from "@/lib/srs";
import { LookupLine, TappableSentence, type GlossFor } from "./WordLookup";

interface TypedSentenceCardProps {
  sentence: Sentence;
  /** Short meaning for a word of the sentence, shown on tap after a wrong answer. */
  glossFor?: GlossFor;
  /** Speak the sentence once the answer is checked. */
  speech?: boolean;
  /** Swap to the word-tile version of this sentence; shown until the answer is checked. */
  onUseTiles?: () => void;
  onDone: (rating: Grade) => void;
}

const UNANSWERED: SentenceCheck = { verdict: "wrong", script: "pinyin", slips: [], hint: null };

/**
 * The sentence's pinyin. With tone slips it is written a syllable at a time,
 * the way they were checked, and the syllables typed wrong are picked out.
 */
function PinyinLine({ sentence, slips }: { sentence: Sentence; slips: number[] }) {
  if (!slips.length || !sentence.syllablePinyin) return <p className="font-bold">{sentence.pinyin}</p>;
  return (
    <p className="font-bold">
      {sentence.syllablePinyin
        .trim()
        .split(/\s+/)
        .map((syllable, i) => (
          <span key={i}>
            {i > 0 && " "}
            <span
              className={
                slips.includes(i) ? "rounded-md bg-surface/80 px-1 underline decoration-wavy decoration-2 underline-offset-4" : ""
              }
            >
              {syllable}
            </span>
          </span>
        ))}
    </p>
  );
}

/**
 * Free production: the sentence typed from memory rather than assembled from
 * tiles, in characters from a Chinese keyboard or in pinyin. Graded loosely
 * (lib/sentenceAnswer.ts), so a miss the learner disagrees with can be
 * overruled.
 */
export function TypedSentenceCard({ sentence, glossFor, speech = true, onUseTiles, onDone }: TypedSentenceCardProps) {
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState<SentenceCheck | null>(null);
  // Index into the sentence's tiles of the word being looked up.
  const [peek, setPeek] = useState<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const done = useRef(false);

  // No reset effect: the session remounts this per card with a key.
  useEffect(() => inputRef.current?.focus(), []);

  const typed = answer.trim() !== "";
  const hanzi = [...answer].some(isHanzi);
  const preview = !hanzi && /[0-5]/.test(answer) ? numericToMarks(answer) : null;

  const check = (given: string | null) => {
    if (result) return;
    const r = given === null ? UNANSWERED : checkSentence(given, sentence);
    setResult(r);
    if (r.verdict === "correct") playCorrect();
    else if (r.verdict === "tones") playAlmost();
    else playWrong();
    if (speech) speak(sentence.hanzi);
  };

  const finish = (rating: Grade) => {
    if (done.current) return;
    done.current = true;
    onDone(rating);
  };

  // Right words with a tone slipped still passes, a step short: the sentence
  // was built, and the tone is a word's to learn.
  const autoGrade: Grade =
    result?.verdict === "correct" ? Rating.Good : result?.verdict === "tones" ? Rating.Hard : Rating.Again;

  const verdict = result?.verdict;
  const tone = !result ? "idle" : verdict === "correct" ? "correct" : verdict === "tones" ? "almost" : "wrong";
  const title = !result
    ? undefined
    : verdict === "correct"
      ? "Nicely done!"
      : verdict === "tones"
        ? "Right words, check the tones"
        : typed
          ? "Correct answer:"
          : "Here it is:";

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-2xl font-extrabold text-ink">Type this in Chinese</h2>

      <MascotBubble mood={!result ? "think" : verdict === "correct" ? "cheer" : verdict === "tones" ? "happy" : "sad"}>
        <p className="text-lg font-semibold leading-snug text-ink">{sentence.enGloss}</p>
      </MascotBubble>

      {!result ? (
        <div className="flex flex-col gap-2">
          <textarea
            ref={inputRef}
            value={answer}
            // One line of text, however it was pasted.
            onChange={(e) => setAnswer(e.target.value.replace(/\s*\n\s*/g, " "))}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              // A Chinese keyboard's Enter picks the word being composed;
              // Safari reports that one as keyCode 229.
              if (e.nativeEvent.isComposing || e.keyCode === 229) return;
              e.preventDefault();
              if (typed) check(answer);
            }}
            rows={2}
            lang="zh-Hans"
            placeholder="Type it in characters or pinyin"
            aria-label="Your answer"
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            className="field resize-none text-center text-xl"
          />
          <p className="h-5 text-center text-sm font-bold text-blue-ink" aria-live="polite">
            {preview && preview !== answer ? `→ ${preview}` : ""}
          </p>
          {!hanzi && (
            <ToneKeys
              onTone={(t) => {
                setAnswer((a) => a + t);
                inputRef.current?.focus();
              }}
            />
          )}
          {onUseTiles && (
            <button type="button" onClick={onUseTiles} className="btn btn-ghost btn-sm mt-2 self-center">
              <Icon name="blocks" size={18} />
              Use the word bank
            </button>
          )}
        </div>
      ) : (
        typed && (
          <motion.div
            animate={verdict === "wrong" ? { x: [0, -10, 10, -7, 7, -3, 0] } : { x: 0 }}
            transition={{ duration: 0.42 }}
            className={`rounded-2xl border-2 px-4 py-3 ${
              verdict === "correct" ? "border-green" : verdict === "tones" ? "border-gold" : "border-red"
            }`}
          >
            <p className="text-xs font-extrabold uppercase tracking-wider text-ink-3">You typed</p>
            {result.script === "hanzi" ? (
              <p lang="zh-Hans" className="mt-1 text-2xl text-ink">
                {markTyped(bareHanzi(answer), bareHanzi(sentence.hanzi)).map((c, i) => (
                  <span key={i} className={c.ok ? "" : "rounded-md bg-red-soft text-red-ink"}>
                    {c.ch}
                  </span>
                ))}
              </p>
            ) : (
              <p className="mt-1 text-xl font-bold text-ink">{numericToMarks(answer.trim())}</p>
            )}
          </motion.div>
        )
      )}

      <SessionFooter>
        <ActionBar
          tone={tone}
          title={title}
          actions={
            !result ? (
              <>
                <button type="button" className="btn btn-secondary flex-1" onClick={() => check(null)}>
                  Don&apos;t know
                </button>
                <button type="button" className="btn btn-primary flex-[1.4]" disabled={!typed} onClick={() => check(answer)}>
                  Check
                </button>
              </>
            ) : (
              <>
                {verdict === "wrong" && typed && (
                  // One reference sentence can't know every good translation;
                  // the learner is trusted to say theirs was one.
                  <button type="button" className="btn btn-ghost flex-1" onClick={() => finish(Rating.Good)}>
                    I was right
                  </button>
                )}
                <button
                  type="button"
                  className={`btn flex-[1.6] ${
                    verdict === "correct" ? "btn-primary" : verdict === "tones" ? "btn-gold" : "btn-danger"
                  }`}
                  onClick={() => finish(autoGrade)}
                  autoFocus
                >
                  Continue
                </button>
              </>
            )
          }
        >
          {result && (
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {verdict === "wrong" && glossFor ? (
                  <TappableSentence
                    hanzi={sentence.hanzi}
                    tiles={sentence.tiles}
                    selected={peek}
                    onTap={(i) => {
                      setPeek(i);
                      if (speech) speak(sentence.tiles[i].text);
                    }}
                  />
                ) : (
                  // Typed in characters and right: they are already on screen.
                  !(verdict === "correct" && result.script === "hanzi") && (
                    <p lang="zh-Hans" className="text-2xl text-ink">
                      {sentence.hanzi}
                    </p>
                  )
                )}
                <PinyinLine sentence={sentence} slips={result.slips} />
                {sentence.viGloss && <p className="text-sm font-semibold opacity-80">🇻🇳 {sentence.viGloss}</p>}
                {result.hint && (
                  <p className="mt-2 flex gap-2 rounded-xl bg-surface/80 px-3 py-2 text-sm font-semibold text-ink">
                    <Icon name="lightbulb" size={18} className="mt-0.5 shrink-0 text-gold" />
                    <span>
                      {result.hint.note}{" "}
                      <span lang="zh-Hans" className="whitespace-nowrap text-base font-bold text-green-ink">
                        {result.hint.chinese}
                      </span>
                    </span>
                  </p>
                )}
                {verdict === "wrong" && glossFor && (
                  <div className="mt-2">
                    <LookupLine
                      tile={peek === null ? null : sentence.tiles[peek]}
                      glossFor={glossFor}
                      showPinyin
                      placeholder="Tap any word to see what it means."
                      onPanel
                    />
                  </div>
                )}
              </div>
              <SpeakButton onClick={() => speak(sentence.hanzi)} size="sm" label="Replay sentence" />
            </div>
          )}
        </ActionBar>
      </SessionFooter>
    </div>
  );
}
