import assert from 'node:assert/strict';
import { test } from 'node:test';
import { computeStreak, dayKey } from './streak';

const NOW = new Date(2026, 8, 19, 20, 0, 0); // 19 Sep 2026, local
const GOAL = 10;

/** n reviews on the day `offset` days before NOW. */
function day(offset: number, n: number): Date[] {
  const d = new Date(NOW);
  d.setDate(d.getDate() - offset);
  d.setHours(12, 0, 0, 0);
  return Array.from({ length: n }, () => new Date(d));
}

test('empty history has no streak', () => {
  const s = computeStreak([], GOAL, NOW);
  assert.equal(s.current, 0);
  assert.equal(s.longest, 0);
  assert.equal(s.metToday, false);
});

test('meeting the goal today starts a streak of 1', () => {
  const s = computeStreak(day(0, GOAL), GOAL, NOW);
  assert.equal(s.current, 1);
  assert.equal(s.metToday, true);
  assert.equal(s.today, GOAL);
});

test('partial progress today does not count as met', () => {
  const s = computeStreak(day(0, GOAL - 1), GOAL, NOW);
  assert.equal(s.metToday, false);
  assert.equal(s.current, 0);
  assert.equal(s.today, GOAL - 1);
});

test('an unmet today does not break a streak still in progress', () => {
  // Yesterday and the day before were met; today has barely started.
  const s = computeStreak([...day(1, GOAL), ...day(2, GOAL), ...day(0, 1)], GOAL, NOW);
  assert.equal(s.current, 2, 'streak counts back from yesterday');
  assert.equal(s.metToday, false);
});

test('consecutive met days accumulate', () => {
  const ts = [0, 1, 2, 3, 4].flatMap((o) => day(o, GOAL));
  assert.equal(computeStreak(ts, GOAL, NOW).current, 5);
});

test('a single missed day is absorbed by the freeze', () => {
  // Met today, 1, then missed 2, then met 3 and 4.
  const ts = [0, 1, 3, 4].flatMap((o) => day(o, GOAL));
  const s = computeStreak(ts, GOAL, NOW);
  assert.equal(s.freezesUsed, 1);
  assert.equal(s.current, 4, 'four met days survive one gap');
});

test('two missed days in a row break the streak', () => {
  const ts = [0, 1, 4, 5].flatMap((o) => day(o, GOAL));
  const s = computeStreak(ts, GOAL, NOW);
  assert.equal(s.current, 2, 'only today and yesterday count');
  // The freeze is spent only when it actually bridges a gap. Here the day
  // beyond the gap was also missed, so the streak ends without using it.
  assert.equal(s.freezesUsed, 0);
});

test('a freeze cannot resurrect a streak that already ended', () => {
  // Nothing recent at all; a lone met day a week ago must not extend forward.
  const s = computeStreak(day(7, GOAL), GOAL, NOW);
  assert.equal(s.current, 0);
});

test('longest survives after the current streak breaks', () => {
  const old = [10, 11, 12, 13].flatMap((o) => day(o, GOAL));
  const recent = day(0, GOAL);
  const s = computeStreak([...old, ...recent], GOAL, NOW);
  assert.equal(s.current, 1);
  assert.ok(s.longest >= 4, `longest should hold the old run, got ${s.longest}`);
});

test('dayKey uses local time, not UTC', () => {
  // 23:30 local must belong to that local day even when UTC has rolled over.
  const late = new Date(2026, 8, 19, 23, 30);
  assert.equal(dayKey(late), '2026-09-19');
});

test('reviews late at night count toward the local day', () => {
  const late = new Date(2026, 8, 19, 23, 45);
  const ts = Array.from({ length: GOAL }, () => late);
  const s = computeStreak(ts, GOAL, new Date(2026, 8, 19, 23, 50));
  assert.equal(s.metToday, true);
  assert.equal(s.current, 1);
});
