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
  /**
   * The generated `pinyin`, one syllable per character, kept by lib/data.ts
   * when it rewrites `pinyin` per word for display. A typed answer's tones are
   * checked against it. Absent for sentences saved from reading.
   */
  syllablePinyin?: string;
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

/**
 * Particles and measure words worth gap-filling.
 *
 * These are exactly what isolated vocabulary cannot teach: 了 and 的 are
 * meaningless in a flashcard and decisive in a sentence, and Vietnamese
 * classifiers do not map onto Chinese ones (cái/con/quyển vs 个/本/条).
 */
export const GAP_PARTICLES = ['了', '的', '吗', '呢', '吧', '着', '过', '地', '得'] as const;
export const GAP_MEASURE_WORDS = [
  '个', '本', '杯', '件', '张', '只', '条', '块', '位', '双', '把', '家', '口', '岁', '点', '些',
] as const;

const GAP_TARGETS = new Set<string>([...GAP_PARTICLES, ...GAP_MEASURE_WORDS]);

/**
 * Readings for the gap options.
 *
 * Hardcoded rather than derived: every one of these is a polyphone whose
 * grammatical reading differs from its citation form, which is exactly what
 * pinyin-pro gets wrong without sentence context. 了 is le here, never liǎo;
 * 得 is de, not dé; 着 is zhe, not zhuó; 地 is de, not dì.
 */
export const GAP_READINGS: Record<string, string> = {
  了: 'le',
  的: 'de',
  吗: 'ma',
  呢: 'ne',
  吧: 'ba',
  着: 'zhe',
  过: 'guo',
  地: 'de',
  得: 'de',
  个: 'gè',
  本: 'běn',
  杯: 'bēi',
  件: 'jiàn',
  张: 'zhāng',
  只: 'zhī',
  条: 'tiáo',
  块: 'kuài',
  位: 'wèi',
  双: 'shuāng',
  把: 'bǎ',
  家: 'jiā',
  口: 'kǒu',
  岁: 'suì',
  点: 'diǎn',
  些: 'xiē',
};

export interface GapFill {
  sentenceId: string;
  /** Tile index that has been blanked. */
  gapIndex: number;
  /** The tile text that belongs in the gap. */
  answer: string;
  /** Answer plus plausible wrong choices, already shuffled. */
  options: string[];
  /** True when the gap is a measure word rather than a particle. */
  isMeasureWord: boolean;
}

/**
 * Derives a gap-fill from a sentence, or null when it has no suitable gap.
 *
 * Distractors are drawn from the same category — a measure-word gap offers
 * only measure words — because offering 了 against 本 tests nothing.
 */
export function buildGapFill(
  sentence: Sentence,
  random: () => number = Math.random,
): GapFill | null {
  const candidates = sentence.tiles
    .map((t, i) => ({ t, i }))
    .filter(({ t }) => GAP_TARGETS.has(t.text));
  if (candidates.length === 0) return null;

  const chosen = candidates[Math.floor(random() * candidates.length)];
  const answer = chosen.t.text;
  const measure = (GAP_MEASURE_WORDS as readonly string[]).includes(answer);
  const pool = (measure ? GAP_MEASURE_WORDS : GAP_PARTICLES).filter((c) => c !== answer);

  const distractors: string[] = [];
  const taken = new Set<string>();
  while (distractors.length < 3 && taken.size < pool.length) {
    const pick = pool[Math.floor(random() * pool.length)];
    if (taken.has(pick)) continue;
    taken.add(pick);
    distractors.push(pick);
  }

  const options = [answer, ...distractors];
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [options[i], options[j]] = [options[j], options[i]];
  }

  return {
    sentenceId: sentence.id,
    gapIndex: chosen.i,
    answer,
    options,
    isMeasureWord: measure,
  };
}

/**
 * Wrong tiles for the word bank, so building a sentence means choosing words
 * as well as ordering them.
 *
 * Drawn from other sentences at the same level, so they are words the learner
 * is meeting anyway, and never a word the sentence itself uses (a distractor
 * that also fits would be marked wrong for a valid answer). Tiles of the same
 * length as the sentence's own are preferred, so size gives nothing away.
 */
export function pickDistractors(
  sentence: Sentence,
  pool: Sentence[],
  count: number,
  random: () => number = Math.random,
): SentenceTile[] {
  const own = new Set(sentence.tiles.map((t) => t.text));
  const lengths = new Set(sentence.tiles.map((t) => [...t.text].length));
  const seen = new Set<string>();
  const candidates: SentenceTile[] = [];
  for (const s of pool) {
    if (s.id === sentence.id || s.level !== sentence.level) continue;
    for (const t of s.tiles) {
      if (own.has(t.text) || seen.has(t.text) || !t.pinyin) continue;
      // A tile containing one of the sentence's own words could still fit.
      if ([...own].some((o) => t.text.includes(o) || o.includes(t.text))) continue;
      seen.add(t.text);
      candidates.push(t);
    }
  }
  const scored = candidates.map((t) => ({ t, r: random() + (lengths.has([...t.text].length) ? 0 : 1) }));
  scored.sort((a, b) => a.r - b.r);
  return scored.slice(0, count).map((s) => s.t);
}
