/**
 * The daily goal and streak, read from local history.
 *
 * Shared by the home screen and the session completion screens, so "goal met"
 * means the same thing everywhere. The goal is counted in lessons finished: a
 * goal counted in reviews taught cramming new words just to reach it. Days
 * before the switch keep the old measure (reviews, tone drills and sentences
 * read against the old goal), so the streak built under it carries over.
 *
 * Goal, lesson length and the switch day are synced settings, so they are the
 * same on every device.
 */
import { activityByDay } from './activity';
import { db, putSetting } from './db/local';
import type { LessonLength } from './lesson';
import { computeStreak, countByDay, dayKey, FREEZE_DAYS, type StreakInfo } from './streak';

/** The review-count goal days before the switch were judged against. */
const OLD_GOAL = 30;
const OLD_GOAL_KEY = 'dailyGoal';

export const LESSON_GOAL = 1;
export const GOAL_CHOICES = [1, 2, 3, 5] as const;
const GOAL_KEY = 'lessonGoal';
const SINCE_KEY = 'lessonGoalSince';
const LENGTH_KEY = 'lessonLength';

async function setting(key: string): Promise<unknown> {
  return (await db.settings.get(key))?.value;
}

export async function getDailyGoal(): Promise<number> {
  const value = await setting(GOAL_KEY);
  return typeof value === 'number' && value > 0 ? value : LESSON_GOAL;
}

export async function setDailyGoal(goal: number): Promise<void> {
  await putSetting(GOAL_KEY, goal);
}

export async function getLessonLength(): Promise<LessonLength> {
  const value = await setting(LENGTH_KEY);
  return value === 'short' || value === 'long' ? value : 'normal';
}

export async function setLessonLength(length: LessonLength): Promise<void> {
  await putSetting(LENGTH_KEY, length);
}

/** The first day counted in lessons, recorded the first time it is asked for. */
async function lessonGoalSince(now: Date): Promise<string> {
  const value = await setting(SINCE_KEY);
  if (typeof value === 'string') return value;
  const today = dayKey(now);
  await putSetting(SINCE_KEY, today);
  return today;
}

export interface GoalProgress extends StreakInfo {
  goal: number;
  met: boolean;
  streak: number;
  /** Freezes still available to the current streak. */
  freezesLeft: number;
  /** One timestamp per lesson, oldest first; drives the streak and the week strip. */
  timestamps: Date[];
}

/** Activity counts carry no time of day, so each stands in as local noon on its day. */
function noon(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, 12);
}

export async function goalProgress(now = new Date()): Promise<GoalProgress> {
  const [keys, oldGoal, practice, lessons, goal, since] = await Promise.all([
    db.reviews.orderBy('reviewedAt').keys() as Promise<unknown[]>,
    setting(OLD_GOAL_KEY),
    activityByDay(),
    activityByDay(['lesson']),
    getDailyGoal(),
    lessonGoalSince(now),
  ]);

  // Before the switch: a day met under the old goal counts as a full day now.
  const old = countByDay(keys.map((k) => new Date(k as string | number | Date)));
  for (const [day, n] of practice) old.set(day, (old.get(day) ?? 0) + n);
  const oldTarget = typeof oldGoal === 'number' && oldGoal > 0 ? oldGoal : OLD_GOAL;
  const timestamps: Date[] = [];
  for (const [day, n] of old) {
    if (day < since && n >= oldTarget) for (let i = 0; i < goal; i++) timestamps.push(noon(day));
  }
  for (const [day, n] of lessons) {
    if (day >= since) for (let i = 0; i < n; i++) timestamps.push(noon(day));
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
