import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeRetention, countKnownWords, levelTargets, projectTarget } from './progress';
import { State } from './srs';

test('level targets are cumulative', () => {
  const t = levelTargets({ '1': 500, '2': 772, '3': 973 });
  assert.equal(t[0].words, 500);
  assert.equal(t[1].words, 1272);
  assert.equal(t[2].words, 2245);
});

test('retention counts Again as a lapse and everything else as a pass', () => {
  const now = new Date(2026, 8, 19);
  const r = computeRetention(
    [
      { rating: 1, reviewedAt: now }, // Again
      { rating: 3, reviewedAt: now }, // Good
      { rating: 3, reviewedAt: now },
      { rating: 4, reviewedAt: now }, // Easy
    ],
    now,
  );
  assert.equal(r.reviews, 4);
  assert.equal(r.retention, 0.75);
});

test('retention is null with no history rather than 0 or 1', () => {
  assert.equal(computeRetention([]).retention, null);
});

test('a word counts as known only when all its cards are in Review', () => {
  const cards = [
    { wordId: 'w1', cardType: 'recognition', state: State.Review },
    { wordId: 'w1', cardType: 'typing', state: State.Review },
    { wordId: 'w1', cardType: 'hanviet', state: State.Review },
    { wordId: 'w2', cardType: 'recognition', state: State.Review },
    { wordId: 'w2', cardType: 'typing', state: State.Learning }, // not yet
  ];
  assert.equal(countKnownWords(cards), 1);
});

test('sentence cards do not count toward known words', () => {
  const cards = [
    { wordId: 'S1-001-1', cardType: 'sentence', state: State.Review },
    { wordId: 'w1', cardType: 'recognition', state: State.Review },
  ];
  assert.equal(countKnownWords(cards), 1, 'only w1 counts');
});

test('projection refuses to give a date from thin history', () => {
  const now = new Date(2026, 8, 19);
  const threeDaysAgo = new Date(now);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const p = projectTarget(30, 500, threeDaysAgo, now);
  assert.equal(p.date, null, 'under a week of data cannot support a date');
  assert.ok(p.perDay > 0, 'but the rate is still reported');
});

test('projection gives a future date once there is enough history', () => {
  const now = new Date(2026, 8, 19);
  const start = new Date(now);
  start.setDate(start.getDate() - 30); // 30 days, 300 words -> 10/day
  const p = projectTarget(300, 500, start, now);
  assert.ok(p.date, 'should project');
  assert.equal(p.remaining, 200);
  assert.ok(p.date! > now, 'date must be in the future');
  // 200 remaining at 10/day is about 20 days out.
  const days = (p.date!.getTime() - now.getTime()) / 86_400_000;
  assert.ok(days > 15 && days < 25, `expected ~20 days, got ${days.toFixed(1)}`);
});

test('a met target projects zero remaining', () => {
  const now = new Date(2026, 8, 19);
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  assert.equal(projectTarget(600, 500, start, now).remaining, 0);
});

test('characters are counted once across words', async () => {
  const { charactersOf } = await import('./progress');
  const chars = charactersOf([{ chars: ['知', '道'] }, { chars: ['道', '理'] }]);
  assert.deepEqual([...chars].sort(), ['理', '知', '道'].sort());
});

test('character targets accumulate by level, folding the supplement into HSK 1', async () => {
  const { characterTargets } = await import('./progress');
  const targets = characterTargets([
    { level: '1', chars: ['你', '好'] },
    { level: 'S', chars: ['越', '南'] },
    { level: '2', chars: ['好', '像'] },
  ]);
  assert.deepEqual(
    targets.slice(0, 3).map((t) => t.chars),
    [4, 5, 5],
  );
});

test('levels are counted on their own, not cumulatively', async () => {
  const { wordsByLevel, charactersByLevel } = await import('./progress');
  const words = [
    { id: 'a', level: '1', chars: ['你', '好'] },
    { id: 'b', level: 'S', chars: ['越'] },
    { id: 'c', level: '2', chars: ['好', '像'] },
  ];
  const byWord = wordsByLevel(words, (id) => id === 'a');
  assert.deepEqual(byWord.slice(0, 2).map((l) => [l.total, l.known]), [[2, 1], [1, 0]]);
  const byChar = charactersByLevel(words, new Set(['你', '好']));
  assert.deepEqual(byChar.slice(0, 2).map((l) => [l.total, l.known]), [[3, 2], [1, 0]], '好 counts at HSK 1 only');
});
