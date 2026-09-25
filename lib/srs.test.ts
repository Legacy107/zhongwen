import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildQueue, newCard, spreadSiblings, State, type ReviewCard } from './srs';

const now = new Date('2026-09-25T10:00:00Z');

function due(wordId: string, cardType: ReviewCard['cardType'], minutesAgo = 5): ReviewCard {
  return {
    ...newCard(wordId, cardType, now),
    state: State.Review,
    reps: 3,
    due: new Date(now.getTime() - minutesAgo * 60_000),
  };
}

test('a session introduces one new card per word', () => {
  const cards = ['a', 'b'].flatMap((w) =>
    (['hanviet', 'recognition', 'typing'] as const).map((t) => newCard(w, t, now)),
  );
  const q = buildQueue(cards, now, { newPerSession: 8 });
  assert.deepEqual(q.map((c) => c.id), ['a:hanviet', 'b:hanviet']);
});

test('a word already due gets no new sibling in the same session', () => {
  const q = buildQueue([due('a', 'recognition'), newCard('a', 'typing', now), newCard('b', 'typing', now)], now);
  assert.deepEqual(q.map((c) => c.id), ['a:recognition', 'b:typing']);
});

test('due reviews still all come first, most overdue leading', () => {
  const q = buildQueue([newCard('n', 'typing', now), due('a', 'typing', 5), due('b', 'typing', 50)], now);
  assert.deepEqual(q.map((c) => c.wordId), ['b', 'a', 'n']);
});

test('siblings due together are spread apart', () => {
  const q = spreadSiblings(
    [
      { wordId: 'a', id: 1 },
      { wordId: 'a', id: 2 },
      { wordId: 'b', id: 3 },
      { wordId: 'c', id: 4 },
      { wordId: 'd', id: 5 },
      { wordId: 'e', id: 6 },
    ],
    4,
  );
  assert.deepEqual(q.map((c) => c.id), [1, 3, 4, 5, 6, 2]);
});

test('spreading never drops or duplicates cards, even when it cannot keep the gap', () => {
  const q = spreadSiblings(['a', 'a', 'a', 'b'].map((wordId, id) => ({ wordId, id })), 4);
  assert.deepEqual(q.map((c) => c.id).sort(), [0, 1, 2, 3]);
});

test('a word reviewed in the last 12 hours gets no new sibling, so the next session brings new words', () => {
  const seen = { ...newCard('a', 'hanviet', now), state: State.Review, reps: 1, lastReview: new Date(now.getTime() - 3_600_000), due: new Date(now.getTime() + 86_400_000) };
  const old = { ...newCard('b', 'hanviet', now), state: State.Review, reps: 3, lastReview: new Date(now.getTime() - 2 * 86_400_000), due: new Date(now.getTime() + 86_400_000) };
  const q = buildQueue([seen, newCard('a', 'recognition', now), old, newCard('b', 'recognition', now), newCard('c', 'recognition', now)], now);
  assert.deepEqual(q.map((c) => c.id), ['b:recognition', 'c:recognition']);
});

test('a word still in learning gets no new sibling either', () => {
  const learning = { ...newCard('a', 'hanviet', now), state: State.Learning, reps: 1, lastReview: new Date(now.getTime() - 20 * 3_600_000), due: new Date(now.getTime() + 600_000) };
  const q = buildQueue([learning, newCard('a', 'recognition', now)], now);
  assert.deepEqual(q.map((c) => c.id), []);
});

test('the new-word limit caps words never studied, not later cards of started words', () => {
  const started = { ...newCard('a', 'hanviet', now), state: State.Review, reps: 3, lastReview: new Date(now.getTime() - 2 * 86_400_000), due: new Date(now.getTime() + 86_400_000) };
  const q = buildQueue([started, newCard('a', 'recognition', now), newCard('b', 'recognition', now), newCard('c', 'recognition', now)], now, { newWordLimit: 1 });
  assert.deepEqual(q.map((c) => c.id), ['a:recognition', 'b:recognition']);
});
