/**
 * Grading a typed pinyin answer.
 *
 * Tones are optional, as the plan asks: "nihao" is right for 你好. But a
 * learner who does type tones deserves to hear when they are wrong, so tones
 * given (as marks or as digits, "ni3 hao3") are checked, and a right-letters,
 * wrong-tones answer comes back as "almost" rather than silently passing.
 */

const MARK_TONES: Record<string, number> = {
  '\u0304': 1, // macron
  '\u0301': 2, // acute
  '\u030c': 3, // caron
  '\u0300': 4, // grave
};

/**
 * Bare letters: tone marks and digits gone, ü spelled v.
 *
 * ü stays distinct from u: 绿 lǜ and 路 lù are different words. "u:" and "v"
 * are the usual ways to type it on a keyboard without ü.
 */
export function pinyinLetters(s: string): string {
  return s
    .normalize('NFD')
    .toLowerCase()
    .replace(/u\u0308/g, 'v')
    .replace(/u:/g, 'v')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0-5]/g, '')
    .replace(/[^a-zv]/g, '');
}

/** Tones written into an answer, in order: marks or digits. Neutral (5, 0) is kept as 5. */
export function pinyinTones(s: string): number[] {
  const out: number[] = [];
  for (const ch of s.normalize('NFD')) {
    const mark = MARK_TONES[ch];
    if (mark) out.push(mark);
    else if (/[1-5]/.test(ch)) out.push(Number(ch));
    else if (ch === '0') out.push(5);
  }
  return out;
}

export type PinyinVerdict = 'correct' | 'tones' | 'wrong';

export interface Syllable {
  letters: string;
  /** 1-4, or 5 for neutral. */
  tone: number;
  /** Other tones also right here, as for 不 and 一, whose tone depends on what follows. */
  also?: number[];
}

/** "lao3 shi1" -> [{ letters: "lao", tone: 3 }, { letters: "shi", tone: 1 }]. No digit, or 0, is neutral. */
export function syllablesFromNumeric(numeric: string): Syllable[] {
  return numeric
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((syl) => {
      const m = syl.match(/([0-5])$/);
      const n = m ? Number(m[1]) : 5;
      return { letters: pinyinLetters(syl), tone: n === 0 ? 5 : n };
    });
}

/** "chē zhàn" -> [{ letters: "che", tone: 1 }, { letters: "zhan", tone: 4 }]. No mark is neutral. */
export function syllablesFromMarks(pinyin: string): Syllable[] {
  return pinyin
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((syl) => ({ letters: pinyinLetters(syl), tone: pinyinTones(syl)[0] ?? 5 }));
}

/**
 * The tones an answer gives, each placed on the syllable it belongs to: a tone
 * mark on the syllable of the vowel it sits on, a digit on the syllable just
 * before it. So "laoshi1" is a tone for shi, not for lao, which is also what
 * typing the letters and then tapping a tone key produces. Null when the
 * answer's letters do not line up with the syllables.
 */
function placeTones(answer: string, syllables: Syllable[]): Array<number | undefined> | null {
  const ends: number[] = [];
  let total = 0;
  for (const s of syllables) ends.push((total += s.letters.length));
  const placed: Array<number | undefined> = syllables.map(() => undefined);
  const chars = [...answer.normalize('NFD').toLowerCase()];
  let letters = 0;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (/[a-z]/.test(ch)) {
      letters++;
      if (ch === 'u' && chars[i + 1] === ':') i++; // u: is one letter, ü
      continue;
    }
    const tone = MARK_TONES[ch] ?? (/[0-5]/.test(ch) ? (ch === '0' ? 5 : Number(ch)) : undefined);
    if (tone === undefined || letters === 0) continue;
    const at = ends.findIndex((end) => letters - 1 < end);
    if (at === -1) return null;
    placed[at] = tone;
  }
  return letters === total ? placed : null;
}

/**
 * The syllables, by index, whose given tone is wrong. Only tones actually
 * typed count, and a neutral syllable never does. Null when the answer's
 * letters do not line up with the syllables.
 */
export function toneSlips(answer: string, syllables: Syllable[]): number[] | null {
  const placed = placeTones(answer, syllables);
  if (!placed) return null;
  return placed.flatMap((t, i) => {
    const s = syllables[i];
    return t !== undefined && t !== 5 && s.tone !== 5 && t !== s.tone && !s.also?.includes(t) ? [i] : [];
  });
}

/**
 * - "correct": letters match, and any tones given match too.
 * - "tones":   letters match but a tone given is wrong.
 * - "wrong":   the letters themselves differ.
 *
 * Tones are optional, and neutral syllables never count against an answer:
 * learners rarely mark them and HSK itself is inconsistent (朋友 péngyou vs
 * péngyǒu). With `syllables` (the deck's numeric pinyin, "lao3 shi1") each
 * tone is checked against its own syllable; without, the tones given are
 * read left to right.
 */
export function checkPinyin(answer: string, expected: string, syllables?: string | Syllable[]): PinyinVerdict {
  const letters = pinyinLetters(expected);
  if (!answer.trim() || pinyinLetters(answer) !== letters) return 'wrong';

  const syl = typeof syllables === 'string' ? syllablesFromNumeric(syllables) : syllables;
  if (syl?.length && syl.map((s) => s.letters).join('') === letters) {
    const slips = toneSlips(answer, syl);
    if (slips) return slips.length ? 'tones' : 'correct';
  }

  const given = pinyinTones(answer).filter((t) => t !== 5);
  if (given.length === 0) return 'correct';
  const want = (syl?.map((s) => s.tone) ?? pinyinTones(expected)).filter((t) => t !== 5);
  if (given.length > want.length) return 'tones';
  return given.every((t, i) => t === want[i]) ? 'correct' : 'tones';
}
