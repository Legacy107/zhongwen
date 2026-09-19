import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { Word } from './hanviet';
import { bareSyllables, buildToneDrills, CONTRAST_WEIGHT, drawSession } from './tones';

const words: Word[] = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '..', 'data', 'words.json'), 'utf8'),
);
const l1 = words.filter((w) => w.level === '1' || w.level === 'S');

test('bareSyllables strips tone marks', () => {
  assert.equal(bareSyllables('huā'), 'hua');
  assert.equal(bareSyllables('shuǐ guǒ'), 'shuiguo');
  // ü is not a tone mark: lǜ and lù are different syllables and must not
  // collapse into a false minimal pair.
  assert.equal(bareSyllables('lǜ'), 'lü');
  assert.notEqual(bareSyllables('lǜ'), bareSyllables('lù'));
});

test('builds drills for every contrast from the real deck', () => {
  const drills = buildToneDrills(l1);
  const kinds = new Set(drills.map((d) => d.contrast));
  for (const c of Object.keys(CONTRAST_WEIGHT)) {
    assert.ok(kinds.has(c as never), `no drills for ${c}`);
  }
});

test('T1/T4 drills are genuine minimal pairs', () => {
  const drills = buildToneDrills(l1).filter((d) => d.contrast === 't1-t4');
  assert.ok(drills.length > 0);
  for (const d of drills) {
    assert.ok(d.foil, 'a minimal pair needs a foil');
    assert.equal(
      bareSyllables(d.word.pinyin),
      bareSyllables(d.foil!.pinyin),
      'pair must share syllables',
    );
    assert.notDeepEqual(d.word.toneNumbers, d.foil!.toneNumbers);
    assert.ok(d.options.some((o) => o[0] === d.answer[0]), 'answer must be offered');
  }
});

test('third-tone sandhi teaches the spoken form, not the written one', () => {
  const drills = buildToneDrills(l1).filter((d) => d.contrast === 't3-sandhi');
  assert.ok(drills.length > 0, 'deck should contain 水果/哪里 etc.');
  for (const d of drills) {
    assert.deepEqual(d.word.toneNumbers, [3, 3], 'source word is written 3+3');
    assert.deepEqual(d.answer, [2, 3], 'but is said 2+3');
  }
});

test('T4+T4 offers the drift-to-tone-1 error as the wrong option', () => {
  const drills = buildToneDrills(l1).filter((d) => d.contrast === 't4-t4');
  assert.ok(drills.length > 0);
  for (const d of drills) {
    assert.deepEqual(d.answer, [4, 4]);
    assert.ok(
      d.options.some((o) => o[0] === 4 && o[1] === 1),
      'the likely error must be selectable, or a wrong answer is not diagnostic',
    );
  }
});

test('sessions are weighted toward the Vietnamese error profile', () => {
  const drills = buildToneDrills(l1);
  // Deterministic PRNG so the assertion is stable.
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const counts = new Map<string, number>();
  for (let run = 0; run < 60; run++) {
    for (const d of drawSession(drills, 10, rand)) {
      counts.set(d.contrast, (counts.get(d.contrast) ?? 0) + 1);
    }
  }
  const t1t4 = counts.get('t1-t4') ?? 0;
  const t2t3 = counts.get('t2-t3') ?? 0;
  assert.ok(t1t4 > t2t3, `t1-t4 (${t1t4}) should outweigh t2-t3 (${t2t3})`);
});

test('a session never repeats a drill', () => {
  const drills = buildToneDrills(l1);
  const session = drawSession(drills, 12);
  assert.equal(new Set(session.map((d) => d.id)).size, session.length);
});
