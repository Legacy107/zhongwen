/**
 * Everything the reader needs, loaded together: the deck, the learner's word
 * statuses, what they have mined, and the corpus levels worth reading.
 */
import { loadFalseFriends, loadReaderShards, loadWords, READER_LEVELS } from './data';
import { db } from './db/local';
import type { FalseFriend, Word } from './hanviet';
import { frontierLevel } from './intake';
import { loadMinedWords } from './mining';
import { wordStatuses, type ReaderSentence, type WordStatus } from './reader';

export interface ReadingLibrary {
  words: Map<string, Word>;
  falseFriends: Map<string, FalseFriend>;
  status: Map<string, WordStatus>;
  sentences: ReaderSentence[];
  levels: string[];
  mined: Set<string>;
}

/**
 * Levels loaded: everything up to the one being learned, plus the next, whose
 * one-new-word sentences are exactly the stretch reading should offer.
 */
export async function loadReadingLibrary(): Promise<ReadingLibrary> {
  const [words, falseFriends, cards, mined] = await Promise.all([
    loadWords(),
    loadFalseFriends(),
    db.cards.toArray(),
    loadMinedWords(),
  ]);
  const status = wordStatuses(cards);
  const frontier = frontierLevel(words, (id) => (status.get(id) ?? 'new') !== 'new');
  const top = Math.min(READER_LEVELS.length, Number(frontier) + 1);
  const levels = READER_LEVELS.slice(0, top);
  const sentences = await loadReaderShards(levels);
  return { words, falseFriends, status, sentences, levels, mined: new Set(mined.keys()) };
}
