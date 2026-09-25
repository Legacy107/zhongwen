/**
 * Stage 3 reading: Tatoeba sentences segmented against the deck, and the
 * logic that decides which of them the learner can read today.
 *
 * Pure types and functions only, like lib/hanviet.ts and lib/sentences.ts, so
 * the build script, the tests and React components can all import it.
 */
import { State } from './srs';

/**
 * One token as stored in data/reader/L*.json: `[text, pinyin?, ref?]`.
 *
 * Arrays rather than objects because the corpus is precached for offline
 * reading, and key names repeated on every token made it several MB heavier.
 * `ref` is a deck word id, `n:<gloss>` for a proper noun, `p:<gloss>` for a
 * particle outside the deck, or absent for punctuation and digits.
 */
export type ReaderTokenWire = [text: string, pinyin?: string, ref?: string];

export interface ReaderSentenceWire {
  /** `T<tatoeba id>`. The prefix keeps it apart from generated sentence ids. */
  id: string;
  zh: string;
  en: string;
  /** Present only for the few sentences Tatoeba links to Vietnamese directly. */
  vi?: string;
  /** Highest HSK level among the sentence's deck words ("S" counts as 1). */
  lv: string;
  tk: ReaderTokenWire[];
  /** Tatoeba username of the Chinese sentence's author, for CC BY attribution. */
  by: string;
}

export interface ReaderShard {
  level: string;
  sentences: ReaderSentenceWire[];
}

export type FreeKind = 'name' | 'particle';

export interface ReaderToken {
  /** Text as written. Concatenating every token rebuilds the sentence exactly. */
  text: string;
  /** Pinyin read in sentence context. Empty for punctuation and digits. */
  pinyin: string;
  /** Deck word id, when the token is one. */
  wordId?: string;
  /**
   * Proper nouns and a handful of particles outside the deck. Glossed so a tap
   * still explains them, but never counted as unknown and never mined: 汤姆 is
   * "Tom", not vocabulary.
   */
  free?: { kind: FreeKind; gloss: string };
}

export interface ReaderSentence {
  id: string;
  hanzi: string;
  en: string;
  vi?: string;
  level: string;
  tokens: ReaderToken[];
  author: string;
}

export function parseToken([text, pinyin = '', ref]: ReaderTokenWire): ReaderToken {
  const token: ReaderToken = { text, pinyin };
  if (!ref) return token;
  if (ref.startsWith('n:')) token.free = { kind: 'name', gloss: ref.slice(2) };
  else if (ref.startsWith('p:')) token.free = { kind: 'particle', gloss: ref.slice(2) };
  else token.wordId = ref;
  return token;
}

export function encodeToken(token: ReaderToken): ReaderTokenWire {
  if (token.wordId) return [token.text, token.pinyin, token.wordId];
  if (token.free) {
    const prefix = token.free.kind === 'name' ? 'n:' : 'p:';
    return [token.text, token.pinyin, prefix + token.free.gloss];
  }
  return token.pinyin ? [token.text, token.pinyin] : [token.text];
}

export function parseSentence(wire: ReaderSentenceWire): ReaderSentence {
  return {
    id: wire.id,
    hanzi: wire.zh,
    en: wire.en,
    ...(wire.vi ? { vi: wire.vi } : {}),
    level: wire.lv,
    tokens: wire.tk.map(parseToken),
    author: wire.by,
  };
}

export function encodeSentence(s: ReaderSentence): ReaderSentenceWire {
  const wire: ReaderSentenceWire = {
    id: s.id,
    zh: s.hanzi,
    en: s.en,
    lv: s.level,
    tk: s.tokens.map(encodeToken),
    by: s.author,
  };
  if (s.vi) wire.vi = s.vi;
  return wire;
}

export function tatoebaUrl(sentenceId: string): string {
  return `https://tatoeba.org/en/sentences/show/${sentenceId.replace(/^T/, '')}`;
}

/** Deck word ids in the sentence, each once, in reading order. */
export function sentenceWordIds(s: ReaderSentence): string[] {
  const seen = new Set<string>();
  for (const t of s.tokens) if (t.wordId) seen.add(t.wordId);
  return [...seen];
}

/**
 * How far along a word is, from its word cards.
 *
 * - "new":      never reviewed.
 * - "learning": reviewed at least once, but not every card has graduated.
 * - "known":    every card is in Review, the same bar as countKnownWords().
 */
export type WordStatus = 'new' | 'learning' | 'known';

export function wordStatuses(
  cards: Array<{ wordId: string; cardType: string; state: number }>,
): Map<string, WordStatus> {
  const tally = new Map<string, { total: number; seen: number; review: number }>();
  for (const c of cards) {
    if (c.cardType === 'sentence') continue;
    const e = tally.get(c.wordId) ?? { total: 0, seen: 0, review: 0 };
    e.total++;
    if (c.state !== State.New) e.seen++;
    if (c.state === State.Review) e.review++;
    tally.set(c.wordId, e);
  }
  const out = new Map<string, WordStatus>();
  for (const [wordId, e] of tally) {
    out.set(wordId, e.review === e.total ? 'known' : e.seen > 0 ? 'learning' : 'new');
  }
  return out;
}

/**
 * Deck words in the sentence the learner has not started.
 *
 * "Learning" counts as readable. A word reviewed once is recognisable on the
 * page, and requiring full graduation would leave a beginner with nothing to
 * read for the first fortnight.
 */
export function unknownWords(s: ReaderSentence, status: Map<string, WordStatus>): string[] {
  return sentenceWordIds(s).filter((id) => (status.get(id) ?? 'new') === 'new');
}

export interface ReadingPlan {
  /** Every word already studied: fluency practice. */
  easy: ReaderSentence[];
  /** Exactly one unstudied word: comprehensible input with one new item. */
  onePlus: ReaderSentence[];
  /** Two unstudied words. Offered when one-new-word sentences run short. */
  twoPlus: ReaderSentence[];
  /**
   * Unstudied words by how many one-new-word sentences each one blocks, so
   * learning the top word unlocks the most reading.
   */
  unlockers: Array<{ wordId: string; sentences: number }>;
}

/**
 * Sorts sentences by how readable they are right now.
 *
 * Within each band, shorter sentences lead: at a fixed number of unknown
 * words, a short sentence is the easier read and the better first contact.
 */
export function planReading(
  sentences: ReaderSentence[],
  status: Map<string, WordStatus>,
): ReadingPlan {
  const easy: ReaderSentence[] = [];
  const onePlus: ReaderSentence[] = [];
  const twoPlus: ReaderSentence[] = [];
  const blocking = new Map<string, number>();

  for (const s of sentences) {
    const unknown = unknownWords(s, status);
    if (unknown.length === 0) easy.push(s);
    else if (unknown.length === 1) {
      onePlus.push(s);
      blocking.set(unknown[0], (blocking.get(unknown[0]) ?? 0) + 1);
    } else if (unknown.length === 2) twoPlus.push(s);
  }

  const byLength = (a: ReaderSentence, b: ReaderSentence) =>
    [...a.hanzi].length - [...b.hanzi].length;
  easy.sort(byLength);
  onePlus.sort(byLength);
  twoPlus.sort(byLength);

  const unlockers = [...blocking]
    .map(([wordId, n]) => ({ wordId, sentences: n }))
    .sort((a, b) => b.sentences - a.sentences || a.wordId.localeCompare(b.wordId));

  return { easy, onePlus, twoPlus, unlockers };
}

/**
 * A reading session: one-new-word sentences first, a few easy ones mixed in
 * for momentum, and two-new-word sentences only to fill a thin supply.
 *
 * At most two sentences share the same new word, so one frequent word cannot
 * take over the session.
 */
export function drawReadingSession(
  plan: ReadingPlan,
  status: Map<string, WordStatus>,
  size = 8,
  random: () => number = Math.random,
): ReaderSentence[] {
  const picked: ReaderSentence[] = [];
  const perWord = new Map<string, number>();
  const seen = new Set<string>();

  const take = (pool: ReaderSentence[], limit: number) => {
    // Sample from the shortest few hundred so sessions differ day to day
    // without leaping to the longest sentences.
    const window = pool.slice(0, Math.max(limit * 20, 200));
    const order = window.map((s) => ({ s, r: random() })).sort((a, b) => a.r - b.r);
    let n = 0;
    for (const { s } of order) {
      if (n >= limit || picked.length >= size) break;
      if (seen.has(s.id)) continue;
      const unknown = unknownWords(s, status);
      if (unknown.some((w) => (perWord.get(w) ?? 0) >= 2)) continue;
      for (const w of unknown) perWord.set(w, (perWord.get(w) ?? 0) + 1);
      seen.add(s.id);
      picked.push(s);
      n++;
    }
  };

  const easyShare = Math.max(1, Math.round(size / 4));
  take(plan.onePlus, size - easyShare);
  take(plan.easy, size - picked.length);
  take(plan.twoPlus, size - picked.length);
  take(plan.onePlus, size - picked.length);

  // Spread the easy sentences through the new material instead of leaving
  // them clustered at the end.
  const fresh = picked.filter((s) => unknownWords(s, status).length > 0);
  const easyPicked = picked.filter((s) => unknownWords(s, status).length === 0);
  const every = Math.max(1, Math.ceil(fresh.length / (easyPicked.length + 1)));
  const out: ReaderSentence[] = [];
  fresh.forEach((s, i) => {
    out.push(s);
    if ((i + 1) % every === 0 && easyPicked.length > 0) out.push(easyPicked.shift()!);
  });
  return [...out, ...easyPicked];
}
