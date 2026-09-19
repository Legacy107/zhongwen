/**
 * Sentence validator.
 *
 * Deliberately a standalone module with no side effects at import time, so it
 * can be unit-tested and re-run over already-committed data independently of
 * generation. `scripts/generate-sentences.ts` calls `validateSentences` before
 * writing anything; `yarn sentences:validate` calls it over `data/sentences.json`.
 *
 * Every check reports rather than silently drops. A sentence that fails any
 * check is rejected with the reason and the offending detail attached, so the
 * report can quote real examples instead of a bare count.
 */
import type { FalseFriend, Word } from "../lib/hanviet";
import { countHanzi, stripPunctuation, type Sentence } from "../lib/sentences";

export type RejectionCode =
  | "tiles-mismatch"
  | "out-of-level"
  | "pinyin-length"
  | "duplicate"
  | "length-bounds"
  | "malformed";

export interface Rejection {
  code: RejectionCode;
  sentence: Sentence;
  /** Human-readable specifics — the out-of-level word, the two strings that differ. */
  detail: string;
}

/**
 * A sentence that passed every check but contains a false friend.
 *
 * Not a rejection: a false friend in a sentence is often exactly what we want
 * to drill. It is surfaced so a human reviews those sentences first.
 */
export interface Flag {
  sentence: Sentence;
  falseFriends: string[];
}

export interface ValidationResult {
  valid: Sentence[];
  rejected: Rejection[];
  flagged: Flag[];
  /** Rejection counts by code, for the report summary. */
  byCode: Record<RejectionCode, number>;
}

export interface ValidationOptions {
  /** HSK level the sentences are constrained to, e.g. "1". */
  level: string;
  words: Word[];
  falseFriends: FalseFriend[];
  /**
   * Content words lifted from the grammar points themselves.
   *
   * A grammar point's own content (方位名词: 上、下、里、外…) is by definition
   * what the sentence must exercise, and some of those characters are not in
   * the level's wordlist. Allowing them is the difference between a usable
   * corpus and rejecting most of the grammar points outright.
   */
  grammarWords?: Set<string>;
  /** Inclusive hanzi-count bounds. Defaults to the spec's 4–12. */
  minChars?: number;
  maxChars?: number;
}

/**
 * HSK levels at or below `level`.
 *
 * "S" (supplementary) *is* included at every level. It is not an ungraded
 * dumping ground: it is a hand-curated 41-word list of countries, nationalities
 * and languages that HSK omits entirely (越南, 越南人, 墨尔本, …), added because
 * the learner already knows several of them and they cannot be expressed
 * otherwise. Excluding it would reject 我是越南人 - the motivating example for
 * this whole stage - and with it most of the Vietnamese word-order contrast
 * material, which is exactly what the tile exercises exist to drill.
 */
export function levelsUpTo(level: string): string[] {
  const order = ["1", "2", "3", "4", "5", "6"];
  const idx = order.indexOf(level);
  const graded = idx === -1 ? order : order.slice(0, idx + 1);
  return [...graded, "S"];
}

/**
 * Every character that may appear in a sentence at this level.
 *
 * Character-level rather than word-level, because the word-level check is done
 * separately against the tiles. A sentence can only use characters that occur
 * in an allowed word — this catches a hallucinated character that happens to
 * segment into no known word at all.
 */
export function buildAllowedChars(
  words: Word[],
  level: string,
  grammarWords?: Set<string>,
): Set<string> {
  const levels = new Set(levelsUpTo(level));
  const chars = new Set<string>();
  for (const w of words) {
    if (!levels.has(w.level)) continue;
    for (const ch of w.simplified) chars.add(ch);
  }
  for (const gw of grammarWords ?? []) {
    for (const ch of gw) chars.add(ch);
  }
  return chars;
}

/** Words at or below `level`, keyed by surface form. */
export function buildAllowedWords(words: Word[], level: string): Map<string, Word> {
  const levels = new Set(levelsUpTo(level));
  const map = new Map<string, Word>();
  for (const w of words) {
    if (!levels.has(w.level)) continue;
    if (!map.has(w.simplified)) map.set(w.simplified, w);
  }
  return map;
}

/** Count pinyin syllables in a space-separated diacritic pinyin string. */
export function countSyllables(p: string): number {
  return p.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Number of 儿 characters that merge into the preceding syllable (erhua).
 *
 * 一点儿 is three characters but two syllables — "yì diǎnr". But 儿 is not
 * always erhua: in 女儿 ("nǚ'ér") and 儿子 ("érzi") it carries its own syllable.
 *
 * Rather than guess from the surrounding characters, this consults the deck:
 * a word whose own pinyin has as many syllables as it has characters is not
 * erhua, whatever the 儿 looks like. `nonErhuaWords` is built from words.json,
 * so new cases are picked up from the data instead of a hand-maintained list.
 */
export function countErhua(hanzi: string, nonErhuaWords?: Set<string>): number {
  const chars = [...hanzi];
  let n = 0;
  for (let i = 1; i < chars.length; i++) {
    if (chars[i] !== "儿") continue;
    if (!/[\u4e00-\u9fff]/.test(chars[i - 1])) continue;
    // A word that *starts* at this 儿 means the 儿 is that word's own initial
    // syllable, not a coda on what precedes it - 我儿子 is wǒ ér zi.
    const forward = chars[i] + (chars[i + 1] ?? "");
    if (nonErhuaWords?.has(forward)) continue;
    // A word ending at this 儿 whose pinyin has a genuine break - 女儿, nǚ'ér.
    const pair = chars[i - 1] + chars[i];
    const triple = i >= 2 ? chars[i - 2] + pair : "";
    if (nonErhuaWords?.has(pair) || (triple && nonErhuaWords?.has(triple))) continue;
    n++;
  }
  return n;
}

/**
 * Words where a non-initial 儿 keeps its own syllable — 女儿 ("nǚ'ér").
 *
 * pinyin-pro marks a genuine break with an apostrophe and writes erhua as a
 * merged coda ("diǎnr"), so the apostrophe is the signal. A word-initial 儿
 * (儿子, "érzi") carries no apostrophe but needs no entry either: countErhua
 * only ever counts a 儿 that follows another hanzi.
 */
export function buildNonErhuaWords(words: Word[]): Set<string> {
  const out = new Set<string>();
  for (const w of words) {
    if (!w.simplified.includes("儿")) continue;
    // Only an apostrophe or a space marks a syllable boundary in these
    // readings, so split on those directly rather than stripping letters -
    // a character class misses the accented vowels (ǚ, é, ǎ) entirely.
    const syllables = w.pinyin.split(/['\u2019\s]+/).filter(Boolean).length;
    // A genuine break shows up as more than one piece - 女儿, "nǚ'ér".
    if (syllables > 1) out.add(w.simplified);
    // A word-initial 儿 is always its own syllable (儿子, "érzi"), even though
    // pinyin-pro writes it without a separator.
    else if (w.simplified.startsWith("儿")) out.add(w.simplified);
  }
  return out;
}

function validateSentence(
  s: Sentence,
  opts: ValidationOptions,
  allowedChars: Set<string>,
  allowedWords: Map<string, Word>,
  seen: Map<string, Sentence>,
  nonErhua?: Set<string>,
): Rejection | null {
  const min = opts.minChars ?? 4;
  const max = opts.maxChars ?? 12;

  // 0. Structural sanity. A malformed record is a generation bug, not a
  //    linguistic one, and reporting it separately keeps the two apart.
  if (
    typeof s.hanzi !== "string" ||
    s.hanzi.length === 0 ||
    typeof s.pinyin !== "string" ||
    typeof s.modelPinyin !== "string" ||
    !Array.isArray(s.tiles) ||
    s.tiles.length === 0
  ) {
    return { code: "malformed", sentence: s, detail: "missing hanzi, pinyin or tiles" };
  }

  const bare = stripPunctuation(s.hanzi);

  // 1. Tiles must rejoin to exactly the original hanzi.
  const rejoined = s.tiles.map((t) => t.text).join("");
  if (rejoined !== bare) {
    return {
      code: "tiles-mismatch",
      sentence: s,
      detail: `tiles rejoin to "${rejoined}" but sentence is "${bare}"`,
    };
  }

  // 2. Length bounds. Outside 4–12 the exercise stops being a tile puzzle:
  //    three tiles is trivial, fifteen does not fit a phone screen.
  const nChars = countHanzi(bare);
  if (nChars < min || nChars > max) {
    return {
      code: "length-bounds",
      sentence: s,
      detail: `${nChars} characters, outside ${min}–${max}`,
    };
  }

  // 3. No word above the target level. Checked two ways: every tile that looks
  //    like a word must be an allowed word (or a grammar-point content word),
  //    and every character must come from some allowed word.
  for (const ch of bare) {
    if (!allowedChars.has(ch)) {
      return {
        code: "out-of-level",
        sentence: s,
        detail: `character "${ch}" is not in any HSK ${opts.level} word`,
      };
    }
  }
  for (const tile of s.tiles) {
    if (tile.text.length === 1) continue; // single chars are covered by the char check
    if (allowedWords.has(tile.text)) continue;
    if (opts.grammarWords?.has(tile.text)) continue;
    return {
      code: "out-of-level",
      sentence: s,
      detail: `word "${tile.text}" is not an HSK ${opts.level} word`,
    };
  }

  // 4. Pinyin syllable count must match the hanzi character count. Checked
  //    against `modelPinyin` — the model's own attempt — not the `pinyin`
  //    field, which is re-derived from these same characters and so matches by
  //    construction. Only the independent attempt can reveal that the model
  //    truncated or hallucinated one of the two fields.
  //
  //    Erhua is subtracted first: 儿 merges into the preceding syllable, so
  //    一点儿 is three characters but two syllables ("yì diǎnr"). A correct
  //    transcription is therefore legitimately shorter than the character
  //    count, and a naive comparison rejects it.
  const got = countSyllables(s.modelPinyin);
  const expected = nChars - countErhua(s.hanzi, nonErhua);
  if (got !== expected) {
    return {
      code: "pinyin-length",
      sentence: s,
      detail:
        `model pinyin "${s.modelPinyin}" has ${got} syllables, ` +
        `hanzi has ${nChars} characters (${expected} expected after erhua)`,
    };
  }

  // 5. No duplicates, compared on hanzi alone — two sentences with the same
  //    characters teach the same thing however differently they are glossed.
  const prior = seen.get(bare);
  if (prior) {
    return {
      code: "duplicate",
      sentence: s,
      detail: `duplicate of ${prior.id} (grammar point ${prior.grammarPointNo})`,
    };
  }

  return null;
}

export function validateSentences(
  sentences: Sentence[],
  opts: ValidationOptions,
): ValidationResult {
  const allowedChars = buildAllowedChars(opts.words, opts.level, opts.grammarWords);
  const allowedWords = buildAllowedWords(opts.words, opts.level);
  const nonErhua = buildNonErhuaWords(opts.words);
  const ffBySurface = new Map(opts.falseFriends.map((f) => [f.simplified, f]));

  const valid: Sentence[] = [];
  const rejected: Rejection[] = [];
  const flagged: Flag[] = [];
  const seen = new Map<string, Sentence>();

  for (const s of sentences) {
    const rejection = validateSentence(s, opts, allowedChars, allowedWords, seen, nonErhua);
    if (rejection) {
      rejected.push(rejection);
      continue;
    }
    const bare = stripPunctuation(s.hanzi);
    seen.set(bare, s);

    // 6. Flag false friends. These pass validation — a false friend in a
    //    sentence is usually a teaching opportunity — but they are the
    //    sentences most likely to mislead a Vietnamese reader, so they are
    //    listed for human review rather than trusted.
    const hits: string[] = [];
    for (const tile of s.tiles) {
      if (ffBySurface.has(tile.text)) hits.push(tile.text);
    }
    for (const ff of opts.falseFriends) {
      if (!hits.includes(ff.simplified) && bare.includes(ff.simplified)) {
        hits.push(ff.simplified);
      }
    }
    if (hits.length > 0) {
      s.falseFriends = hits;
      flagged.push({ sentence: s, falseFriends: hits });
    } else {
      delete s.falseFriends;
    }
    valid.push(s);
  }

  const byCode: Record<RejectionCode, number> = {
    "tiles-mismatch": 0,
    "out-of-level": 0,
    "pinyin-length": 0,
    duplicate: 0,
    "length-bounds": 0,
    malformed: 0,
  };
  for (const r of rejected) byCode[r.code]++;

  return { valid, rejected, flagged, byCode };
}

/** Per-grammar-point counts, for the coverage table in the report. */
export function coverageByGrammarPoint(
  valid: Sentence[],
  rejected: Rejection[],
  pointNos: number[],
): Map<number, { valid: number; rejected: number }> {
  const cov = new Map<number, { valid: number; rejected: number }>();
  for (const no of pointNos) cov.set(no, { valid: 0, rejected: 0 });
  for (const s of valid) {
    const e = cov.get(s.grammarPointNo);
    if (e) e.valid++;
  }
  for (const r of rejected) {
    const e = cov.get(r.sentence.grammarPointNo);
    if (e) e.rejected++;
  }
  return cov;
}

