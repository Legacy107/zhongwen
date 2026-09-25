/**
 * The order new words enter review.
 *
 *   1. Words mined while reading, oldest first. The learner asked for them.
 *   2. Then by HSK level, so HSK 1 is finished before HSK 2 starts.
 *   3. Within a level, by how many reading sentences use the word, so 的 and
 *      是 come before 熊猫. The HSK list itself is alphabetical by pinyin, which
 *      taught 爱, 八, 爸爸, 吧 in that order for no reason but spelling.
 *
 * A word's three card types stay together (Hán-Việt guess first, as the plan
 * intends: predicting the pinyin before seeing it is the point of the card).
 */
import type { Word } from './hanviet';
import type { MinedWord } from './mining';

const LEVEL_RANK: Record<string, number> = { S: 1, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6 };
const TYPE_ORDER: Record<string, number> = { hanviet: 0, recognition: 0.1, typing: 0.2, sentence: 0.3 };

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
    const type = TYPE_ORDER[card.cardType] ?? 0.5;
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
