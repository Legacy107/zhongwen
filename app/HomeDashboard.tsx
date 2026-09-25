"use client";

import confetti from "canvas-confetti";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { db, exportBackup, importBackup } from "@/lib/db/local";
import { buildQueue, State } from "@/lib/srs";
import { playFanfare, unlockAudio } from "@/lib/sfx";
import { computeStreak, type StreakInfo } from "@/lib/streak";
import { onSyncComplete } from "@/lib/sync";
import { SyncStatus } from "@/components/SyncStatus";

interface Stats {
  /** Cards this session will actually contain, not every unstarted card. */
  session: number;
  /** Sentence cards ready in a build session. */
  sentenceSession: number;
  /** Cards never reviewed — the supply of genuinely new material. */
  fresh: number;
  learning: number;
  known: number;
  reviewedToday: number;
  streak: StreakInfo;
}

const DAILY_GOAL = 30;

async function readStats(): Promise<Stats> {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);

  // Streaks need the full review history, not just today's slice.
  const [allCards, reviewTimes] = await Promise.all([
    db.cards.toArray(),
    db.reviews.orderBy("reviewedAt").keys() as Promise<unknown[]>,
  ]);
  // Vocabulary counts exclude sentence cards; those get their own tile.
  const cards = allCards.filter((c) => c.cardType !== "sentence");
  const sentenceCards = allCards.filter((c) => c.cardType === "sentence");
  const timestamps = reviewTimes.map((k) => new Date(k as string | number | Date));
  const reviewedToday = timestamps.filter((t) => t >= midnight).length;
  const streak = computeStreak(timestamps, DAILY_GOAL, now);

  let fresh = 0;
  let learning = 0;
  let known = 0;
  for (const c of cards) {
    // Mirrors sortForReview()'s filter, so these counts can't drift from the queue.
    if (c.suspended) continue;
    if (c.state === State.New) fresh++;
    else if (c.state === State.Review) known++;
    else learning++;
  }
  return {
    session: buildQueue(cards).length,
    sentenceSession: buildQueue(sentenceCards, now, { sessionSize: 12, newPerSession: 6 }).length,
    fresh,
    learning,
    known,
    reviewedToday,
    streak,
  };
}

function Stat({ value, label }: { value: number | undefined; label: string }) {
  return (
    <div className="flex flex-col items-center rounded-xl bg-neutral-900 px-3 py-3">
      <span className="text-xl font-semibold tabular-nums">
        {(value ?? 0).toLocaleString()}
      </span>
      <span className="text-[11px] text-neutral-500">{label}</span>
    </div>
  );
}

export function HomeDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setStats(await readStats());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read progress");
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const s = await readStats();
        if (!cancelled) setStats(s);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Could not read progress");
      }
    };
    void load();
    // Counts go stale when a review session finishes in another tab, or when
    // sync pulls a grade made on the other device.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    // Focus alone reads too early: its sync lands a moment after.
    const offSync = onSyncComplete(({ pulled }) => {
      if (pulled.cards + pulled.reviews + pulled.settings > 0) void load();
    });
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      offSync();
    };
  }, []);

  const onExport = useCallback(async () => {
    setBusy("export");
    try {
      const blob = await exportBackup();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hanviet-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setBusy(null);
    }
  }, []);

  const onImport = useCallback(
    async (file: File) => {
      setBusy("import");
      try {
        const { cards, reviews } = await importBackup(file);
        setError(null);
        await refresh();
        setBusy(null);
        alertless(`Restored ${cards} cards and ${reviews} reviews.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Import failed");
        setBusy(null);
      }
    },
    [refresh],
  );

  const goalPct = stats ? Math.min(100, Math.round((stats.reviewedToday / DAILY_GOAL) * 100)) : 0;

  // Fire once when the goal flips to met, and only once per calendar day -
  // otherwise every focus event would re-celebrate.
  const metToday = stats?.streak.metToday ?? false;
  useEffect(() => {
    if (!metToday) return;
    const key = `goalCelebrated:${new Date().toDateString()}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, "1");
    } catch {
      return; // Private mode: skip rather than celebrate on every render.
    }
    void confetti({ particleCount: 90, spread: 70, origin: { y: 0.3 }, disableForReducedMotion: true });
    playFanfare();
  }, [metToday]);

  return (
    <div className="flex w-full max-w-md flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">汉越 · HánViệt</h1>
        <p className="text-sm text-neutral-400">Mandarin through Sino-Vietnamese.</p>
      </header>

      {error && <p className="text-sm text-rose-400">{error}</p>}

      <section className="flex flex-col gap-2 rounded-2xl bg-neutral-900/60 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm text-neutral-400">Today</span>
          <span className="text-sm tabular-nums text-neutral-400">
            {stats?.reviewedToday ?? 0} / {DAILY_GOAL}
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
          <div
            className="h-full rounded-full bg-emerald-500 transition-[width] duration-500"
            style={{ width: `${goalPct}%` }}
          />
        </div>
        {stats && (stats.streak.current > 0 || stats.streak.longest > 0) && (
          <div className="flex items-baseline justify-between pt-1 text-xs text-neutral-500">
            <span>
              {stats.streak.current > 0
                ? `${stats.streak.current}-day streak`
                : "Streak broken - start again today"}
            </span>
            {stats.streak.longest > stats.streak.current && (
              <span>best {stats.streak.longest}</span>
            )}
          </div>
        )}
      </section>

      <Link
        href="/review"
        onClick={unlockAudio}
        className="flex items-center justify-between rounded-2xl bg-emerald-600 px-5 py-4 font-medium text-white active:bg-emerald-700"
      >
        <span>{stats && stats.session > 0 ? "Start reviewing" : "Review"}</span>
        <span className="tabular-nums">
          {stats ? `${(stats.session ?? 0).toLocaleString()} ready` : "…"}
        </span>
      </Link>

      <Link
        href="/build"
        onClick={unlockAudio}
        className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-900/60 px-5 py-4 active:bg-neutral-800"
      >
        <span className="font-medium">Build sentences</span>
        <span className="text-xs tabular-nums text-neutral-500">
          {stats ? `${stats.sentenceSession} ready` : "word order"}
        </span>
      </Link>

      <Link
        href="/tones"
        onClick={unlockAudio}
        className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-900/60 px-5 py-4 active:bg-neutral-800"
      >
        <span className="font-medium">Tone training</span>
        <span className="text-xs text-neutral-500">T1 vs T4, sandhi</span>
      </Link>

      <section className="grid grid-cols-3 gap-2">
        <Stat value={stats?.known} label="in review" />
        <Stat value={stats?.learning} label="learning" />
        <Stat value={stats?.fresh} label="left to learn" />
      </section>

      <Link
        href="/progress"
        className="flex items-center justify-between rounded-2xl border border-neutral-800 bg-neutral-900/60 px-5 py-4 active:bg-neutral-800"
      >
        <span className="font-medium">Progress</span>
        <span className="text-xs text-neutral-500">vs HSK targets</span>
      </Link>

      <section className="flex flex-col gap-2 rounded-2xl bg-neutral-900/60 p-4">
        <h2 className="text-sm font-medium text-neutral-300">Sync &amp; backup</h2>
        <SyncStatus />
        <p className="text-xs text-neutral-500">
          Progress syncs between your devices. An export is a second copy you hold yourself.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onExport}
            disabled={busy !== null}
            className="flex-1 rounded-xl bg-neutral-800 px-3 py-2 text-sm active:bg-neutral-700 disabled:opacity-50"
          >
            {busy === "export" ? "Exporting…" : "Export"}
          </button>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            disabled={busy !== null}
            className="flex-1 rounded-xl bg-neutral-800 px-3 py-2 text-sm active:bg-neutral-700 disabled:opacity-50"
          >
            {busy === "import" ? "Restoring…" : "Restore"}
          </button>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="application/json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }}
        />
      </section>
    </div>
  );
}

/** Status line instead of window.alert: a modal dialog would block the PWA. */
function alertless(message: string) {
  const el = document.createElement("div");
  el.textContent = message;
  el.className =
    "fixed inset-x-4 bottom-6 z-50 rounded-xl bg-neutral-800 px-4 py-3 text-center text-sm text-neutral-100 shadow-lg";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
