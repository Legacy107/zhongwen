import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import {
  buildGapFill,
  GAP_MEASURE_WORDS,
  GAP_PARTICLES,
  GAP_READINGS,
  type Sentence,
} from './sentences';

const sentences: Sentence[] = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '..', 'data', 'sentences.json'), 'utf8'),
);

/** Deterministic PRNG so assertions are stable. */
function prng(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
}

test('derives a gap-fill from a sentence containing a particle', () => {
  const withLe = sentences.find((s) => s.tiles.some((t) => t.text === '了'))!;
  const gap = buildGapFill(withLe, prng(1));
  assert.ok(gap, 'should produce a gap');
  assert.equal(gap!.sentenceId, withLe.id);
  assert.equal(withLe.tiles[gap!.gapIndex].text, gap!.answer);
});

test('the answer is always among the options', () => {
  let checked = 0;
  for (const s of sentences) {
    const gap = buildGapFill(s, prng(s.id.length + 3));
    if (!gap) continue;
    assert.ok(gap.options.includes(gap.answer), `${s.hanzi}: answer missing from options`);
    checked++;
  }
  assert.ok(checked > 100, `expected many gap-fillable sentences, got ${checked}`);
});

test('distractors come from the same category as the answer', () => {
  for (const s of sentences) {
    const gap = buildGapFill(s, prng(11));
    if (!gap) continue;
    const category: readonly string[] = gap.isMeasureWord ? GAP_MEASURE_WORDS : GAP_PARTICLES;
    for (const o of gap.options) {
      assert.ok(
        category.includes(o),
        `${s.hanzi}: option "${o}" is not in the same category as "${gap.answer}"`,
      );
    }
  }
});

test('options are unique', () => {
  for (const s of sentences) {
    const gap = buildGapFill(s, prng(5));
    if (!gap) continue;
    assert.equal(new Set(gap.options).size, gap.options.length, `${s.hanzi}: duplicate options`);
  }
});

test('a sentence with no particle or measure word yields no gap', () => {
  const none: Sentence = {
    id: 'x',
    hanzi: '我很忙',
    pinyin: 'wǒ hěn máng',
    modelPinyin: 'wǒ hěn máng',
    enGloss: "I'm busy.",
    viGloss: 'Tôi bận.',
    grammarPointNo: 1,
    level: '1',
    tiles: [
      { text: '我', pinyin: 'wǒ', wordId: null },
      { text: '很', pinyin: 'hěn', wordId: null },
      { text: '忙', pinyin: 'máng', wordId: null },
    ],
  };
  assert.equal(buildGapFill(none, prng(2)), null);
});

test('every possible option has a reading', () => {
  // A missing entry renders a blank line under the character, which looks
  // broken rather than merely incomplete.
  for (const ch of [...GAP_PARTICLES, ...GAP_MEASURE_WORDS]) {
    assert.ok(GAP_READINGS[ch], `no reading for "${ch}"`);
  }
});

test('particle readings are the grammatical ones, not citation forms', () => {
  // These are exactly the polyphones pinyin-pro gets wrong out of context.
  assert.equal(GAP_READINGS['了'], 'le');
  assert.equal(GAP_READINGS['得'], 'de');
  assert.equal(GAP_READINGS['着'], 'zhe');
  assert.equal(GAP_READINGS['地'], 'de');
});

test('distractor tiles never repeat or overlap the sentence’s own words', async () => {
  const { pickDistractors } = await import('./sentences');
  const mk = (id: string, words: string[], level = '1') =>
    ({ id, level, tiles: words.map((text) => ({ text, pinyin: 'x', wordId: null })) }) as unknown as import('./sentences').Sentence;
  const target = mk('a', ['我', '是', '学生']);
  const pool = [target, mk('b', ['你', '是', '老师']), mk('c', ['他', '学', '中文']), mk('d', ['猫', '狗'], '2')];
  const picked = pickDistractors(target, pool, 5, () => 0.5).map((t) => t.text);
  assert.ok(!picked.includes('是'), 'the sentence’s own word');
  assert.ok(!picked.includes('学'), 'part of 学生 could still fit');
  assert.ok(!picked.includes('猫'), 'another level');
  assert.deepEqual([...picked].sort(), ['中文', '他', '你', '老师'].sort());
});
