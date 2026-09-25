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
