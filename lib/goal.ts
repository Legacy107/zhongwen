/**
 * The daily goal and streak, read from local history.
 *
 * Shared by the home screen and the session completion screens, so "goal met"
 * means the same thing everywhere. Every kind of practice counts: SRS reviews,
 * plus tone drills and sentences read (lib/activity.ts). The goal size is a
 * synced setting, so it is the same on every device.
 */
import { activityByDay } from './activity';
import { db, putSetting } from './db/local';
import { computeStreak, FREEZE_DAYS, type StreakInfo } from './streak';

export const DAILY_GOAL = 30;
export const GOAL_CHOICES = [10, 20, 30, 50] as const;

const GOAL_KEY = 'dailyGoal';

export async function getDailyGoal(): Promise<number> {
  const value = (await db.settings.get(GOAL_KEY))?.value;
  return typeof value === 'number' && value > 0 ? value : DAILY_GOAL;
}

export async function setDailyGoal(goal: number): Promise<void> {
  await putSetting(GOAL_KEY, goal);
}

export interface GoalProgress extends StreakInfo {
  goal: number;
  met: boolean;
  streak: number;
  /** Freezes still available to the current streak. */
  freezesLeft: number;
  /** One timestamp per practice item, oldest first; drives the streak and the heatmap. */
  timestamps: Date[];
}

/** Activity counts carry no time of day, so each stands in as local noon on its day. */
function noon(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export async function goalProgress(now = new Date()): Promise<GoalProgress> {
  const [keys, goal, activity] = await Promise.all([
    db.reviews.orderBy('reviewedAt').keys() as Promise<unknown[]>,
    getDailyGoal(),
    activityByDay(),
  ]);
  const timestamps = keys.map((k) => new Date(k as string | number | Date));
  for (const [day, n] of activity) {
    const at = noon(day);
    for (let i = 0; i < n; i++) timestamps.push(at);
  }
  timestamps.sort((a, b) => a.getTime() - b.getTime());
  const info = computeStreak(timestamps, goal, now);
  return {
    ...info,
    goal,
    met: info.metToday,
    streak: info.current,
    freezesLeft: Math.max(0, FREEZE_DAYS - info.freezesUsed),
    timestamps,
  };
}
