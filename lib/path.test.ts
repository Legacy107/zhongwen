import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Word } from './hanviet';
import { buildPath, pathWindow } from './path';
import type { WordStatus } from './reader';

function deck(n: number, level = '1'): Map<string, Word> {
  return new Map(
    Array.from({ length: n }, (_, i) => {
      const id = `w${String(i).padStart(2, '0')}`;
      return [id, { id, level } as Word];
    }),
  );
}

test('units follow frequency order, then id', () => {
  const words = deck(4);
  const path = buildPath(words, { w03: 9, w01: 5 }, new Map(), '1', 2);
  assert.deepEqual(path.units.map((u) => u.wordIds), [
    ['w03', 'w01'],
    ['w00', 'w02'],
  ]);
});

test('the current unit is the first with an unstudied word', () => {
  const words = deck(6);
  const status = new Map<string, WordStatus>([
    ['w00', 'known'],
    ['w01', 'learning'],
    ['w02', 'learning'],
  ]);
  const path = buildPath(words, {}, status, '1', 2);
  assert.equal(path.current, 1);
  assert.deepEqual(path.units.map((u) => u.state), ['done', 'current', 'locked']);
  assert.equal(path.units[1].started, 1);
  assert.equal(path.units[0].known, 1);
});

test('supplement words belong to HSK 1', () => {
  const words = new Map<string, Word>([
    ['a', { id: 'a', level: '1' } as Word],
    ['b', { id: 'b', level: 'S' } as Word],
    ['c', { id: 'c', level: '2' } as Word],
  ]);
  assert.equal(buildPath(words, {}, new Map(), '1').units[0].wordIds.length, 2);
});

test('a finished level has no current unit, and the window keeps the tail', () => {
  const words = deck(4);
  const status = new Map<string, WordStatus>([...words.keys()].map((id) => [id, 'learning']));
  const path = buildPath(words, {}, status, '1', 2);
  assert.equal(path.current, 2);
  assert.deepEqual(pathWindow(path).map((u) => u.index), [1]);
});

test('the window shows one unit behind and four ahead', () => {
  const path = buildPath(deck(30), {}, new Map([['w00', 'learning' as const], ['w01', 'learning' as const]]), '1', 2);
  assert.deepEqual(pathWindow(path).map((u) => u.index), [0, 1, 2, 3, 4, 5]);
});
