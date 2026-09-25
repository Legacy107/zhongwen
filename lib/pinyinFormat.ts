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

const bare = (p: string) =>
  p
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[\s']/g, '')
    .toLowerCase();

/**
 * Why a word reads differently in a sentence than in the dictionary, or null
 * when it does not. 不 and 一 change tone by what follows (不用 búyòng, 一个
 * yí gè); anything else is a neutral tone or a reading chosen by context.
 */
export function toneChangeNote(text: string, contextPinyin: string, dictionaryPinyin: string): string | null {
  const said = contextPinyin.normalize('NFC').replace(/[\s']/g, '').toLowerCase();
  const listed = dictionaryPinyin.normalize('NFC').replace(/[\s']/g, '').toLowerCase();
  if (said === listed) return null;
  if (bare(said) !== bare(listed)) return `Dictionary form: ${dictionaryPinyin}.`;
  if (text.includes('不') && said.includes('bú'))
    return `Said ${contextPinyin} here: 不 bù becomes bú before a fourth tone. The dictionary writes ${dictionaryPinyin}.`;
  if (text.includes('一') && (said.includes('yí') || said.includes('yì')))
    return `Said ${contextPinyin} here: 一 yī becomes yí before a fourth tone and yì before the others. The dictionary writes ${dictionaryPinyin}.`;
  return `Said ${contextPinyin} in this sentence; the dictionary writes ${dictionaryPinyin}.`;
}
