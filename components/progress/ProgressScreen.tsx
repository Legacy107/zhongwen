"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { ErrorState, Loading, PageHeader, Segmented } from "@/components/ui/Controls";
import { Icon, type IconName } from "@/components/ui/Icon";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { loadWords } from "@/lib/data";
import { db } from "@/lib/db/local";
import { goalProgress } from "@/lib/goal";
import {
  charactersByLevel,
  charactersOf,
  computeRetention,
  countKnownWords,
  levelTargets,
  projectTarget,
  wordsByLevel,
  type LevelCount,
  type LevelTarget,
  type Projection,
  type RetentionStats,
} from "@/lib/progress";
import { planReading, wordStatuses } from "@/lib/reader";
import { loadReadingLibrary } from "@/lib/readingLibrary";
import { State } from "@/lib/srs";
import { countByDay, dayKey } from "@/lib/streak";

interface Meta {
  counts: { wordsByLevel: Record<string, number> };
}

interface Snapshot {
  knownWords: number;
  startedWords: number;
  knownChars: number;
  studiedChars: number;
  wordLevels: LevelCount[];
  charLevels: LevelCount[];
  nextTarget: LevelTarget | null;
  projection: Projection;
  retention: RetentionStats;
  sentencesKnown: number;
  streak: number;
  longest: number;
  goal: number;
  perDay: Map<string, number>;
}

interface Reading {
  readable: number;
  onePlus: number;
  total: number;
  levels: string[];
}

async function readSnapshot(): Promise<Snapshot> {
  const [cards, reviews, meta, words, goal] = await Promise.all([
    db.cards.toArray(),
    db.reviews.toArray(),
    fetch("/data/meta.json").then((r) => r.json() as Promise<Meta>),
    loadWords(),
    goalProgress(),
  ]);

  const knownWords = countKnownWords(cards);
  const status = wordStatuses(cards);
  const wordsWith = (pred: (s: string) => boolean) =>
    [...status].filter(([, s]) => pred(s)).flatMap(([id]) => (words.get(id) ? [words.get(id)!] : []));
  const knownCharSet = charactersOf(wordsWith((s) => s === "known"));
  const wordTargets = levelTargets(meta.counts.wordsByLevel);
  const nextTarget = wordTargets.find((t) => t.words > knownWords) ?? null;
  const first = reviews.reduce<Date | null>((min, r) => (min === null || r.reviewedAt < min ? r.reviewedAt : min), null);

  return {
    knownWords,
    startedWords: wordsWith((s) => s !== "new").length,
    knownChars: knownCharSet.size,
    studiedChars: charactersOf(wordsWith((s) => s !== "new")).size,
    wordLevels: wordsByLevel(words.values(), (id) => status.get(id) === "known"),
    charLevels: charactersByLevel(words.values(), knownCharSet),
    nextTarget,
    projection: projectTarget(knownWords, nextTarget?.words ?? knownWords, first),
    retention: computeRetention(reviews),
    sentencesKnown: cards.filter((c) => c.cardType === "sentence" && c.state === State.Review).length,
    streak: goal.streak,
    longest: goal.longest,
    goal: goal.goal,
    perDay: countByDay(goal.timestamps),
  };
}

/** Same sentences and counts as the Read tab, so the two screens never disagree. */
async function readReading(): Promise<Reading> {
  const library = await loadReadingLibrary();
  const plan = planReading(library.sentences, library.status);
  return {
    readable: plan.easy.length,
    onePlus: plan.onePlus.length,
    total: library.sentences.length,
    levels: library.levels,
  };
}

function StatCard({
  icon,
  value,
  label,
  color,
}: {
  icon: IconName;
  value: number;
  label: string;
  color: "green" | "gold" | "orange";
}) {
  const text = { green: "text-green", gold: "text-gold", orange: "text-orange" }[color];
  return (
    <div className="card flex flex-col gap-1 px-3 py-3">
      <span className={text}>
        <Icon name={icon} size={24} />
      </span>
      <span className="text-2xl font-extrabold tabular-nums text-ink">{value.toLocaleString()}</span>
      <span className="text-xs font-bold text-ink-3">{label}</span>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className="text-ink-2">{label}</span>
      <span className="font-extrabold tabular-nums text-ink">{value}</span>
    </div>
  );
}

const WEEKS = 16;

/** Reviews per day for the last few months, GitHub-style: an honest picture of consistency. */
function Heatmap({ perDay, goal }: { perDay: Map<string, number>; goal: number }) {
  const days = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // End on the current week's Saturday so columns are whole weeks.
    const end = new Date(today);
    end.setDate(end.getDate() + (6 - end.getDay()));
    const out: Array<{ key: string; count: number; future: boolean }> = [];
    for (let i = WEEKS * 7 - 1; i >= 0; i--) {
      const d = new Date(end);
      d.setDate(end.getDate() - i);
      const key = dayKey(d);
      out.push({ key, count: perDay.get(key) ?? 0, future: d > today });
    }
    return out;
  }, [perDay]);

  const shade = (n: number) =>
    n === 0 ? "bg-surface-3" : n < goal / 3 ? "bg-green/30" : n < goal ? "bg-green/60" : "bg-green";

  return (
    <div className="grid grid-flow-col grid-rows-7 gap-1" aria-label="Reviews per day, last 16 weeks">
      {days.map((d) => (
        <span
          key={d.key}
          title={`${d.key}: ${d.count} reviews`}
          className={`aspect-square rounded-[4px] ${d.future ? "bg-transparent" : shade(d.count)}`}
        />
      ))}
    </div>
  );
}

export function ProgressScreen() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [measure, setMeasure] = useState<"words" | "chars">("words");
  const [reading, setReading] = useState<Reading | null>(null);

  useEffect(() => {
    let cancelled = false;
    readSnapshot()
      .then((s) => {
        if (cancelled) return;
        setSnap(s);
        // The corpus is megabytes of JSON; parse it after the page has painted.
        readReading()
          .then((r) => !cancelled && setReading(r))
          .catch(() => {});
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not read progress"));
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <ErrorState message={error} />;
  if (!snap) return <Loading label="Counting what you know…" />;

  const { retention, projection, nextTarget } = snap;
  const levels = measure === "words" ? snap.wordLevels : snap.charLevels;

  return (
    <div className="flex flex-col pb-28">
      <PageHeader title="Progress" />
      <div className="mx-auto flex w-full max-w-xl flex-col gap-5 px-4">
        <section className="grid grid-cols-3 gap-3">
          <StatCard icon="book" value={snap.knownWords} label="words known" color="green" />
          <StatCard icon="sparkles" value={snap.knownChars} label="characters" color="gold" />
          <StatCard icon="flame" value={snap.streak} label={`day streak · best ${snap.longest}`} color="orange" />
        </section>

        <section className="card flex flex-col gap-4 p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-extrabold text-ink">HSK levels</h2>
            <div className="w-52">
              <Segmented
                label="Measure"
                value={measure}
                onChange={setMeasure}
                options={[
                  { value: "words", label: "Words" },
                  { value: "chars", label: "Characters" },
                ]}
              />
            </div>
          </div>
          {levels.map((l, i) => {
            const met = l.total > 0 && l.known >= l.total;
            return (
              <motion.div
                key={`${measure}:${l.level}`}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex flex-col gap-1.5"
              >
                <div className="flex items-baseline justify-between text-sm">
                  <span className={`font-extrabold ${met ? "text-green-ink" : "text-ink"}`}>
                    {l.label} {met && "✓"}
                  </span>
                  <span className="font-bold tabular-nums text-ink-3">
                    {l.known.toLocaleString()} / {l.total.toLocaleString()}
                  </span>
                </div>
                <ProgressBar value={l.total ? l.known / l.total : 0} height={12} color={met ? "bg-green" : "bg-blue"} />
              </motion.div>
            );
          })}
          <p className="text-xs text-ink-3">
            {measure === "words"
              ? `A word counts as known once you've recalled it well in every card type. ${snap.startedWords.toLocaleString()} words started so far.`
              : `Each character counts at the first level that uses it. ${snap.studiedChars.toLocaleString()} characters seen in words you've started.`}
          </p>
        </section>

        <section className="card flex flex-col gap-3 p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-extrabold text-ink">Activity</h2>
            <span className="text-xs font-bold text-ink-3">last {WEEKS} weeks</span>
          </div>
          <Heatmap perDay={snap.perDay} goal={snap.goal} />
          <div className="flex items-center justify-end gap-1.5 text-[11px] font-bold text-ink-3">
            less
            {["bg-surface-3", "bg-green/30", "bg-green/60", "bg-green"].map((c) => (
              <span key={c} className={`size-3 rounded-[3px] ${c}`} />
            ))}
            goal met
          </div>
        </section>

        <section className="card flex flex-col gap-2 p-4">
          <h2 className="text-lg font-extrabold text-ink">Reading</h2>
          {reading ? (
            <>
              <p className="text-ink-2">
                You can read <span className="font-extrabold text-blue-ink">{reading.readable.toLocaleString()}</span> of the{" "}
                {reading.total.toLocaleString()} sentences at your level, and{" "}
                <span className="font-extrabold text-ink">{reading.onePlus.toLocaleString()}</span> more are one word away.
              </p>
              <ProgressBar value={reading.total ? reading.readable / reading.total : 0} color="bg-blue" height={12} />
            </>
          ) : (
            <div className="h-12 animate-pulse rounded-xl bg-surface-2" aria-hidden />
          )}
        </section>

        <section className="card flex flex-col p-4">
          <h2 className="mb-1 text-lg font-extrabold text-ink">Retention</h2>
          {retention.retention === null ? (
            <p className="text-sm text-ink-3">No reviews yet.</p>
          ) : (
            <>
              <Row label="Recalled correctly" value={`${(retention.retention * 100).toFixed(1)}%`} />
              <Row label="Reviews total" value={retention.reviews.toLocaleString()} />
              <Row label="Last 7 days" value={retention.lastWeek.toLocaleString()} />
              <Row label="Per active day" value={retention.perActiveDay.toFixed(1)} />
              <Row label="Sentences in review" value={snap.sentencesKnown.toLocaleString()} />
              <p className="mt-2 text-xs text-ink-3">
                The scheduler aims for about 90%: high enough to stick, low enough that you aren&apos;t reviewing
                words you already know cold.
              </p>
            </>
          )}
        </section>

        <section className="card flex flex-col p-4">
          <h2 className="mb-1 text-lg font-extrabold text-ink">Projection</h2>
          {projection.date && nextTarget ? (
            <>
              <Row
                label={`Reaching ${nextTarget.label}`}
                value={projection.date.toLocaleDateString(undefined, { month: "short", year: "numeric" })}
              />
              <Row label="Words to go" value={projection.remaining.toLocaleString()} />
              <Row label="Learning rate" value={`${projection.perDay.toFixed(1)} words/day`} />
            </>
          ) : (
            <p className="text-sm text-ink-3">
              Not enough history yet. A date from a few days of reviews would be noise, so there isn&apos;t one until
              there is a week of data.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
