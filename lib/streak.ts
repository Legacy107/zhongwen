/**
 * Daily goal and streak.
 *
 * The streak is *derived* from review timestamps, never stored as a counter.
 * A stored counter drifts the moment two devices sync out of order, or a review
 * arrives late; recomputing from the append-only review log is idempotent and
 * self-heals. It costs one pass over the review dates, which is trivial.
 *
 * Streaks are deliberately forgiving (see `FREEZE_DAYS`): the plan calls for
 * motivation without the punitive reset that makes people quit after one bad
 * week. Missing a single day does not zero the streak.
 */

/** Days that may be missed inside a streak without breaking it. */
export const FREEZE_DAYS = 1;

export interface StreakInfo {
  /** Consecutive qualifying days up to today (or yesterday, if today is unmet). */
  current: number;
  longest: number;
  /** True when today's goal is already met. */
  metToday: boolean;
  /** Reviews completed today. */
  today: number;
  /** Freezes spent inside the current streak. */
  freezesUsed: number;
}

/** Local calendar day key. Uses local time: a streak is about the user's day. */
export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(key: string, delta: number): string {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d + delta);
  return dayKey(dt);
}

/**
 * Counts reviews per local day.
 *
 * Takes timestamps rather than review rows so it stays a pure function and can
 * be tested without a database.
 */
export function countByDay(timestamps: Date[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const t of timestamps) {
    const k = dayKey(t);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return counts;
}

/**
 * Walks backwards from today counting days that met `goal`.
 *
 * Today not being met does not break the streak — the day is still in progress,
 * so the count simply starts from yesterday.
 */
export function computeStreak(
  timestamps: Date[],
  goal: number,
  now = new Date(),
): StreakInfo {
  const counts = countByDay(timestamps);
  const todayKey = dayKey(now);
  const today = counts.get(todayKey) ?? 0;
  const metToday = today >= goal;

  const met = (k: string) => (counts.get(k) ?? 0) >= goal;

  let current = 0;
  let freezesUsed = 0;
  let cursor = metToday ? todayKey : addDays(todayKey, -1);
  while (true) {
    if (met(cursor)) {
      current++;
      cursor = addDays(cursor, -1);
      continue;
    }
    // An unmet day may be absorbed, but only if a met day precedes it -
    // otherwise a freeze would extend a streak that already ended.
    if (freezesUsed < FREEZE_DAYS && met(addDays(cursor, -1))) {
      freezesUsed++;
      cursor = addDays(cursor, -1);
      continue;
    }
    break;
  }

  // Longest run over all recorded days, allowing the same freeze budget.
  let longest = 0;
  const keys = [...counts.keys()].filter((k) => met(k)).sort();
  if (keys.length) {
    let run = 1;
    longest = 1;
    for (let i = 1; i < keys.length; i++) {
      const gap = Math.round(
        (new Date(keys[i]).getTime() - new Date(keys[i - 1]).getTime()) / 86_400_000,
      );
      run = gap <= FREEZE_DAYS + 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
    }
  }

  return { current, longest, metToday, today, freezesUsed };
}
