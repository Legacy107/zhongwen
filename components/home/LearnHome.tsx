"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Mascot } from "@/components/ui/Mascot";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { loadFalseFriends, loadWordFrequency, loadWords } from "@/lib/data";
import { db } from "@/lib/db/local";
import { goalProgress, type GoalProgress } from "@/lib/goal";
import type { Word } from "@/lib/hanviet";
import { drillable, frontierLevel, newAllowance, newCardRanker, newIntroducedToday } from "@/lib/intake";
import { loadMinedWords } from "@/lib/mining";
import { buildPath, pathWindow, type LevelPath, type PathUnit } from "@/lib/path";
import { planReading, wordStatuses } from "@/lib/reader";
import { loadReadingLibrary } from "@/lib/readingLibrary";
import { buildQueue, NEW_PER_SESSION } from "@/lib/srs";
import { countByDay, dayKey } from "@/lib/streak";
import { onSyncComplete } from "@/lib/sync";
import { unlockAudio } from "@/lib/sound";
import { SyncBadge } from "./SyncBadge";

interface HomeData {
  goal: GoalProgress;
  reviewReady: number;
  buildReady: number | null;
  firstRun: boolean;
  words: Map<string, Word>;
  path: LevelPath;
}

async function readHome(): Promise<HomeData> {
  const [words, falseFriends, frequency, mined, cards, goal, introduced] = await Promise.all([
    loadWords(),
    loadFalseFriends(),
    loadWordFrequency(),
    loadMinedWords(),
    db.cards.toArray(),
    goalProgress(),
    newIntroducedToday(),
  ]);
  // The same filter and caps the review session applies, so the number on
  // the button is the number of cards the session will hold.
  const wordCards = cards.filter((c) => c.cardType !== "sentence" && drillable(c, words, falseFriends));
  const sentenceCards = cards.filter((c) => c.cardType === "sentence");
  const status = wordStatuses(cards);
  const level = frontierLevel(words, (id) => (status.get(id) ?? "new") !== "new");
  return {
    goal,
    // Before the first session no cards exist yet; the first one takes in
    // a full intake of new words.
    reviewReady: wordCards.length
      ? buildQueue(wordCards, new Date(), {
          rankNew: newCardRanker(words, frequency, mined),
          newPerSession: newAllowance(introduced, NEW_PER_SESSION),
        }).length
      : NEW_PER_SESSION,
    buildReady: sentenceCards.length
      ? buildQueue(sentenceCards, new Date(), { sessionSize: 12, newPerSession: 6 }).length
      : null,
    firstRun: goal.timestamps.length === 0,
    words,
    path: buildPath(words, frequency, status, level),
  };
}

function greeting(now = new Date()): { vi: string; zh: string; pinyin: string } {
  const h = now.getHours();
  if (h < 11) return { vi: "Chào buổi sáng", zh: "早上好", pinyin: "zǎoshang hǎo" };
  if (h < 13) return { vi: "Chào buổi trưa", zh: "中午好", pinyin: "zhōngwǔ hǎo" };
  if (h < 18) return { vi: "Chào buổi chiều", zh: "下午好", pinyin: "xiàwǔ hǎo" };
  return { vi: "Chào buổi tối", zh: "晚上好", pinyin: "wǎnshang hǎo" };
}

function GoalRing({ value, size = 34 }: { value: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-3)" strokeWidth={5} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="var(--gold)"
        strokeWidth={5}
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        animate={{ strokeDashoffset: c * (1 - Math.min(1, value)) }}
        transition={{ type: "spring", stiffness: 80, damping: 18 }}
      />
    </svg>
  );
}

function PracticeTile({
  href,
  icon,
  title,
  detail,
  color,
}: {
  href: string;
  icon: IconName;
  title: string;
  detail: string;
  color: "purple" | "blue" | "orange";
}) {
  const tone = {
    purple: "bg-purple text-white shadow-[0_4px_0_var(--purple-lip)]",
    blue: "bg-blue text-white shadow-[0_4px_0_var(--blue-lip)]",
    orange: "bg-orange text-white shadow-[0_4px_0_var(--orange-lip)]",
  }[color];
  return (
    <Link
      href={href}
      onClick={unlockAudio}
      className="card card-raised flex flex-col items-center gap-2 px-2 py-4 text-center transition-transform active:translate-y-1 active:shadow-none"
    >
      <span className={`grid size-12 place-items-center rounded-2xl ${tone}`}>
        <Icon name={icon} size={26} strokeWidth={2.75} />
      </span>
      <span className="font-extrabold leading-tight text-ink">{title}</span>
      <span className="text-xs font-bold text-ink-3">{detail}</span>
    </Link>
  );
}

/** The last seven days, today last: a filled flame where the goal was met. */
function WeekStrip({ goal }: { goal: GoalProgress }) {
  const perDay = countByDay(goal.timestamps);
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d;
  });
  return (
    <div className="flex items-center justify-between gap-1">
      {days.map((d, i) => {
        const met = (perDay.get(dayKey(d)) ?? 0) >= goal.goal;
        const today = i === 6;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <span className={`text-xs font-extrabold ${today ? "text-orange-ink" : "text-ink-3"}`}>
              {d.toLocaleDateString(undefined, { weekday: "narrow" })}
            </span>
            <span
              className={`grid size-8 place-items-center rounded-full ${
                met ? "bg-orange text-white" : today ? "border-2 border-dashed border-orange/60 text-orange" : "bg-surface-3 text-ink-3"
              }`}
            >
              <Icon name="flame" size={18} />
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <div className="h-44 animate-pulse rounded-[1.25rem] bg-surface-2" />
      <div className="grid grid-cols-3 gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse rounded-[1.25rem] bg-surface-2" />
        ))}
      </div>
    </div>
  );
}

const NODE_SPACING = 104;

function PathNode({ unit, offset, words }: { unit: PathUnit; offset: number; words: Map<string, Word> }) {
  const current = unit.state === "current";
  const done = unit.state === "done";
  const preview = unit.wordIds
    .slice(0, 3)
    .map((id) => words.get(id)?.simplified)
    .join(" · ");
  const face = done
    ? "bg-gold text-white shadow-[0_6px_0_var(--gold-lip)]"
    : current
      ? "bg-green text-white shadow-[0_6px_0_var(--green-lip)]"
      : "bg-surface-3 text-ink-3 shadow-[0_6px_0_var(--line-strong)]";
  const pct = unit.started / unit.wordIds.length;
  const R = 44;
  const C = 2 * Math.PI * R;

  const node = (
    <span className="relative grid size-[104px] place-items-center">
      {current && (
        <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90" aria-hidden>
          <circle cx={50} cy={50} r={R} fill="none" stroke="var(--surface-3)" strokeWidth={7} />
          <circle
            cx={50}
            cy={50}
            r={R}
            fill="none"
            stroke="var(--green)"
            strokeWidth={7}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - pct)}
          />
        </svg>
      )}
      <span className={`grid size-[70px] place-items-center rounded-full ${face} transition-transform active:translate-y-1.5 active:shadow-none`}>
        <Icon name={done ? "check" : current ? "star" : "lock"} size={34} strokeWidth={done ? 4 : 2.5} />
      </span>
    </span>
  );

  return (
    <div className="relative flex flex-col items-center" style={{ transform: `translateX(${offset}px)`, height: NODE_SPACING }}>
      {current && (
        <motion.div
          className="absolute -top-12 z-10 flex flex-col items-center"
          animate={{ y: [0, -5, 0] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
        >
          <span className="whitespace-nowrap rounded-xl border-2 border-line bg-surface px-3 py-1.5 text-sm font-extrabold uppercase tracking-wider text-green-ink">
            Start
          </span>
          <span className="-mt-[7px] size-3 rotate-45 border-b-2 border-r-2 border-line bg-surface" />
        </motion.div>
      )}
      {unit.state === "locked" ? (
        <span aria-label={`Unit ${unit.index + 1}, locked`}>{node}</span>
      ) : (
        <Link
          href="/review"
          onClick={unlockAudio}
          aria-label={`Unit ${unit.index + 1}: ${preview}${done ? ", studied" : ""}`}
        >
          {node}
        </Link>
      )}
    </div>
  );
}

export function LearnHome() {
  const [data, setData] = useState<HomeData | null>(null);
  const [reading, setReading] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      readHome()
        .then((d) => !cancelled && setData(d))
        .catch((e) => !cancelled && setError(e instanceof Error ? e.message : "Could not read progress"));
    void load();
    loadReadingLibrary()
      .then((l) => {
        if (cancelled) return;
        const plan = planReading(l.sentences, l.status);
        setReading(plan.onePlus.length + plan.easy.length);
      })
      .catch(() => {});
    // Counts go stale when a session finishes in another tab, or when sync
    // pulls a grade made on the other device.
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    const offSync = onSyncComplete(({ pulled }) => {
      if (pulled.cards + pulled.reviews + pulled.settings > 0) void load();
    });
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
      offSync();
    };
  }, []);

  const hello = greeting();

  if (error) return <p className="p-6 text-center font-bold text-red-ink">{error}</p>;

  const goal = data?.goal;
  const pct = goal ? goal.today / goal.goal : 0;
  const left = goal ? Math.max(0, goal.goal - goal.today) : 0;
  const unit = data?.path.units[data.path.current];

  return (
    <div className="flex flex-col pb-28">
      {/* top bar */}
      <header className="sticky top-0 z-30 border-b-2 border-line bg-bg/95 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur">
        <div className="mx-auto flex w-full max-w-xl items-center justify-between gap-3 px-4 pb-2">
          <span className="rounded-xl border-2 border-line px-3 py-1 text-sm font-extrabold text-ink-2">
            HSK {data?.path.level ?? "1"}
          </span>
          <div className="flex items-center gap-4">
            <span
              className={`flex items-center gap-1 text-lg font-extrabold ${
                goal && goal.streak > 0 ? "text-orange" : "text-ink-3"
              }`}
              aria-label={`${goal?.streak ?? 0}-day streak`}
            >
              <Icon name="flame" size={26} />
              {goal?.streak ?? 0}
            </span>
            <span className="flex items-center gap-1.5 text-sm font-extrabold text-gold-ink" aria-label="Daily goal">
              <GoalRing value={pct} />
              {goal ? `${Math.min(goal.today, goal.goal)}/${goal.goal}` : "–"}
            </span>
            <SyncBadge />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-xl flex-col gap-6 px-4 pt-5">
        {/* greeting */}
        <div className="flex items-center gap-3">
          <Mascot mood="happy" size={72} className="shrink-0" />
          <div className="min-w-0">
            <p className="text-2xl font-extrabold leading-tight text-ink">{hello.vi}!</p>
            <p className="text-ink-2">
              <span lang="zh-Hans">{hello.zh}</span> <span className="text-sm">{hello.pinyin}</span>
            </p>
          </div>
        </div>

        {/* today */}
        {!data ? (
          <Skeleton />
        ) : data.firstRun ? (
          <section className="card card-raised flex flex-col gap-4 p-5">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-wider text-green-ink">Welcome</p>
              <h1 className="mt-1 text-2xl font-extrabold text-ink">Mandarin through the Vietnamese you know</h1>
              <p className="mt-1 text-ink-2">
                Nearly half of common Chinese words have a Hán-Việt cousin: 学生 is học sinh, 安全 is an toàn. Your first{" "}
                {NEW_PER_SESSION} words are ready.
              </p>
            </div>
            <Link href="/review" onClick={unlockAudio} className="btn btn-primary btn-block">
              Start learning
            </Link>
          </section>
        ) : (
          <section className="card card-raised flex flex-col gap-4 p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h2 className="text-xl font-extrabold text-ink">Daily goal</h2>
              <span className="text-sm font-extrabold text-ink-3">
                {goal?.met ? "Done for today!" : `${left} to go`}
              </span>
            </div>
            <ProgressBar value={pct} color={goal?.met ? "bg-gold" : "bg-green"} label="Daily goal" />
            {goal && <WeekStrip goal={goal} />}
            <p className="-mt-1 text-xs font-bold text-ink-3">
              {goal?.goal} a day · reviews, tones and reading all count
              {goal && goal.streak > 0 && goal.freezesLeft > 0 ? " · a missed day won't break your streak" : ""}
            </p>
            <Link href="/review" onClick={unlockAudio} className="btn btn-primary btn-block">
              {data.reviewReady > 0 ? `Start review · ${data.reviewReady}` : "Review"}
            </Link>
          </section>
        )}

        {/* practice */}
        <section className="grid grid-cols-3 gap-3">
          <PracticeTile
            href="/build"
            icon="blocks"
            title="Build"
            detail={data?.buildReady == null ? "sentences" : `${data.buildReady} ready`}
            color="purple"
          />
          <PracticeTile
            href="/read"
            icon="book"
            title="Read"
            detail={reading == null ? "stories" : `${reading.toLocaleString()} ready`}
            color="blue"
          />
          <PracticeTile href="/tones" icon="wave" title="Tones" detail="ear training" color="orange" />
        </section>

        {/* path */}
        {data && unit && (
          <section className="flex flex-col gap-4">
            <div className="rounded-2xl bg-primary px-5 py-4 text-white shadow-[0_4px_0_var(--primary-lip)]">
              <p className="text-xs font-extrabold uppercase tracking-wider text-white/80">
                HSK {data.path.level} · Unit {unit.index + 1} of {data.path.units.length}
              </p>
              <p lang="zh-Hans" className="mt-1 text-2xl font-bold">
                {unit.wordIds
                  .slice(0, 5)
                  .map((id) => data.words.get(id)?.simplified)
                  .join(" ")}
                …
              </p>
              <p className="text-sm font-semibold text-white/85">
                {unit.started} of {unit.wordIds.length} words started
              </p>
            </div>
            <div className="flex flex-col items-center pt-12">
              {pathWindow(data.path).map((u) => (
                <PathNode key={u.index} unit={u} offset={Math.round(Math.sin((u.index + 1) * 1.15) * 70)} words={data.words} />
              ))}
              <MoreUnits path={data.path} />
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function MoreUnits({ path }: { path: LevelPath }) {
  const remaining = path.units.length - path.current - 5;
  if (remaining <= 0) return null;
  return <p className="text-sm font-bold text-ink-3">+{remaining} more units in HSK {path.level}</p>;
}
