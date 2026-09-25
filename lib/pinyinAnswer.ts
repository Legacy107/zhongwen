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

/**
 * - "correct": letters match, and any tones given match too.
 * - "tones":   letters match but the tones given do not.
 * - "wrong":   the letters themselves differ.
 *
 * Neutral tones are ignored when comparing, since learners rarely mark them
 * and HSK itself is inconsistent about them (朋友 péngyou vs péngyǒu).
 *
 * `syllableTones` (the deck's per-syllable tones, 5 for neutral) lines the
 * answer up syllable by syllable when every syllable was given a tone, so the
 * citation tone on a neutral syllable (péngyǒu) is not counted as a mistake.
 */
export function checkPinyin(
  answer: string,
  expected: string,
  syllableTones?: number[],
): PinyinVerdict {
  if (!answer.trim() || pinyinLetters(answer) !== pinyinLetters(expected)) return 'wrong';
  const given = pinyinTones(answer);
  if (given.every((t) => t === 5)) return 'correct';

  if (syllableTones && given.length === syllableTones.length) {
    const ok = given.every((t, i) => syllableTones[i] === 5 || t === 5 || t === syllableTones[i]);
    return ok ? 'correct' : 'tones';
  }
  // Tones on only some syllables can't be aligned exactly. Learners mark the
  // ones they know left to right, so read them as a prefix.
  const want = (syllableTones ?? pinyinTones(expected)).filter((t) => t !== 5);
  const got = given.filter((t) => t !== 5);
  if (got.length > want.length) return 'tones';
  return got.every((t, i) => t === want[i]) ? 'correct' : 'tones';
}
