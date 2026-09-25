/**
 * Pinyin formatting: one spelling convention for display, and tone digits
 * typed on a keyboard turned into tone marks.
 */

const TONE_MARK: Record<string, string> = { '1': '̄', '2': '́', '3': '̌', '4': '̀' };

const VOWEL_INITIAL = /^[aeoāáǎàēéěèōóǒò]/i;

/**
 * Word pinyin as one unit, the standard way: the HSK list writes some words
 * with spaces (shǒu jī) and some without (xiǎoxīn). Syllables join, with an
 * apostrophe before a vowel-initial one so Xī'ān never reads as xiān.
 */
export function displayPinyin(pinyin: string): string {
  const syllables = pinyin.trim().split(/\s+/).filter(Boolean);
  return syllables.reduce(
    (acc, syl, i) => (i > 0 && VOWEL_INITIAL.test(syl) && !acc.endsWith("'") ? `${acc}'${syl}` : acc + syl),
    '',
  );
}

/**
 * Where the tone mark goes: on a or e if present, on the o of "ou",
 * otherwise on the last vowel. These three rules cover every syllable.
 */
function markSyllable(letters: string, tone: string): string {
  const s = letters.replace(/u:|v/gi, (m) => (m === m.toUpperCase() ? 'Ü' : 'ü'));
  const mark = TONE_MARK[tone];
  if (!mark) return s;
  const lower = s.toLowerCase();
  let at = lower.search(/[ae]/);
  if (at === -1) at = lower.indexOf('ou');
  if (at === -1) {
    for (let i = lower.length - 1; i >= 0; i--) {
      if ('iouü'.includes(lower[i])) {
        at = i;
        break;
      }
    }
  }
  if (at === -1) return s;
  return (s.slice(0, at + 1) + mark + s.slice(at + 1)).normalize('NFC');
}

/**
 * "ni3hao3" -> "nǐhǎo", "lv4" -> "lǜ", "ma5" -> "ma". Text without tone
 * digits passes through unchanged, so it is safe to run on any input.
 */
export function numericToMarks(input: string): string {
  return input.replace(/([a-zü:]+?)([0-5])/gi, (_, letters: string, tone: string) => markSyllable(letters, tone));
}
