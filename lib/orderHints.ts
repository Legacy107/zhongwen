/**
 * Word-order corrections for a wrong tile answer that follows Vietnamese order.
 *
 * Vietnamese and Chinese are both SVO, so most order transfers for free. The
 * mistakes a Vietnamese speaker makes are systematic, and each has a rule
 * worth saying out loud instead of a bare "incorrect":
 *
 *   position words   bên cạnh bệnh viện    →  医院旁边   (place, then position)
 *   的 modifiers      sách của tôi          →  我的书     (describer, then noun)
 *   place of action  ăn cơm ở nhà          →  在家吃饭   (在 + place before the verb)
 *   time words       … hôm nay (at the end) →  今天 before the verb
 *
 * Each rule fires only when the learner's own answer shows that exact
 * reversal, so the note always describes the mistake actually made.
 */

import type { Sentence } from './sentences';

/** Position words that follow the noun in Chinese, with their Vietnamese preposition. */
const LOCALIZERS: Record<string, string> = {
  旁边: 'bên cạnh',
  上: 'trên',
  上面: 'trên',
  上边: 'trên',
  下: 'dưới',
  下面: 'dưới',
  下边: 'dưới',
  里: 'trong',
  里面: 'trong',
  里边: 'trong',
  外面: 'ngoài',
  外边: 'ngoài',
  前面: 'trước',
  前边: 'trước',
  后面: 'sau',
  后边: 'sau',
  中间: 'giữa',
  对面: 'đối diện',
  附近: 'gần',
  左边: 'bên trái',
  右边: 'bên phải',
};

const TIME_WORDS = new Set([
  '今天',
  '明天',
  '昨天',
  '现在',
  '晚上',
  '早上',
  '上午',
  '下午',
  '中午',
  '每天',
  '今年',
  '明年',
  '去年',
  '刚才',
  '周末',
  '以后',
  '以前',
]);

/** Sentence-final particles: not a verb, so 在 + place before one is 在 as the main verb. */
const PARTICLES = new Set(['了', '吗', '呢', '吧', '的', '啊', '呀']);

export interface OrderHint {
  /** One line, shown under the correct answer. */
  note: string;
  /** The Chinese chunk that is in the right order, for emphasis. */
  chinese: string;
}

export function vietnameseOrderHint(target: string[], answer: string[]): OrderHint | null {
  const at = (text: string) => answer.indexOf(text);

  // Position word after its place: 医院旁边, not 旁边医院.
  for (let i = 1; i < target.length; i++) {
    const vi = LOCALIZERS[target[i]];
    if (!vi) continue;
    const place = target[i - 1];
    if (at(place) >= 0 && at(target[i]) >= 0 && at(target[i]) < at(place)) {
      return {
        note: `Vietnamese puts the position first ("${vi} …"). Chinese names the place first, then the position word.`,
        chinese: `${place}${target[i]}`,
      };
    }
  }

  // Describer before 的 and the noun after it: 我的书, not 书我的.
  for (let i = 1; i < target.length - 1; i++) {
    if (target[i] !== '的') continue;
    const describer = target[i - 1];
    const noun = target[i + 1];
    if (PARTICLES.has(noun)) continue;
    if (at(describer) >= 0 && at(noun) >= 0 && at(noun) < at(describer)) {
      return {
        note: 'Vietnamese puts the noun first and the describing word after it ("sách của tôi"). Chinese puts the describer first, joined to the noun by 的.',
        chinese: `${describer}的${noun}`,
      };
    }
  }

  // 在 + place before the verb: 在家吃饭, not 吃饭在家.
  for (let i = 0; i < target.length - 2; i++) {
    if (target[i] !== '在') continue;
    const place = target[i + 1];
    const verb = target[i + 2];
    if (PARTICLES.has(verb)) continue;
    if (at('在') >= 0 && at(verb) >= 0 && at(verb) < at('在')) {
      return {
        note: 'Vietnamese puts "ở + place" after the verb. Chinese puts 在 + place before the verb.',
        chinese: `在${place}${verb}`,
      };
    }
  }

  // Time before the verb, never trailing at the end.
  for (let i = 0; i < target.length - 1; i++) {
    if (!TIME_WORDS.has(target[i])) continue;
    if (at(target[i]) === answer.length - 1 && answer.length > 2) {
      return {
        note: 'Chinese puts time words before the verb, at or near the start. Ending with the time, as Vietnamese can, does not work.',
        // Up to the verb that follows the time word.
        chinese: target.slice(0, i + 2).join(''),
      };
    }
  }

  return null;
}

/**
 * The correction for a wrong answer: the rule its own order breaks, else the
 * contrast the sentence was written to teach, when the answer lacks that
 * chunk. `words` is the answer as the sentence's words, when it splits into
 * them; `hanzi` is the answer's characters, when it was written in them.
 */
export function orderHintFor(sentence: Sentence, words: string[] | null, hanzi: string | null): OrderHint | null {
  const runtime = words ? vietnameseOrderHint(sentence.tiles.map((t) => t.text), words) : null;
  if (runtime) return runtime;
  const tagged = sentence.viContrast;
  if (tagged && hanzi !== null && !hanzi.includes(tagged.chineseOrder)) {
    return { note: tagged.note, chinese: tagged.chineseOrder };
  }
  return null;
}
