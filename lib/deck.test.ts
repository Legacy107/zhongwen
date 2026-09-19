import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import type { Word } from './hanviet';

const words: Word[] = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '..', 'data', 'words.json'), 'utf8'),
);

test('no headword carries an unsplit HSK variant bar', () => {
  // HSK writes "爸爸|爸"; taking that as one word produced a three-character
  // entry with han-viet "ba ba ba" and no gloss, because no dictionary has an
  // entry for it. The bar must be split at build time.
  const bars = words.filter((w) => w.simplified.includes('|') || w.pinyin.includes('|'));
  assert.deepEqual(
    bars.map((w) => w.simplified),
    [],
    'variant forms must be split off the headword',
  );
});

test('the HSK 1 family words are complete', () => {
  for (const [form, variant] of [
    ['爸爸', '爸'],
    ['妈妈', '妈'],
    ['哥哥', '哥'],
    ['姐姐', '姐'],
    ['弟弟', '弟'],
    ['妹妹', '妹'],
  ]) {
    const w = words.find((x) => x.simplified === form);
    assert.ok(w, `${form} missing from deck`);
    assert.ok(w!.enGloss, `${form} has no English gloss`);
    assert.ok(w!.viGloss, `${form} has no Vietnamese gloss`);
    assert.equal(w!.chars.length, 2, `${form} should be two characters`);
    assert.ok(w!.variants?.includes(variant), `${form} should record ${variant} as a variant`);
  }
});

test('character counts match the headword, not the raw HSK cell', () => {
  for (const w of words) {
    const hanzi = [...w.simplified].filter((c) => /[一-鿿]/.test(c));
    assert.equal(w.chars.length, hanzi.length, `${w.simplified}: chars out of step`);
  }
});
