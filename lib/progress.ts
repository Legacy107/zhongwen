/**
 * Progress against a real referent, and honest retention figures.
 *
 * The plan is explicit that this should be information rather than a Skinner
 * box: characters known against HSK targets, a projection derived from the
 * actual review rate, and measured retention rather than a badge.
 */
import { State } from './srs';

export interface LevelTarget {
  level: string;
  label: string;
  words: number;
}

/** Cumulative HSK 3.0 word counts, from the deck's own level sizes. */
export function levelTargets(wordsByLevel: Record<string, number>): LevelTarget[] {
  const order = ['1', '2', '3', '4', '5', '6'];
  const out: LevelTarget[] = [];
  let cumulative = 0;
  for (const level of order) {
    cumulative += wordsByLevel[level] ?? 0;
    out.push({ level, label: `HSK ${level}`, words: cumulative });
  }
  return out;
}

export interface RetentionStats {
  /** Reviews graded better than Again, over all reviews. */
  retention: number | null;
  reviews: number;
  /** Reviews in the last 7 local days. */
  lastWeek: number;
  /** Mean reviews per active day; the basis for any projection. */
  perActiveDay: number;
}

export function computeRetention(
  reviews: Array<{ rating: number; reviewedAt: Date }>,
  now = new Date(),
): RetentionStats {
  if (reviews.length === 0) {
    return { retention: null, reviews: 0, lastWeek: 0, perActiveDay: 0 };
  }
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  let passed = 0;
  let lastWeek = 0;
  const days = new Set<string>();
  for (const r of reviews) {
    if (r.rating > 1) passed++; // Rating.Again === 1
    if (r.reviewedAt >= weekAgo) lastWeek++;
    days.add(r.reviewedAt.toDateString());
  }
  return {
    retention: passed / reviews.length,
    reviews: reviews.length,
    lastWeek,
    perActiveDay: reviews.length / Math.max(1, days.size),
  };
}

export interface Projection {
  /** Words still to reach the target. */
  remaining: number;
  /** Words moving into Review state per day, measured. */
  perDay: number;
  /** Null when there is not enough history to say anything honest. */
  date: Date | null;
}

/**
 * Projects when a target will be reached, from the measured learning rate.
 *
 * Returns a null date rather than a guess when history is too thin: a
 * projection from two days of data is noise, and presenting it as a date would
 * be worse than presenting nothing.
 */
export function projectTarget(
  knownWords: number,
  targetWords: number,
  firstReview: Date | null,
  now = new Date(),
): Projection {
  const remaining = Math.max(0, targetWords - knownWords);
  if (!firstReview || knownWords === 0) {
    return { remaining, perDay: 0, date: null };
  }
  const days = Math.max(1, (now.getTime() - firstReview.getTime()) / 86_400_000);
  // Under a week of history cannot support a date; say so instead of inventing one.
  if (days < 7) return { remaining, perDay: knownWords / days, date: null };

  const perDay = knownWords / days;
  if (perDay <= 0) return { remaining, perDay: 0, date: null };
  const date = new Date(now.getTime() + (remaining / perDay) * 86_400_000);
  return { remaining, perDay, date };
}

/** Words whose cards have all reached Review state. */
export function countKnownWords(
  cards: Array<{ wordId: string; cardType: string; state: number }>,
): number {
  const byWord = new Map<string, { total: number; review: number }>();
  for (const c of cards) {
    if (c.cardType === 'sentence') continue;
    const e = byWord.get(c.wordId) ?? { total: 0, review: 0 };
    e.total++;
    if (c.state === State.Review) e.review++;
    byWord.set(c.wordId, e);
  }
  let known = 0;
  for (const { total, review } of byWord.values()) {
    if (total > 0 && review === total) known++;
  }
  return known;
}
