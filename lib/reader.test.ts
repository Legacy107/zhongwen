import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { Word } from './hanviet';
import { newCardRanker } from './intake';
import {
  drawReadingSession,
  encodeSentence,
  parseSentence,
  planReading,
  unknownWords,
  wordStatuses,
  type ReaderSentence,
  type ReaderShard,
} from './reader';
import { buildQueue, newCard, State } from './srs';

const DATA = path.resolve(import.meta.dirname, '..', 'data');

function sentence(id: string, hanzi: string, wordIds: string[]): ReaderSentence {
  return {
    id,
    hanzi,
    en: '',
    level: '1',
    author: '',
    tokens: wordIds.map((w, i) => ({ text: hanzi[i] ?? '字', pinyin: 'x', wordId: w })),
  };
}

function card(wordId: string, cardType: string, state: number) {
  return { wordId, cardType, state };
}

test('a word is new until reviewed, learning until every card graduates', () => {
  const status = wordStatuses([
    card('a', 'recognition', State.New),
    card('a', 'typing', State.New),
    card('b', 'recognition', State.Review),
    card('b', 'typing', State.Learning),
    card('c', 'recognition', State.Review),
    card('c', 'typing', State.Review),
    card('S1', 'sentence', State.Review),
  ]);
  assert.equal(status.get('a'), 'new');
  assert.equal(status.get('b'), 'learning');
  assert.equal(status.get('c'), 'known');
  assert.equal(status.has('S1'), false, 'sentence cards are not words');
});

test('sentences sort into readable, one-new-word and two-new-word bands', () => {
  const status = new Map([
    ['a', 'known' as const],
    ['b', 'learning' as const],
    ['c', 'new' as const],
    ['d', 'new' as const],
  ]);
  const plan = planReading(
    [
      sentence('T1', '甲乙', ['a', 'b']),
      sentence('T2', '甲丙', ['a', 'c']),
      sentence('T3', '丙丁', ['c', 'd']),
      sentence('T4', '丙甲乙', ['c', 'a', 'b']),
    ],
    status,
  );
  assert.deepEqual(plan.easy.map((s) => s.id), ['T1']);
  assert.deepEqual(plan.onePlus.map((s) => s.id), ['T2', 'T4'], 'shorter first');
  assert.deepEqual(plan.twoPlus.map((s) => s.id), ['T3']);
  assert.deepEqual(plan.unlockers, [{ wordId: 'c', sentences: 2 }]);
});

test('a repeated new word counts once', () => {
  const status = new Map([['a', 'new' as const]]);
  assert.deepEqual(unknownWords(sentence('T1', '甲甲', ['a', 'a']), status), ['a']);
});

test('a session caps how many sentences share one new word', () => {
  const status = new Map([
    ['k', 'known' as const],
    ['n', 'new' as const],
  ]);
  const many = Array.from({ length: 10 }, (_, i) => sentence(`T${i}`, '甲乙', ['k', 'n']));
  const plan = planReading(many, status);
  const session = drawReadingSession(plan, status, 8, () => 0.5);
  assert.equal(session.length, 2, 'at most two sentences per new word');
});

test('a session mixes in easy sentences, spread through it', () => {
  const status = new Map<string, 'known' | 'new'>([['k', 'known']]);
  const pool: ReaderSentence[] = [];
  for (let i = 0; i < 20; i++) {
    status.set(`n${i}`, 'new');
    pool.push(sentence(`N${i}`, '甲乙', ['k', `n${i}`]));
    pool.push(sentence(`E${i}`, '甲', ['k']));
  }
  const session = drawReadingSession(planReading(pool, status), status, 8);
  assert.equal(session.length, 8);
  const easy = session.map((s, i) => (s.id.startsWith('E') ? i : -1)).filter((i) => i >= 0);
  assert.equal(easy.length, 2);
  assert.ok(easy[0] < 6, 'easy sentences are not all left at the end');
});

test('sentences round-trip through the compact wire format', () => {
  const s: ReaderSentence = {
    id: 'T42',
    hanzi: '汤姆们，好！',
    en: 'Hi, Toms!',
    level: '1',
    author: 'someone',
    tokens: [
      { text: '汤姆', pinyin: 'Tāngmǔ', free: { kind: 'name', gloss: 'Tom' } },
      { text: '们', pinyin: 'men', free: { kind: 'particle', gloss: 'plural' } },
      { text: '，', pinyin: '' },
      { text: '好', pinyin: 'hǎo', wordId: 'L1-0001' },
      { text: '！', pinyin: '' },
    ],
  };
  assert.deepEqual(parseSentence(encodeSentence(s)), s);
});

test('new words come mined first, then by level, then by frequency', () => {
  const words = new Map<string, Word>(
    [
      ['w1', '1'],
      ['w2', '1'],
      ['w3', '2'],
      ['w4', '2'],
    ].map(([id, level]) => [id, { id, level } as Word]),
  );
  const rank = newCardRanker(
    words,
    { w1: 1, w2: 50, w3: 900, w4: 5 },
    new Map([['w4', { wordId: 'w4', at: '2026-09-01T00:00:00Z' }]]),
  );
  const cards = ['w1', 'w2', 'w3', 'w4'].map((id) => newCard(id, 'recognition'));
  const queue = buildQueue(cards, new Date(), { rankNew: rank });
  assert.deepEqual(
    queue.map((c) => c.wordId),
    ['w4', 'w2', 'w1', 'w3'],
    'mined w4, then HSK 1 by frequency, then HSK 2',
  );
});

test('shipped corpus: every token is covered and rejoins to the sentence', () => {
  const words = new Set(
    (JSON.parse(readFileSync(path.join(DATA, 'words.json'), 'utf8')) as Word[]).map((w) => w.id),
  );
  let checked = 0;
  for (const level of ['1', '2', '3', '4', '5', '6']) {
    const shard = JSON.parse(
      readFileSync(path.join(DATA, 'reader', `L${level}.json`), 'utf8'),
    ) as ReaderShard;
    assert.ok(shard.sentences.length > 500, `HSK ${level} shard is suspiciously small`);
    for (const wire of shard.sentences) {
      const s = parseSentence(wire);
      assert.equal(s.tokens.map((t) => t.text).join(''), s.hanzi, `${s.id} does not rejoin`);
      for (const t of s.tokens) {
        if (!/\p{Script=Han}/u.test(t.text)) continue;
        assert.ok(t.wordId || t.free, `${s.id}: ${t.text} is neither a deck word nor glossed`);
        if (t.wordId) assert.ok(words.has(t.wordId), `${s.id}: ${t.wordId} not in the deck`);
        assert.ok(t.pinyin, `${s.id}: ${t.text} has no pinyin`);
      }
      assert.ok(s.en, `${s.id} has no English`);
      checked++;
    }
  }
  assert.ok(checked > 5000);
});

test('shipped corpus: pinyin is read in context, not in isolation', () => {
  const shard = JSON.parse(readFileSync(path.join(DATA, 'reader', 'L1.json'), 'utf8')) as ReaderShard;
  const all = shard.sentences.map(parseSentence);
  const reading = (text: string) =>
    new Set(all.flatMap((s) => s.tokens.filter((t) => t.text === text).map((t) => t.pinyin)));
  assert.deepEqual([...reading('吗')], ['ma']);
  assert.ok(!reading('了').has('liǎo') || reading('了').has('le'), '了 is mostly le');
  assert.ok(reading('了').has('le'));
  assert.ok(!reading('谁').has('shuí'), '谁 uses the HSK reading shéi');
});
