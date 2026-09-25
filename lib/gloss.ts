/**
 * Glosses as a learner should see them.
 *
 * CC-CEDICT is a dictionary, not a flashcard: 的 runs to about 400 characters,
 * references carry markup (跑堂兒的|跑堂儿的[pao3 tang2 r5 de5], 您[nin2],
 * CL:個|个[ge4]), and sense order follows no rule a beginner can use (在 leads
 * with "to exist"). HSK 1–2 have hand-written glosses (data/glosses.json);
 * everything else is cleaned up from the dictionary text here.
 */
import type { Word } from './hanviet';

/** Senses that are dictionary housekeeping rather than meaning. */
const NOISE = /^(surname\b|variant of|old variant|see also|see\s|used in\b|abbr\. for|also written|also pr\.|Taiwan pr\.|CL:|\(Tw\)|\(old\))/i;

const HANZI = '\\u3400-\\u9fff';

function cleanSense(sense: string): string {
  return (
    sense
      // Classifier notes, wherever they sit.
      .replace(/CL:[^;]*/g, '')
      // Pinyin references: 您[nin2] -> 您.
      .replace(/\[[^\]]*\]/g, '')
      // Traditional|simplified pairs: 個|个 -> 个.
      .replace(new RegExp(`[${HANZI}]+\\|([${HANZI}]+)`, 'g'), '$1')
      .replace(/\(\s*\)/g, '')
      .replace(/\s+/g, ' ')
      .replace(/\s+([,)])/g, '$1')
      .trim()
      .replace(/[,;:]$/, '')
  );
}

/** The first `n` meaningful senses of a raw dictionary gloss, cleaned. */
export function cleanGloss(raw: string | null | undefined, n = 3): string {
  if (!raw) return '';
  const senses: string[] = [];
  for (const part of raw.split(/;\s*/)) {
    if (NOISE.test(part.trim())) continue;
    const s = cleanSense(part);
    if (s && !senses.includes(s)) senses.push(s);
    if (senses.length >= n) break;
  }
  return senses.join('; ');
}

/** English for display: the curated gloss where one exists, else the cleaned dictionary one. */
export function glossEn(word: Pick<Word, 'enGloss'> & { enShort?: string }, n = 3): string {
  return word.enShort ?? cleanGloss(word.enGloss, n);
}

/** Vietnamese for display, on the same terms as glossEn. */
export function glossVi(word: Pick<Word, 'viGloss'> & { viShort?: string }, n = 3): string {
  return word.viShort ?? cleanGloss(word.viGloss, n);
}

/** Senses split at top-level semicolons, leaving any inside parentheses alone. */
function senses(gloss: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < gloss.length; i++) {
    if (gloss[i] === '(') depth++;
    else if (gloss[i] === ')') depth = Math.max(0, depth - 1);
    else if (gloss[i] === ';' && depth === 0) {
      out.push(gloss.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(gloss.slice(start).trim());
  return out.filter(Boolean);
}

/** True when the whole of `s` is one parenthesised group. */
function wrapped(s: string): boolean {
  if (!s.startsWith('(')) return false;
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')' && --depth === 0) return i === s.length - 1;
  }
  return false;
}

/**
 * A gloss short enough to sit under a word on a sentence tile: its first
 * sense without qualifiers, so 两 "two (before measure words)" reads "two".
 * A function word glossed only as a description, 了 "(completed action;
 * change of state)", reads "completed action".
 */
export function tileGloss(gloss: string): string {
  const first = senses(gloss)[0] ?? '';
  if (wrapped(first)) return (senses(first.slice(1, -1))[0] ?? '').split(':')[0].trim();
  const bare = first
    .replace(/^\([^()]*\)\s+/, '')
    .replace(/\s+\([^()]*\)$/, '')
    .trim();
  return bare || first;
}
