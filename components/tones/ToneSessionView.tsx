"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ErrorState, Loading } from "@/components/ui/Controls";
import { formatDuration, SessionComplete } from "@/components/ui/SessionComplete";
import { SessionShell } from "@/components/ui/SessionShell";
import { recordActivity } from "@/lib/activity";
import { loadWords } from "@/lib/data";
import { goalProgress, type GoalProgress } from "@/lib/goal";
import type { Word } from "@/lib/hanviet";
import { playCombo } from "@/lib/sound";
import { speak, warmUpSpeech } from "@/lib/speak";
import { buildToneDrills, drawSession, type ToneDrill } from "@/lib/tones";
import { ToneDrillCard } from "./ToneDrillCard";

const SESSION_SIZE = 12;

/** Drill what is actually being learned, not the whole deck. */
function drillPool(words: Map<string, Word>): Word[] {
  return [...words.values()].filter((w) => w.level === "1" || w.level === "2" || w.level === "S");
}

/**
 * Tone training weighted to the Vietnamese error profile.
 *
 * Not FSRS-scheduled: a tone contrast is a perceptual skill drilled to
 * automaticity, not a fact with a forgetting curve. The session is redrawn
 * each time, weighted so the Vietnamese-specific confusions come up most.
 * Answers still count toward the daily goal.
 */
export function ToneSessionView() {
  const [drills, setDrills] = useState<ToneDrill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [i, setI] = useState(0);
  const [score, setScore] = useState({ correct: 0, wrong: 0 });
  const [combo, setCombo] = useState(0);
  const [finished, setFinished] = useState<{ ms: number; goal: GoalProgress; crossed: boolean } | null>(null);
  const startedAt = useRef(0);
  const goalBefore = useRef<GoalProgress | null>(null);

  useEffect(() => warmUpSpeech(), []);

  const start = useCallback(async () => {
    const [words, goal] = await Promise.all([loadWords(), goalProgress()]);
    goalBefore.current = goal;
    setDrills(drawSession(buildToneDrills(drillPool(words)), SESSION_SIZE));
    setI(0);
    setScore({ correct: 0, wrong: 0 });
    setCombo(0);
    setFinished(null);
    startedAt.current = Date.now();
  }, []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadWords(), goalProgress()])
      .then(([words, goal]) => {
        if (cancelled) return;
        goalBefore.current = goal;
        setDrills(drawSession(buildToneDrills(drillPool(words)), SESSION_SIZE));
        startedAt.current = Date.now();
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Failed to load words"));
    return () => {
      cancelled = true;
    };
  }, []);

  const current = drills?.[i];
  const play = useCallback(
    (rate = 0.8) => {
      if (current) speak(current.word.simplified, rate);
    },
    [current],
  );

  const onAnswer = useCallback(
    async (ok: boolean) => {
      if (!drills) return;
      const nextDrill = drills[i + 1];
      // Speak the next word from inside this tap: iOS plays speech only from
      // a user gesture, so an effect on the next card would be silent there.
      if (nextDrill) speak(nextDrill.word.simplified, 0.8);
      setScore((s) => ({ correct: s.correct + (ok ? 1 : 0), wrong: s.wrong + (ok ? 0 : 1) }));
      const run = ok ? combo + 1 : 0;
      setCombo(run);
      if (run === 3 || run === 5 || run === 10) setTimeout(() => playCombo(run), 200);
      setI((n) => n + 1);
      await recordActivity("tones");
      if (!nextDrill) {
        const goal = await goalProgress();
        const before = goalBefore.current;
        setFinished({ ms: Date.now() - startedAt.current, goal, crossed: Boolean(before && !before.met && goal.met) });
      }
    },
    [drills, i, combo],
  );

  if (error) return <ErrorState message={error} />;
  if (!drills) return <Loading label="Tuning up…" />;

  if (!current) {
    if (!finished) return <Loading label="Tallying up…" />;
    const count = score.correct + score.wrong;
    return (
      <SessionComplete
        title="Tones trained!"
        subtitle={score.wrong === 0 ? "A clean sweep. Your ear is sharpening." : "Tones are a perceptual skill: little and often wins."}
        stats={[
          { label: "Heard", value: count, icon: "wave", color: "purple" },
          {
            label: "Accuracy",
            value: count ? Math.round((score.correct / count) * 100) : 0,
            suffix: "%",
            icon: "target",
            color: "green",
          },
          {
            label: "Time",
            value: Math.round(finished.ms / 1000),
            format: (s) => formatDuration(s * 1000),
            icon: "clock",
            color: "blue",
          },
        ]}
        goalMet={finished.crossed ? { streak: finished.goal.streak } : null}
        primary={{ label: "Continue", href: "/" }}
        secondary={{ label: "Train again", onClick: () => void start() }}
      />
    );
  }

  return (
    <SessionShell progress={i / drills.length} combo={combo}>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={current.id + i}
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }}
          transition={{ duration: 0.18, ease: "easeOut" }}
          className="flex flex-1 flex-col"
        >
          <ToneDrillCard drill={current} autoPlay={i === 0} onPlayAudio={play} onAnswer={(ok) => void onAnswer(ok)} />
        </motion.div>
      </AnimatePresence>
    </SessionShell>
  );
}
