"use client";

import { useEffect, useState } from "react";
import { db } from "@/lib/db/local";
import {
  computeRetention,
  countKnownWords,
  levelTargets,
  projectTarget,
  type LevelTarget,
  type Projection,
  type RetentionStats,
} from "@/lib/progress";
import { State } from "@/lib/srs";

interface Meta {
  counts: { wordsByLevel: Record<string, number> };
}

interface Snapshot {
  knownWords: number;
  learning: number;
  sentencesKnown: number;
  targets: LevelTarget[];
  nextTarget: LevelTarget | null;
  projection: Projection;
  retention: RetentionStats;
}

async function readSnapshot(): Promise<Snapshot> {
  const [cards, reviews, meta] = await Promise.all([
    db.cards.toArray(),
    db.reviews.toArray(),
    fetch("/data/meta.json").then((r) => r.json() as Promise<Meta>),
  ]);

  const knownWords = countKnownWords(cards);
  const learning = new Set(
    cards.filter((c) => c.cardType !== "sentence" && c.state === State.Learning).map((c) => c.wordId),
  ).size;
  const sentencesKnown = cards.filter(
    (c) => c.cardType === "sentence" && c.state === State.Review,
  ).length;

  const targets = levelTargets(meta.counts.wordsByLevel);
  const nextTarget = targets.find((t) => t.words > knownWords) ?? null;
  const first = reviews.reduce<Date | null>(
    (min, r) => (min === null || r.reviewedAt < min ? r.reviewedAt : min),
    null,
  );

  return {
    knownWords,
    learning,
    sentencesKnown,
    targets,
    nextTarget,
    projection: projectTarget(knownWords, nextTarget?.words ?? knownWords, first),
    retention: computeRetention(reviews),
  };
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between py-1.5">
      <span className="text-sm text-neutral-400">{label}</span>
      <span className="text-sm tabular-nums">{value}</span>
    </div>
  );
}

export function ProgressView() {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await readSnapshot();
        if (!cancelled) setSnap(s);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not read progress");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <p className="text-sm text-rose-400">{error}</p>;
  if (!snap) return <p className="text-sm text-neutral-500">Reading progress…</p>;

  const { retention, projection, nextTarget } = snap;

  return (
    <div className="flex w-full max-w-md flex-col gap-5">

      <section className="flex flex-col gap-3 rounded-2xl bg-neutral-900/60 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-neutral-400">Words known</span>
          <span className="text-2xl font-semibold tabular-nums">{snap.knownWords}</span>
        </div>
        {snap.targets.map((t) => {
          const pct = Math.min(100, (snap.knownWords / t.words) * 100);
          const met = snap.knownWords >= t.words;
          return (
            <div key={t.level} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between text-xs">
                <span className={met ? "text-emerald-400" : "text-neutral-500"}>{t.label}</span>
                <span className="tabular-nums text-neutral-600">
                  {snap.knownWords} / {t.words}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-neutral-800">
                <div
                  className={`h-full rounded-full ${met ? "bg-emerald-500" : "bg-neutral-600"}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
        <p className="text-xs text-neutral-500">
          A word counts once all three of its cards have graduated to review.
        </p>
      </section>

      <section className="rounded-2xl bg-neutral-900/60 p-4">
        <h2 className="mb-1 text-sm font-medium text-neutral-300">Projection</h2>
        {projection.date && nextTarget ? (
          <>
            <Row
              label={`Reaching ${nextTarget.label}`}
              value={projection.date.toLocaleDateString(undefined, {
                month: "short",
                year: "numeric",
              })}
            />
            <Row label="Words remaining" value={projection.remaining.toLocaleString()} />
            <Row label="Learning rate" value={`${projection.perDay.toFixed(1)} words/day`} />
          </>
        ) : (
          <p className="text-xs text-neutral-500">
            Not enough history yet. A projection from a few days of reviews would be noise, so
            there isn&apos;t one until there is a week of data.
          </p>
        )}
      </section>

      <section className="rounded-2xl bg-neutral-900/60 p-4">
        <h2 className="mb-1 text-sm font-medium text-neutral-300">Retention</h2>
        {retention.retention === null ? (
          <p className="text-xs text-neutral-500">No reviews yet.</p>
        ) : (
          <>
            <Row label="Recalled correctly" value={`${(retention.retention * 100).toFixed(1)}%`} />
            <Row label="Reviews total" value={retention.reviews.toLocaleString()} />
            <Row label="Last 7 days" value={retention.lastWeek.toLocaleString()} />
            <Row label="Per active day" value={retention.perActiveDay.toFixed(1)} />
            <p className="mt-2 text-xs text-neutral-500">
              FSRS targets 90%. Much higher means the intervals are too short and you are
              reviewing more than you need to.
            </p>
          </>
        )}
      </section>

      <section className="rounded-2xl bg-neutral-900/60 p-4">
        <h2 className="mb-1 text-sm font-medium text-neutral-300">Sentences</h2>
        <Row label="In review" value={snap.sentencesKnown.toLocaleString()} />
        <Row label="Words still learning" value={snap.learning.toLocaleString()} />
      </section>
    </div>
  );
}
