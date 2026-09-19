/**
 * Tone training weighted to the Vietnamese error profile.
 *
 * Not a uniform drill. Vietnamese speakers have documented, specific
 * difficulties with Mandarin tone, and the drill mix is weighted to them:
 *
 *   T1 vs T4        highest   Vietnamese-specific confusion
 *   T4 + T4         highest   the second T4 drifts toward T1
 *   T3 + T3 sandhi  high      systematically underapplied
 *   T2 vs T3        medium    universal, not L1-specific
 *
 * Anchors are given in Vietnamese where a Vietnamese tone is genuinely close,
 * because that is the learner's existing phonological system. T3 is taught as
 * low-flat rather than the textbook dip: in connected speech the full
 * fall-rise only appears in isolation or utterance-finally.
 */
import type { Word } from './hanviet';

export type ToneContrast = 't1-t4' | 't4-t4' | 't3-sandhi' | 't2-t3';

/** Relative frequency in a session. Higher means drilled more often. */
export const CONTRAST_WEIGHT: Record<ToneContrast, number> = {
  't1-t4': 4,
  't4-t4': 4,
  't3-sandhi': 3,
  't2-t3': 2,
};

export const CONTRAST_LABEL: Record<ToneContrast, string> = {
  't1-t4': 'Tone 1 vs 4',
  't4-t4': 'Two fourth tones',
  't3-sandhi': 'Third-tone sandhi',
  't2-t3': 'Tone 2 vs 3',
};

/** Why this contrast is drilled, shown once per item. */
export const CONTRAST_NOTE: Record<ToneContrast, string> = {
  't1-t4':
    'Tone 1 is high and level, like Vietnamese ngang but higher and longer. Tone 4 falls sharply, like sắc reversed. These two are the most common Vietnamese-speaker confusion.',
  't4-t4':
    'Both syllables fall. The second one tends to drift up toward tone 1 - keep it falling.',
  't3-sandhi':
    'Two third tones in a row: the first becomes tone 2. 水果 is said "shuí guǒ", never "shuǐ guǒ".',
  't2-t3':
    'Tone 2 rises from mid. Tone 3 stays low and flat here - the textbook dip only appears in isolation.',
};

/** Vietnamese anchors for each Mandarin tone. */
export const TONE_ANCHOR: Record<number, { name: string; hint: string }> = {
  1: { name: 'high level', hint: 'like ngang, but higher and held longer' },
  2: { name: 'rising', hint: 'like sắc - rises from mid' },
  3: { name: 'low', hint: 'stays low and flat; not the textbook dip' },
  4: { name: 'sharp fall', hint: 'falls hard from high to low' },
};

export interface ToneDrill {
  id: string;
  contrast: ToneContrast;
  word: Word;
  /** Tones the learner picks between. Always includes the right answer. */
  options: number[][];
  answer: number[];
  /** A confusable word sharing the same syllables, when one exists. */
  foil?: Word;
}

/**
 * Bare syllables, tones stripped, for minimal-pair grouping.
 *
 * NFD decomposes ü into u + diaeresis, which lands in the same combining
 * range as the tone marks. Stripping naively turns lǜ into "lu" and would
 * pair 绿 with 路 as a false minimal pair - they are different syllables.
 */
export function bareSyllables(pinyin: string): string {
  const PROTECTED = '\u0001';
  return pinyin
    .normalize('NFD')
    .replace(/u\u0308/g, PROTECTED)
    .replace(/[\u0300-\u036f]/g, '')
    .replace(new RegExp(PROTECTED, 'g'), '\u00fc')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function isMono(w: Word): boolean {
  return [...w.simplified].length === 1 && w.toneNumbers.length === 1;
}

/**
 * Builds the drill pool from the deck.
 *
 * Minimal pairs are preferred: hearing 花 against 话 teaches the contrast far
 * better than hearing 花 alone. Where the deck has no pair for a syllable, the
 * word still drills as a tone-identification item.
 */
export function buildToneDrills(words: Word[]): ToneDrill[] {
  const drills: ToneDrill[] = [];

  // T1 vs T4 minimal pairs.
  const bySyllable = new Map<string, Word[]>();
  for (const w of words) {
    if (!isMono(w)) continue;
    const k = bareSyllables(w.pinyin);
    const list = bySyllable.get(k) ?? [];
    list.push(w);
    bySyllable.set(k, list);
  }
  for (const [, group] of bySyllable) {
    const t1 = group.find((w) => w.toneNumbers[0] === 1);
    const t4 = group.find((w) => w.toneNumbers[0] === 4);
    if (!t1 || !t4 || t1.simplified === t4.simplified) continue;
    for (const [target, foil] of [
      [t1, t4],
      [t4, t1],
    ] as const) {
      drills.push({
        id: `t1-t4:${target.id}`,
        contrast: 't1-t4',
        word: target,
        foil,
        options: [[1], [4]],
        answer: target.toneNumbers,
      });
    }
  }

  // Disyllabic patterns. Options are the real tone pair plus the error the
  // learner is likely to make, so a wrong answer is diagnostic.
  for (const w of words) {
    if (w.toneNumbers.length !== 2) continue;
    const [a, b] = w.toneNumbers;
    if (a === 4 && b === 4) {
      drills.push({
        id: `t4-t4:${w.id}`,
        contrast: 't4-t4',
        word: w,
        options: [
          [4, 4],
          [4, 1],
        ],
        answer: [4, 4],
      });
    } else if (a === 3 && b === 3) {
      drills.push({
        id: `t3-sandhi:${w.id}`,
        contrast: 't3-sandhi',
        word: w,
        // The written tones are 3+3; the spoken form is 2+3. Both are shown
        // because knowing which one you say is the entire point.
        options: [
          [2, 3],
          [3, 3],
        ],
        answer: [2, 3],
      });
    } else if ((a === 2 && b === 3) || (a === 3 && b === 2)) {
      drills.push({
        id: `t2-t3:${w.id}`,
        contrast: 't2-t3',
        word: w,
        options: [
          [a, b],
          [b, a],
        ],
        answer: [a, b],
      });
    }
  }

  return drills;
}

/**
 * Draws a weighted session.
 *
 * Sampling by `CONTRAST_WEIGHT` rather than uniformly is what makes this a
 * Vietnamese-specific trainer instead of a generic one.
 */
export function drawSession(
  drills: ToneDrill[],
  size: number,
  random: () => number = Math.random,
): ToneDrill[] {
  const byContrast = new Map<ToneContrast, ToneDrill[]>();
  for (const d of drills) {
    const list = byContrast.get(d.contrast) ?? [];
    list.push(d);
    byContrast.set(d.contrast, list);
  }
  for (const list of byContrast.values()) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  const pool: ToneContrast[] = [];
  for (const [contrast, weight] of Object.entries(CONTRAST_WEIGHT) as [ToneContrast, number][]) {
    if (!byContrast.get(contrast)?.length) continue;
    for (let i = 0; i < weight; i++) pool.push(contrast);
  }
  if (pool.length === 0) return [];

  const out: ToneDrill[] = [];
  const cursor = new Map<ToneContrast, number>();
  let guard = 0;
  while (out.length < size && guard++ < size * 20) {
    const contrast = pool[Math.floor(random() * pool.length)];
    const list = byContrast.get(contrast);
    if (!list?.length) continue;
    const at = cursor.get(contrast) ?? 0;
    if (at >= list.length) continue; // exhausted; other contrasts still fill
    out.push(list[at]);
    cursor.set(contrast, at + 1);
  }
  return out;
}
