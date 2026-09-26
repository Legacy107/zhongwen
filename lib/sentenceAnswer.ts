/**
 * Grading a sentence typed from memory: free production, the last Stage 2.5
 * exercise. Graded loosely, as the plan asks, since a sentence has more ways
 * to be right than a word does:
 *
 * - Characters, from a Chinese keyboard, must match the sentence. Punctuation,
 *   spaces and full-width forms don't count.
 * - Pinyin is accepted too, and tones are optional. Tones typed are checked
 *   syllable by syllable, and a slip is "almost", not wrong.
 * - Anything else is wrong, but the learner can overrule it: one reference
 *   sentence can't know every good translation.
 */
import { orderHintFor, type OrderHint } from './orderHints';
import { pinyinLetters, syllablesFromMarks, toneSlips } from './pinyinAnswer';
import { isHanzi, type Sentence } from './sentences';

export type SentenceVerdict = 'correct' | 'tones' | 'wrong';

export interface SentenceCheck {
  verdict: SentenceVerdict;
  /** What the answer was written in. */
  script: 'hanzi' | 'pinyin';
  /** Syllables of `sentence.syllablePinyin`, by index, whose typed tone is wrong. */
  slips: number[];
  /** The word-order correction for a wrong answer, when it shows one. */
  hint: OrderHint | null;
}

/** Characters alone: punctuation, symbols and spaces gone, full-width letters and digits made plain. */
export function bareHanzi(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/[\p{P}\p{S}\s]/gu, '')
    .toLowerCase();
}

/**
 * The answer as the sentence's own words, in the order typed, or null when it
 * isn't exactly those words rearranged. `spell` writes a tile the way the
 * answer is written: as characters, or as pinyin letters.
 */
function asWords(answer: string, sentence: Sentence, spell: (text: string, pinyin: string) => string): string[] | null {
  const spelled = sentence.tiles.map((t) => spell(t.text, t.pinyin));
  const used = spelled.map(() => false);
  const words: string[] = [];
  const walk = (at: number): boolean => {
    if (at === answer.length) return used.every(Boolean);
    for (let i = 0; i < spelled.length; i++) {
      if (used[i] || !spelled[i] || !answer.startsWith(spelled[i], at)) continue;
      used[i] = true;
      words.push(sentence.tiles[i].text);
      if (walk(at + spelled[i].length)) return true;
      used[i] = false;
      words.pop();
    }
    return false;
  };
  return walk(0) ? words : null;
}

export function checkSentence(answer: string, sentence: Sentence): SentenceCheck {
  if ([...answer].some(isHanzi)) {
    const typed = bareHanzi(answer);
    if (typed === bareHanzi(sentence.hanzi)) return { verdict: 'correct', script: 'hanzi', slips: [], hint: null };
    const words = asWords(typed, sentence, (text) => bareHanzi(text));
    return { verdict: 'wrong', script: 'hanzi', slips: [], hint: orderHintFor(sentence, words, typed) };
  }

  // Either spelling is right: the words as the tiles show them (哪儿 nǎr),
  // or a syllable per character as generated (nǎ ér).
  const letters = pinyinLetters(answer);
  const bySyllable = sentence.syllablePinyin;
  if (!letters || (letters !== pinyinLetters(sentence.pinyin) && letters !== pinyinLetters(bySyllable ?? ''))) {
    const words = letters ? asWords(letters, sentence, (_, pinyin) => pinyinLetters(pinyin)) : null;
    return { verdict: 'wrong', script: 'pinyin', slips: [], hint: orderHintFor(sentence, words, null) };
  }

  // Tones are judged syllable by syllable, which needs a syllable per
  // character. A sentence saved from reading only has pinyin per word
  // (zhīdào), so there, and for a 儿 typed as -r, the letters alone decide.
  const chars = [...sentence.hanzi].filter(isHanzi);
  const syllables = bySyllable ? syllablesFromMarks(bySyllable) : [];
  if (syllables.length !== chars.length || pinyinLetters(bySyllable ?? '') !== letters) {
    return { verdict: 'correct', script: 'pinyin', slips: [], hint: null };
  }
  const slips = toneSlips(answer, syllables.map((s, i) => ({ ...s, also: TONE_CHANGES[chars[i]] }))) ?? [];
  return { verdict: slips.length ? 'tones' : 'correct', script: 'pinyin', slips, hint: null };
}

/**
 * Characters whose tone depends on what follows: 不 is bú before a fourth
 * tone, 一 yí or yì. Their dictionary tone is right too.
 */
const TONE_CHANGES: Record<string, number[]> = { 不: [2, 4], 一: [1, 2, 4] };

/**
 * The typed characters, each marked by whether it matches the sentence: the
 * longest run of characters the two share in order is right, and the rest,
 * extra or out of place, is flagged.
 */
export function markTyped(typed: string, target: string): Array<{ ch: string; ok: boolean }> {
  const a = [...typed];
  const b = [...target];
  // common[i][j]: length of the longest shared subsequence of a[i..] and b[j..].
  const common = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      common[i][j] = a[i] === b[j] ? common[i + 1][j + 1] + 1 : Math.max(common[i + 1][j], common[i][j + 1]);
    }
  }
  const out: Array<{ ch: string; ok: boolean }> = [];
  let i = 0;
  let j = 0;
  while (i < a.length) {
    if (j < b.length && a[i] === b[j]) {
      out.push({ ch: a[i++], ok: true });
      j++;
    } else if (j < b.length && common[i][j + 1] >= common[i + 1][j]) {
      j++;
    } else {
      out.push({ ch: a[i++], ok: false });
    }
  }
  return out;
}
