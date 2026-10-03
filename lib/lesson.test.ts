import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Word } from './hanviet';
import { englishTiles, planLesson, type LessonInput, type Step } from './lesson';
import type { WordStatus } from './reader';
import type { Sentence } from './sentences';
import { cardId, newCard, seedKnownCard, State, type ReviewCard } from './srs';

const NOW = new Date('2026-10-03T09:00:00Z');

const word = (id: string, simplified: string, en: string): Word =>
  ({ id, simplified, pinyin: id, enGloss: en, level: '1', toneNumbers: [1] }) as unknown as Word;

const WORDS = [
  word('wo', '我', 'I'),
  word('ni', '你', 'you'),
  word('hao', '好', 'good'),
  word('he', '喝', 'to drink'),
  word('cha', '茶', 'tea'),
  word('shui', '水', 'water'),
  word('xiang', '想', 'to want'),
  word('chi', '吃', 'to eat'),
];
const words = new Map(WORDS.map((w) => [w.id, w]));

/** Every word's three cards, new, except `knownIds`, whose cards are in review and due as given. */
function deck(knownIds: string[], dueInDays = 1): ReviewCard[] {
  const out: ReviewCard[] = [];
  for (const w of WORDS) {
    for (const t of ['recognition', 'typing', 'hanviet'] as const) {
      out.push(
        knownIds.includes(w.id)
          ? { ...seedKnownCard(w.id, t, 3, new Date(NOW.getTime() - 4 * 86_400_000)), due: new Date(NOW.getTime() + dueInDays * 86_400_000) }
          : newCard(w.id, t, NOW),
      );
    }
  }
  return out;
}

const statusOf = (cards: ReviewCard[]) => {
  const status = new Map<string, WordStatus>();
  for (const c of cards) if (c.state !== State.New) status.set(c.wordId, 'known');
  for (const w of WORDS) if (!status.has(w.id)) status.set(w.id, 'new');
  return status;
};

const sentence = (id: string, tiles: Array<[string, string | null]>, en: string): Sentence => ({
  id,
  hanzi: tiles.map(([t]) => t).join(''),
  pinyin: '',
  modelPinyin: '',
  enGloss: en,
  viGloss: '',
  grammarPointNo: 0,
  level: '1',
  tiles: tiles.map(([text, wordId]) => ({ text, pinyin: 'x', wordId })),
});

const SENTENCES = [
  sentence('P:cha:0', [['喝', 'he'], ['茶', 'cha']], 'drink tea'),
  sentence('T1', [['我', 'wo'], ['想', 'xiang'], ['喝', 'he'], ['水', 'shui']], 'I want to drink water.'),
  sentence('T2', [['你', 'ni'], ['好', 'hao']], 'Hello.'),
  sentence('T3', [['我', 'wo'], ['吃', 'chi']], 'I eat.'),
  sentence('T9', [['熊猫', null], ['吃', 'chi']], 'The panda eats.'),
];

function input(cards: ReviewCard[], over: Partial<LessonInput<ReviewCard>> = {}): LessonInput<ReviewCard> {
  const order = WORDS.map((w) => w.id);
  let seed = 1;
  return {
    words,
    cards,
    status: statusOf(cards),
    rank: (id) => order.indexOf(id),
    newAllowance: 20,
    sentences: SENTENCES,
    recent: new Set(),
    emoji: { cha: '🍵' },
    length: 'normal',
    now: NOW,
    random: () => ((seed = (seed * 16807) % 2147483647) / 2147483647),
    ...over,
  };
}

const kinds = (steps: Step[]) => steps.map((s) => s.kind);

test('new words are taught, then picked out, before anything tests them', () => {
  const cards = deck(['wo', 'ni', 'hao']);
  const lesson = planLesson(input(cards));
  assert.deepEqual(lesson.newWordIds, ['he', 'cha', 'shui', 'xiang', 'chi']);
  for (const id of lesson.newWordIds) {
    const intro = lesson.steps.findIndex((s) => s.kind === 'intro' && s.wordId === id);
    const choose = lesson.steps.findIndex((s) => s.kind === 'choose' && s.wordId === id);
    const recall = lesson.steps.findIndex((s) => s.kind === 'recall' && s.cardId === cardId(id, 'typing'));
    assert.ok(intro >= 0 && intro < choose && choose < recall, id);
  }
  const tea = lesson.steps.find((s) => s.kind === 'choose' && s.wordId === 'cha');
  assert.equal(tea?.kind === 'choose' && tea.mode, 'picture', 'a word with an emoji is picked by its picture');
  assert.ok(kinds(lesson.steps).includes('match'));
});

test('choices hold the word and three others, all different', () => {
  const lesson = planLesson(input(deck(['wo', 'ni', 'hao'])));
  for (const s of lesson.steps) {
    if (s.kind !== 'choose') continue;
    assert.equal(s.options.length, 4);
    assert.equal(new Set(s.options).size, 4);
    assert.ok(s.options.includes(s.wordId));
  }
});

test('sentences use only words already met or met in this lesson', () => {
  const cards = deck(['wo']);
  const lesson = planLesson(input(cards, { length: 'short' }));
  const allowed = new Set(['wo', ...lesson.newWordIds]);
  const built = lesson.steps.flatMap((s) => (s.kind === 'build' || s.kind === 'translate' ? [s.sentence] : []));
  assert.ok(built.length > 0);
  for (const s of built) for (const t of s.tiles) assert.ok(t.wordId && allowed.has(t.wordId), `${s.id} uses ${t.text}`);
});

test('due cards warm the lesson up, most overdue first', () => {
  const cards = deck(['wo', 'ni', 'hao', 'he'], -1);
  cards.find((c) => c.id === cardId('hao', 'typing'))!.due = new Date(NOW.getTime() - 5 * 86_400_000);
  const lesson = planLesson(input(cards));
  assert.equal(lesson.steps[0].kind, 'recall');
  assert.equal(lesson.steps[0].kind === 'recall' && lesson.steps[0].cardId, cardId('hao', 'typing'));
  const warm = lesson.steps.slice(0, 3).map((s) => (s.kind === 'recall' ? s.cardId.split(':')[0] : null));
  assert.equal(new Set(warm).size, 3, 'one card per word');
});

test('a backlog trades new words for reviews', () => {
  const cards = deck(['wo', 'ni', 'hao', 'he', 'cha', 'shui'], -1);
  const many = planLesson(input(cards, { length: 'short' }));
  assert.ok(many.newWordIds.length <= 2);
  assert.ok(many.steps.filter((s) => s.kind === 'recall').length >= 4);
});

test("today's cap stops new words, and the lesson still has practice", () => {
  const cards = deck(['wo', 'ni', 'hao', 'he'], 3);
  const lesson = planLesson(input(cards, { newAllowance: 0 }));
  assert.deepEqual(lesson.newWordIds, []);
  assert.ok(!kinds(lesson.steps).includes('intro'));
  assert.ok(lesson.steps.length > 0);
});

test('a started word gets its next card a day after its last review, not sooner', () => {
  const cards = deck([], 1);
  const recog = cards.find((c) => c.id === cardId('wo', 'recognition'))!;
  Object.assign(recog, { state: State.Review, reps: 1, lastReview: new Date(NOW.getTime() - 2 * 3_600_000), due: new Date(NOW.getTime() + 86_400_000) });
  const soon = planLesson(input(cards));
  assert.ok(!soon.steps.some((s) => s.kind === 'recall' && s.cardId === cardId('wo', 'typing')));
  recog.lastReview = new Date(NOW.getTime() - 20 * 3_600_000);
  const later = planLesson(input(cards));
  assert.ok(later.steps.some((s) => s.kind === 'recall' && s.cardId === cardId('wo', 'typing')));
  assert.ok(!later.newWordIds.includes('wo'));
});

test('English tiles drop punctuation and case', () => {
  assert.deepEqual(englishTiles("I don't want tea, thanks!"), ['i', "don't", 'want', 'tea', 'thanks']);
});
