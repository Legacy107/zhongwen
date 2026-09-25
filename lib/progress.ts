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

export interface CharacterTarget {
  level: string;
  label: string;
  /** Distinct characters across the words of this level and every level below. */
  chars: number;
}

/** Distinct hanzi across a set of words. */
export function charactersOf(words: Iterable<{ chars: string[] }>): Set<string> {
  const out = new Set<string>();
  for (const w of words) for (const c of w.chars) out.add(c);
  return out;
}

/**
 * Character targets from the deck's own vocabulary: the characters a reader
 * needs for the words of each HSK level. Characters and words are different
 * measures in Chinese (知道 is one word, two characters, and 道 reappears in
 * 道理 and 知道 alike), so the two are tracked separately.
 */
export function characterTargets(words: Iterable<{ level: string; chars: string[] }>): CharacterTarget[] {
  const list = [...words];
  const order = ['1', '2', '3', '4', '5', '6'];
  const out: CharacterTarget[] = [];
  const seen = new Set<string>();
  for (const level of order) {
    for (const w of list) {
      const l = w.level === 'S' ? '1' : w.level;
      if (l === level) for (const c of w.chars) seen.add(c);
    }
    out.push({ level, label: `HSK ${level}`, chars: seen.size });
  }
  return out;
}

export interface LevelCount {
  level: string;
  label: string;
  total: number;
  known: number;
}

const LEVEL_ORDER = ['1', '2', '3', '4', '5', '6'];
const levelOf = (level: string) => (level === 'S' ? '1' : level);

/**
 * Words known per HSK level, each level on its own. Cumulative bars ("HSK 6:
 * 4 / 5,456") read as progress in HSK 6 when every known word is from HSK 1.
 */
export function wordsByLevel(
  words: Iterable<{ id: string; level: string }>,
  isKnown: (id: string) => boolean,
): LevelCount[] {
  const out = new Map(LEVEL_ORDER.map((l) => [l, { level: l, label: `HSK ${l}`, total: 0, known: 0 }]));
  for (const w of words) {
    const e = out.get(levelOf(w.level));
    if (!e) continue;
    e.total++;
    if (isKnown(w.id)) e.known++;
  }
  return [...out.values()];
}

/**
 * Characters per HSK level, counting each character at the first level whose
 * vocabulary uses it, against the characters of the words known.
 */
export function charactersByLevel(
  words: Iterable<{ level: string; chars: string[] }>,
  knownChars: Set<string>,
): LevelCount[] {
  const list = [...words];
  const seen = new Set<string>();
  return LEVEL_ORDER.map((level) => {
    const fresh = new Set<string>();
    for (const w of list) {
      if (levelOf(w.level) !== level) continue;
      for (const c of w.chars) if (!seen.has(c)) fresh.add(c);
    }
    for (const c of fresh) seen.add(c);
    let known = 0;
    for (const c of fresh) if (knownChars.has(c)) known++;
    return { level, label: `HSK ${level}`, total: fresh.size, known };
  });
}
