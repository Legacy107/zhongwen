/**
 * Sentence-construction types for Stage 2.5.
 *
 * Pure types and pure helpers only — no I/O, no filesystem, no fetch, so this
 * is safe to import from the generator, the validator, and React components
 * alike (same rule as lib/hanviet.ts).
 */

/**
 * One tile in the word-tile ordering exercise.
 *
 * Tile boundaries are real words, not arbitrary character splits: a learner
 * who drags 喜欢 as one tile is practising a word, whereas dragging 喜 then 欢
 * is practising nothing at all.
 */
export interface SentenceTile {
  /** The hanzi for this tile. Concatenating every `text` rebuilds the sentence. */
  text: string;
  /** Diacritic pinyin for this tile alone, e.g. "xǐhuān". */
  pinyin: string;
  /** `words.json` id when this tile is a deck word, null for particles etc. */
  wordId: string | null;
}

/**
 * A modifier+noun phrase where Vietnamese and Chinese put the modifier on
 * opposite sides of the head noun.
 *
 * Present only when the sentence actually contains such a phrase, so the UI
 * can answer a wrong tile order with the specific correction rather than a
 * generic "incorrect".
 */
export interface ViContrast {
  /** How a Vietnamese speaker would order it, e.g. "sách của tôi". */
  vietnameseOrder: string;
  /** How Chinese orders it, e.g. "我的书". */
  chineseOrder: string;
  /** One-line explanation shown on a wrong answer. */
  note: string;
}

export interface Sentence {
  /** Stable id, e.g. "S1-012-3" (level, grammar point, index). */
  id: string;
  hanzi: string;
  /** Diacritic pinyin, one space per syllable. Derived from the hanzi by pinyin-pro. */
  pinyin: string;
  /**
   * The pinyin the model itself produced, kept only so validation can compare
   * it against the hanzi.
   *
   * `pinyin` above is re-derived from the characters, so its syllable count
   * always matches by construction and can never detect a truncation. The
   * model's independent attempt can disagree, which is the signal.
   */
  modelPinyin: string;
  enGloss: string;
  /** Vietnamese translation — the learner's native language. */
  viGloss: string;
  /** `no` of the grammar point in grammar.json this sentence exercises. */
  grammarPointNo: number;
  /** HSK level this sentence is constrained to, e.g. "1". */
  level: string;
  tiles: SentenceTile[];
  /** Set when a modifier+noun phrase exhibits the VN/ZH order contrast. */
  viContrast?: ViContrast;
  /** Deck words in this sentence that are also false friends — for extra scrutiny. */
  falseFriends?: string[];
}

/** CJK ideographs, the only characters we count as "hanzi" for length checks. */
const HANZI_RE = /[一-鿿㐀-䶿]/u;

export function isHanzi(ch: string): boolean {
  return HANZI_RE.test(ch);
}

/** Count of hanzi characters, ignoring punctuation and latin. */
export function countHanzi(s: string): number {
  let n = 0;
  for (const ch of s) if (isHanzi(ch)) n++;
  return n;
}

/**
 * Strip punctuation that a sentence may legitimately carry.
 *
 * Generated sentences end in 。 or ？ or ！ and may contain 、 or ，. These are
 * not tiles — the learner is not asked to place a full stop — so both the
 * tile-rejoin check and the syllable-count check work on a stripped string.
 */
export const SENTENCE_PUNCTUATION = "。，？！、；：“”‘’（）…—《》";

export function stripPunctuation(s: string): string {
  let out = "";
  for (const ch of s) if (!SENTENCE_PUNCTUATION.includes(ch)) out += ch;
  return out;
}
