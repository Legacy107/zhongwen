"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SpeakButton } from "@/components/ui/Controls";
import { Icon } from "@/components/ui/Icon";
import { ActionBar, SessionFooter } from "@/components/ui/SessionShell";
import { playCorrect, playPress, playWrong } from "@/lib/sound";
import { CONTRAST_LABEL, CONTRAST_NOTE, TONE_ANCHOR, type ToneDrill } from "@/lib/tones";

/**
 * Pitch contours on a five-level scale (5 high, 1 low), drawn rather than
 * written as ˉˊˇˋ, so each option looks like the shape the voice traces. Tone
 * 3 is drawn low and nearly flat, matching how the app teaches it.
 */
const CONTOUR: Record<number, [number, number][]> = {
  1: [
    [0, 5],
    [1, 5],
  ],
  2: [
    [0, 3],
    [1, 5],
  ],
  3: [
    [0, 2],
    [0.5, 1.2],
    [1, 1.4],
  ],
  4: [
    [0, 5],
    [1, 1],
  ],
  5: [[0.5, 2.5]],
};

function Contour({ tone }: { tone: number }) {
  const pts = CONTOUR[tone] ?? CONTOUR[5];
  const x = (t: number) => 6 + t * 36;
  const y = (level: number) => 44 - (level - 1) * 9;
  const d =
    pts.length === 3
      ? `M${x(pts[0][0])},${y(pts[0][1])} Q${x(pts[1][0])},${y(pts[1][1]) + 6} ${x(pts[2][0])},${y(pts[2][1])}`
      : `M${pts.map(([t, l]) => `${x(t)},${y(l)}`).join(" L")}`;
  return (
    <svg viewBox="0 0 48 50" className="h-12 w-11" aria-hidden>
      {[1, 2, 3, 4, 5].map((l) => (
        <line key={l} x1={4} x2={44} y1={y(l)} y2={y(l)} stroke="var(--line)" strokeWidth={1} />
      ))}
      {pts.length === 1 ? (
        <circle cx={x(0.5)} cy={y(2.5)} r={4} fill="currentColor" />
      ) : (
        <path d={d} fill="none" stroke="currentColor" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" />
      )}
    </svg>
  );
}

const TONE_NAME: Record<number, string> = { 1: "high", 2: "rising", 3: "low", 4: "falling", 5: "neutral" };

interface ToneDrillCardProps {
  drill: ToneDrill;
  /** Play the word on arrival. Only reliable where speech is not gesture-gated (not iOS). */
  autoPlay?: boolean;
  onAnswer: (correct: boolean) => void;
  onPlayAudio: (rate?: number) => void;
}

/**
 * An ear-only drill: the characters stay hidden until the answer is in, since
 * a learner who can read 水果 knows its tones without hearing anything. The
 * contrast being drilled is named only in the feedback, where it teaches,
 * rather than above the options, where it gave the answer away.
 */
export function ToneDrillCard({ drill, autoPlay = false, onAnswer, onPlayAudio }: ToneDrillCardProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [peek, setPeek] = useState(false);
  const done = useRef(false);
  const answerKey = drill.answer.join();
  const correct = selected === answerKey;

  useEffect(() => {
    if (!autoPlay) return;
    const t = setTimeout(() => onPlayAudio(), 300);
    return () => clearTimeout(t);
  }, [autoPlay, onPlayAudio]);

  const check = useCallback(() => {
    if (!selected || checked) return;
    setChecked(true);
    if (selected === answerKey) playCorrect();
    else playWrong();
  }, [selected, checked, answerKey]);

  const syllables = drill.word.toneNumbers.length;

  return (
    <div className="flex flex-1 flex-col gap-6">
      <h2 className="text-2xl font-extrabold text-ink">Which tones do you hear?</h2>

      <div className="flex flex-col items-center gap-4 py-2">
        <div className="flex items-center gap-3">
          <SpeakButton onClick={() => onPlayAudio()} size="lg" label="Play the word again" />
          <button type="button" onClick={() => onPlayAudio(0.55)} className="btn btn-secondary btn-sm" aria-label="Play slowly">
            Slow
          </button>
        </div>
        {checked || peek ? (
          <div className="flex flex-col items-center">
            <span lang="zh-Hans" className="text-6xl font-medium text-ink">
              {drill.word.simplified}
            </span>
            {checked && <span className="text-xl font-bold text-ink-2">{drill.word.pinyin}</span>}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <div className="flex gap-2" aria-hidden>
              {Array.from({ length: syllables }, (_, i) => (
                <span key={i} className="grid size-16 place-items-center rounded-2xl border-2 border-dashed border-line-strong text-2xl font-extrabold text-ink-3">
                  ?
                </span>
              ))}
            </div>
            <button type="button" onClick={() => setPeek(true)} className="btn btn-ghost btn-sm">
              <Icon name="eye" size={18} /> Show characters
            </button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {drill.options.map((option) => {
          const key = option.join();
          const state = checked
            ? key === answerKey
              ? "tile-correct"
              : key === selected
                ? "tile-wrong"
                : "opacity-50"
            : key === selected
              ? "tile-selected"
              : "";
          return (
            <button
              key={key}
              type="button"
              disabled={checked}
              onClick={() => {
                playPress();
                setSelected(key);
              }}
              aria-label={option.map((t) => `tone ${t}`).join(" then ")}
              className={`tile min-h-24 gap-1 py-2 ${state}`}
            >
              <span className="flex items-center gap-1 text-purple">
                {option.map((t, i) => (
                  <Contour key={i} tone={t} />
                ))}
              </span>
              <span className="text-xs font-extrabold uppercase tracking-wider">
                {option.map((t) => (t === 5 ? "neutral" : `${t} ${TONE_NAME[t]}`)).join(" + ")}
              </span>
            </button>
          );
        })}
      </div>

      <SessionFooter>
        <ActionBar
          tone={!checked ? "idle" : correct ? "correct" : "wrong"}
          title={!checked ? undefined : correct ? "You heard it!" : "Not this time"}
          actions={
            !checked ? (
              <button type="button" className="btn btn-primary btn-block" disabled={!selected} onClick={check}>
                Check
              </button>
            ) : (
              <button
                type="button"
                className={`btn btn-block ${correct ? "btn-primary" : "btn-danger"}`}
                onClick={() => {
                  if (done.current) return;
                  done.current = true;
                  onAnswer(correct);
                }}
                autoFocus
              >
                Continue
              </button>
            )
          }
        >
          {checked && (
            <div className="flex flex-col gap-1 text-sm font-semibold">
              <p className="text-xs font-extrabold uppercase tracking-wider opacity-80">{CONTRAST_LABEL[drill.contrast]}</p>
              {!correct && drill.foil && (
                <p className="text-base font-bold">
                  <span lang="zh-Hans">{drill.word.simplified}</span> is {drill.word.pinyin}, but{" "}
                  <span lang="zh-Hans">{drill.foil.simplified}</span> is {drill.foil.pinyin}
                </p>
              )}
              <p>{CONTRAST_NOTE[drill.contrast]}</p>
              <p className="opacity-80">
                {drill.answer
                  .map((t) => (TONE_ANCHOR[t] ? `Tone ${t}, ${TONE_ANCHOR[t].name}: ${TONE_ANCHOR[t].hint}` : "Neutral"))
                  .join(" · ")}
              </p>
            </div>
          )}
        </ActionBar>
      </SessionFooter>
    </div>
  );
}
