/**
 * A lesson: the one daily flow that replaced separate review and build
 * sessions, after a week of real use showed words met only as flashcards were
 * crammed for the goal and gone the next day.
 *
 * A lesson takes a few new words through several kinds of practice, the way
 * Duolingo does, and uses them in phrases and sentences built only from words
 * already met:
 *
 *   1. Warm-up: word cards that are due, and the next card of words already
 *      started. These are real reviews, graded into FSRS.
 *   2. Each new word taught, then picked out at once: by picture, meaning or
 *      sound. Multiple choice, deliberately, for a word met seconds ago.
 *   3. Matching pairs over the lesson's words.
 *   4. Phrases and sentences built from tiles, from English or from sound, and
 *      read back into English, interleaved with each new word's pinyin typed
 *      from its characters: the first FSRS test of the new word.
 *
 * Mistakes come back at the end of the lesson. Only warm-ups, the new words'
 * typed recall and due sentence cards touch the schedule; the rest is
 * scaffolding, so getting it wrong costs nothing but a retry.
 *
 * Pure, like lib/srs.ts: the session view does the loading and saving.
 */
import type { Word } from './hanviet';
import type { WordStatus } from './reader';
import type { Sentence, SentenceTile } from './sentences';
import { cardId, State, type ReviewCard } from './srs';

export type LessonLength = 'short' | 'normal' | 'long';

export const LESSON_LENGTHS: readonly LessonLength[] = ['short', 'normal', 'long'];

interface Shape {
  newWords: number;
  warmUp: number;
  sentences: number;
}

/** About 3, 5 and 8 minutes. */
export const LESSON_SHAPE: Record<LessonLength, Shape> = {
  short: { newWords: 3, warmUp: 2, sentences: 2 },
  normal: { newWords: 5, warmUp: 3, sentences: 3 },
  long: { newWords: 6, warmUp: 6, sentences: 5 },
};

export type ChooseMode = 'picture' | 'meaning' | 'listen';

export type Step =
  /** Teaching card. Grades the word's recognition card Good, as the old teaching card did. */
  | { kind: 'intro'; wordId: string; cardId: string }
  /** Pick the word out of four: by its picture and meaning, by its characters' meaning, or by ear. */
  | { kind: 'choose'; wordId: string; mode: ChooseMode; options: string[] }
  | { kind: 'match'; wordIds: string[] }
  /** A word card, graded into FSRS. */
  | { kind: 'recall'; cardId: string }
  /** Hear the word, type its pinyin. */
  | { kind: 'listen'; wordId: string }
  /** Build the Chinese from tiles, prompted by its English or by its sound. `cardId` for a due sentence card. */
  | { kind: 'build'; sentence: Sentence; prompt: 'meaning' | 'audio'; distractors: SentenceTile[]; cardId?: string }
  /** Read the Chinese, build its English from word tiles. */
  | { kind: 'translate'; sentence: Sentence; distractors: string[] };

export interface LessonInput<C extends ReviewCard> {
  words: Map<string, Word>;
  /** Drillable word cards, and sentence cards. */
  cards: C[];
  status: Map<string, WordStatus>;
  /** Order of introduction, lower first: lib/intake's ranker. */
  rank: (wordId: string) => number;
  /** New words today's cap still allows. */
  newAllowance: number;
  /** Phrases and sentences to build, in the shape the tile builder takes. */
  sentences: Sentence[];
  /** Ids of sentences used in recent lessons, so the pool rotates. */
  recent: Set<string>;
  emoji: Record<string, string>;
  length: LessonLength;
  now?: Date;
  random?: () => number;
}

export interface Lesson {
  steps: Step[];
  newWordIds: string[];
}

/** A word's next card is not met within this many hours of its last review. */
const SIBLING_COOLDOWN_HOURS = 12;
const SIBLING_ORDER: Record<string, number> = { typing: 0, hanviet: 1 };

/** Sentence ids that are generated phrases: `P:<wordId>:<n>`. */
export const isPhrase = (s: Sentence) => s.id.startsWith('P:');

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** English word tiles: lower case, punctuation off, contractions kept whole. */
export function englishTiles(text: string): string[] {
  return text
    .replace(/[.,!?;:"“”()]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^'+|'+$/g, '').toLowerCase())
    .filter(Boolean);
}

/** The deck word a tile stands for: its own id. */
const tileWords = (s: Sentence) => s.tiles.map((t) => t.wordId).filter((id): id is string => id !== null);

export function planLesson<C extends ReviewCard>(input: LessonInput<C>): Lesson {
  const { words, cards, status, rank, emoji } = input;
  const now = input.now ?? new Date();
  const random = input.random ?? Math.random;
  const shape = LESSON_SHAPE[input.length];

  const wordCards = cards.filter((c) => c.cardType !== 'sentence' && !c.suspended);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const started = new Set(wordCards.filter((c) => c.state !== State.New).map((c) => c.wordId));
  const cutoff = now.getTime() - SIBLING_COOLDOWN_HOURS * 3_600_000;
  const cooling = new Set(
    wordCards
      .filter(
        (c) =>
          c.state === State.Learning ||
          c.state === State.Relearning ||
          (c.lastReview !== undefined && new Date(c.lastReview).getTime() > cutoff),
      )
      .map((c) => c.wordId),
  );

  // 1. Warm-up: most overdue first, one card per word. A big backlog takes
  // over the lesson: more reviews, fewer new words, so it can be cleared.
  const due = wordCards
    .filter((c) => c.state !== State.New && c.due.getTime() <= now.getTime())
    .sort((a, b) => a.due.getTime() - b.due.getTime());
  const backlog = due.length > shape.warmUp * 3;
  const warmCount = backlog ? shape.warmUp * 2 : shape.warmUp;
  const warm: C[] = [];
  const inLesson = new Set<string>();
  for (const c of due) {
    if (warm.length >= warmCount) break;
    if (inLesson.has(c.wordId)) continue;
    inLesson.add(c.wordId);
    warm.push(c);
  }
  // Then a started word's next card type, a day after its last review.
  if (warm.length < warmCount) {
    const siblings = wordCards
      .filter((c) => c.state === State.New && started.has(c.wordId) && !cooling.has(c.wordId) && !inLesson.has(c.wordId))
      .sort((a, b) => (SIBLING_ORDER[a.cardType] ?? 9) - (SIBLING_ORDER[b.cardType] ?? 9) || rank(a.wordId) - rank(b.wordId));
    for (const c of siblings) {
      if (warm.length >= warmCount) break;
      if (inLesson.has(c.wordId)) continue;
      inLesson.add(c.wordId);
      warm.push(c);
    }
  }

  // 2. New words, in intake order.
  const newCount = Math.min(backlog ? 2 : shape.newWords, input.newAllowance);
  const fresh = [...new Set(wordCards.filter((c) => c.cardType === 'recognition' && c.state === State.New).map((c) => c.wordId))]
    .filter((id) => !started.has(id) && words.has(id) && byId.has(cardId(id, 'typing')))
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, newCount);
  const freshSet = new Set(fresh);

  // Words the learner can be asked to read: met before, or met in this lesson.
  const known = new Set([...status].filter(([, s]) => s !== 'new').map(([id]) => id));
  for (const id of fresh) known.add(id);
  const learning = [...status].filter(([id, s]) => s === 'learning' && !freshSet.has(id)).map(([id]) => id);
  const knownList = [...known];

  /** Wrong answers for a choice: other lesson words first, then words already met, then the next to come. */
  const distractorsFor = (target: string, mode: ChooseMode): string[] => {
    const word = words.get(target);
    const clash = (id: string) => {
      const w = words.get(id);
      if (!w || !word || id === target) return true;
      if (w.simplified === word.simplified) return true;
      if (mode === 'listen' && w.pinyin.replace(/\s/g, '') === word.pinyin.replace(/\s/g, '')) return true;
      return (w.enGloss ?? '').split(';')[0].trim() === (word.enGloss ?? '').split(';')[0].trim();
    };
    const pools = [
      shuffle(fresh, random),
      shuffle(learning, random),
      shuffle(knownList, random),
      [...words.keys()].filter((id) => !known.has(id)).sort((a, b) => rank(a) - rank(b)).slice(0, 40),
    ];
    const out: string[] = [];
    for (const pool of pools) {
      for (const id of pool) {
        if (out.length >= 3) break;
        if (!clash(id) && !out.includes(id) && !out.some((o) => words.get(o)?.simplified === words.get(id)?.simplified)) out.push(id);
      }
    }
    return shuffle([target, ...out], random);
  };

  const steps: Step[] = [];
  for (const c of warm) steps.push({ kind: 'recall', cardId: c.id });

  // A due sentence card, rebuilt from tiles.
  const sentenceById = new Map(input.sentences.map((s) => [s.id, s]));
  const dueSentence = cards
    .filter((c) => c.cardType === 'sentence' && !c.suspended && c.state !== State.New && c.due.getTime() <= now.getTime())
    .sort((a, b) => a.due.getTime() - b.due.getTime())
    .find((c) => sentenceById.has(c.wordId));

  // 3. Teach each new word, then have it picked out at once.
  const modes: ChooseMode[] = ['meaning', 'listen'];
  fresh.forEach((id, i) => {
    steps.push({ kind: 'intro', wordId: id, cardId: cardId(id, 'recognition') });
    const mode: ChooseMode = emoji[id] ? 'picture' : modes[i % modes.length];
    steps.push({ kind: 'choose', wordId: id, mode, options: distractorsFor(id, mode) });
  });

  // 4. Matching pairs: this lesson's words, topped up with ones being learned.
  const matchWords = [...fresh];
  for (const id of [...warm.map((c) => c.wordId), ...shuffle(learning, random)]) {
    if (matchWords.length >= 5) break;
    const w = words.get(id);
    if (w && !matchWords.includes(id) && !matchWords.some((m) => words.get(m)?.simplified === w.simplified)) matchWords.push(id);
  }
  if (matchWords.length >= 3) steps.push({ kind: 'match', wordIds: shuffle(matchWords, random) });

  // Hearing a word and typing it: one lesson word, by ear.
  const heard = fresh[fresh.length - 1] ?? warm.find((c) => c.cardType !== 'recognition')?.wordId;
  if (heard) steps.push({ kind: 'listen', wordId: heard });

  // 5. Phrases and sentences that use only words already met, preferring ones
  // that use this lesson's words, then words still being learned.
  const learningSet = new Set(learning);
  const warmWords = new Set(warm.map((c) => c.wordId));
  const eligible = input.sentences.filter((s) => {
    if (s.tiles.length < 2 || !s.enGloss) return false;
    if (dueSentence && s.id === dueSentence.wordId) return false;
    return tileWords(s).every((id) => known.has(id));
  });
  const covered = new Map<string, number>();
  const picked: Sentence[] = [];
  const wanted = shape.sentences + (fresh.length === 0 ? 2 : 0);
  const pool = [...eligible];
  while (picked.length < wanted && pool.length) {
    let best = -1;
    let bestScore = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const s = pool[i];
      const ids = new Set(tileWords(s));
      let score = random() * 2 - s.tiles.length * 0.4;
      for (const id of ids) {
        if (freshSet.has(id)) score += (covered.get(id) ?? 0) === 0 ? 12 : 3;
        else if (warmWords.has(id)) score += 4;
        else if (learningSet.has(id)) score += 2;
      }
      // A word met a minute ago is easiest to use first in a short phrase.
      if (isPhrase(s) && fresh.length) score += 2;
      if (input.recent.has(s.id)) score -= 20;
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    }
    const [s] = pool.splice(best, 1);
    picked.push(s);
    for (const id of tileWords(s)) covered.set(id, (covered.get(id) ?? 0) + 1);
  }

  const knownTiles = (s: Sentence, count: number): SentenceTile[] => {
    const own = new Set(s.tiles.map((t) => t.text));
    const lengths = new Set(s.tiles.map((t) => [...t.text].length));
    const options = shuffle(
      knownList.map((id) => words.get(id)!).filter((w) => w && ![...own].some((o) => o.includes(w.simplified) || w.simplified.includes(o))),
      random,
    ).sort((a, b) => Number(!lengths.has([...a.simplified].length)) - Number(!lengths.has([...b.simplified].length)));
    return options.slice(0, count).map((w) => ({ text: w.simplified, pinyin: w.pinyin, wordId: w.id }));
  };
  const englishDistractors = (s: Sentence): string[] => {
    const own = new Set(englishTiles(s.enGloss));
    const others = shuffle(
      [...new Set(eligible.filter((o) => o.id !== s.id).flatMap((o) => englishTiles(o.enGloss)))].filter((w) => !own.has(w)),
      random,
    );
    return others.slice(0, own.size <= 3 ? 2 : 3);
  };

  const sentenceSteps: Step[] = picked.map((s, i) => {
    const kind = i % 3;
    // Reading back into English needs an English short enough to build.
    if (kind === 2 && englishTiles(s.enGloss).length <= 8) {
      return { kind: 'translate', sentence: s, distractors: englishDistractors(s) };
    }
    return {
      kind: 'build',
      sentence: s,
      prompt: kind === 1 ? 'audio' : 'meaning',
      distractors: knownTiles(s, s.tiles.length <= 3 ? 1 : 2),
    };
  });
  if (dueSentence) {
    const s = sentenceById.get(dueSentence.wordId)!;
    sentenceSteps.unshift({ kind: 'build', sentence: s, prompt: 'meaning', distractors: knownTiles(s, 2), cardId: dueSentence.id });
  }

  // Each new word's pinyin from its characters, spaced between the sentences.
  const recalls: Step[] = fresh.map((id) => ({ kind: 'recall', cardId: cardId(id, 'typing') }));
  const rest = Math.max(sentenceSteps.length, recalls.length);
  for (let i = 0; i < rest; i++) {
    if (sentenceSteps[i]) steps.push(sentenceSteps[i]);
    if (recalls[i]) steps.push(recalls[i]);
  }

  return { steps, newWordIds: fresh };
}
