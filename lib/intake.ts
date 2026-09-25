/**
 * The order new words enter review.
 *
 *   1. Words mined while reading, oldest first. The learner asked for them.
 *   2. Then by HSK level, so HSK 1 is finished before HSK 2 starts.
 *   3. Within a level, by how many reading sentences use the word, so 的 and
 *      是 come before 熊猫. The HSK list itself is alphabetical by pinyin, which
 *      taught 爱, 八, 爸爸, 吧 in that order for no reason but spelling.
 *
 * A word's first card depends on what the learner can bring to it. For a
 * cognate, the Hán-Việt guess comes first: predicting the pinyin from a word
 * they already know is the point of the card. Otherwise the recognition card
 * comes first, which introduces the word before any test of it.
 */
import type { FalseFriend, Word } from './hanviet';
import type { MinedWord } from './mining';

const LEVEL_RANK: Record<string, number> = { S: 1, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 };
const COGNATE_FIRST: Record<string, number> = { hanviet: 0, recognition: 0.1, typing: 0.2 };
const MEANING_FIRST: Record<string, number> = { recognition: 0, hanviet: 0.1, typing: 0.2 };

/**
 * Whether the Hán-Việt card can teach anything for this word. Not for a false
 * friend (the reading points at the wrong meaning), not for a word whose every
 * syllable is neutral (的 đích → de: the tone rule has nothing to predict), and
 * not without a reading at all, where the card would only repeat the typing card.
 */
export function hanvietDrillable(word: Word, falseFriends: Map<string, FalseFriend>): boolean {
  return Boolean(word.hanviet) && !falseFriends.has(word.simplified) && word.toneNumbers.some((t) => t !== 5);
}

/** Cards worth putting in a session. Excluded cards stay stored, untouched. */
export function drillable(
  card: { wordId: string; cardType: string },
  words: Map<string, Word>,
  falseFriends: Map<string, FalseFriend>,
): boolean {
  if (card.cardType !== 'hanviet') return true;
  const word = words.get(card.wordId);
  return word ? hanvietDrillable(word, falseFriends) : false;
}

export function newCardRanker(
  words: Map<string, Word>,
  frequency: Record<string, number>,
  mined: Map<string, MinedWord>,
): (card: { wordId: string; cardType: string }) => number {
  const minedOrder = new Map(
    [...mined.values()].sort((a, b) => a.at.localeCompare(b.at)).map((m, i) => [m.wordId, i]),
  );
  const byFrequency = [...words.keys()].sort(
    (a, b) => (frequency[b] ?? 0) - (frequency[a] ?? 0) || a.localeCompare(b),
  );
  const frequencyRank = new Map(byFrequency.map((id, i) => [id, i]));

  return (card) => {
    const word = words.get(card.wordId);
    const order = word && word.cognateMatch !== 'none' ? COGNATE_FIRST : MEANING_FIRST;
    const type = order[card.cardType] ?? 0.5;
    const m = minedOrder.get(card.wordId);
    if (m !== undefined) return m + type;
    const level = LEVEL_RANK[words.get(card.wordId)?.level ?? '6'] ?? 6;
    return 1_000_000 + level * 100_000 + (frequencyRank.get(card.wordId) ?? 99_999) + type;
  };
}

/** The level whose words a learner is currently taking in: the lowest one not yet started through. */
export function frontierLevel(
  words: Map<string, Word>,
  seen: (wordId: string) => boolean,
): string {
  const levels = ['1', '2', '3', '4', '5', '6'];
  for (const level of levels) {
    let total = 0;
    let started = 0;
    for (const w of words.values()) {
      const l = w.level === 'S' ? '1' : w.level;
      if (l !== level) continue;
      total++;
      if (seen(w.id)) started++;
    }
    if (total > 0 && started / total < 0.9) return level;
  }
  return '6';
}

/**
 * New words per day. Every new word becomes a stream of reviews for weeks, so
 * uncapped intake on an enthusiastic day turns into a backlog that makes the
 * next week miserable, the classic way SRS users burn out. The session end
 * screen offers more anyway, as an explicit choice.
 */
export const DAILY_NEW_LIMIT = 20;

/**
 * Words first studied today: words whose earliest review of any card is
 * today. Counted in words, not cards, so learning a word's third card type
 * does not use up a slot meant for a new word.
 */
export async function newWordsToday(now = new Date()): Promise<number> {
  const { db } = await import('./db/local');
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const first = new Map<string, number>();
  await db.reviews.each((r) => {
    if (r.cardId.endsWith(':sentence')) return;
    const word = r.cardId.slice(0, r.cardId.lastIndexOf(':'));
    const t = new Date(r.reviewedAt).getTime();
    const prev = first.get(word);
    if (prev === undefined || t < prev) first.set(word, t);
  });
  let n = 0;
  for (const t of first.values()) if (t >= midnight.getTime()) n++;
  return n;
}

/** Brand-new words the next session may introduce. `extra` is the "learn more anyway" choice. */
export function newWordAllowance(introducedToday: number, extra = false): number {
  return extra ? Infinity : Math.max(0, DAILY_NEW_LIMIT - introducedToday);
}

/** Only the cards that get drilled: the ones word status and "known" should be judged on. */
export function drillableCards<T extends { wordId: string; cardType: string }>(
  cards: T[],
  words: Map<string, Word>,
  falseFriends: Map<string, FalseFriend>,
): T[] {
  return cards.filter((c) => drillable(c, words, falseFriends));
}
