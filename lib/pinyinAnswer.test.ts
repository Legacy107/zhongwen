import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkPinyin, pinyinLetters, pinyinTones } from './pinyinAnswer';

test('tones are optional', () => {
  assert.equal(checkPinyin('nihao', 'nǐhǎo'), 'correct');
  assert.equal(checkPinyin('ni hao', 'nǐ hǎo'), 'correct');
  assert.equal(checkPinyin('NiHao', 'nǐhǎo'), 'correct');
});

test('tone digits are accepted, not treated as letters', () => {
  assert.equal(checkPinyin('ni3hao3', 'nǐhǎo'), 'correct');
  assert.equal(checkPinyin('ni3 hao3', 'nǐhǎo'), 'correct');
});

test('tone marks are accepted', () => {
  assert.equal(checkPinyin('nǐhǎo', 'nǐhǎo'), 'correct');
});

test('wrong tones are flagged, not passed', () => {
  assert.equal(checkPinyin('ni2hao3', 'nǐhǎo'), 'tones');
  assert.equal(checkPinyin('níhǎo', 'nǐhǎo'), 'tones');
});

test('neutral tones never count against an answer', () => {
  assert.equal(checkPinyin('peng2you', 'péngyou', 'peng2 you5'), 'correct');
  assert.equal(checkPinyin('peng2you5', 'péngyou', 'peng2 you5'), 'correct');
  assert.equal(checkPinyin('péngyǒu', 'péngyou', 'peng2 you5'), 'correct', 'citation tone on a neutral syllable');
  assert.equal(checkPinyin('peng3you3', 'péngyou', 'peng2 you5'), 'tones');
});

test('each tone is checked against its own syllable', () => {
  // Letters then a tap on a tone key: the digit belongs to the last syllable.
  assert.equal(checkPinyin('laoshi1', 'lǎoshī', 'lao3 shi1'), 'correct');
  assert.equal(checkPinyin('laoshi3', 'lǎoshī', 'lao3 shi1'), 'tones');
  assert.equal(checkPinyin('lao3shi', 'lǎoshī', 'lao3 shi1'), 'correct');
  assert.equal(checkPinyin('lao3shi1', 'lǎoshī', 'lao3 shi1'), 'correct');
  assert.equal(checkPinyin('láoshī', 'lǎoshī', 'lao3 shi1'), 'tones');
  assert.equal(checkPinyin('laoshī', 'lǎoshī', 'lao3 shi1'), 'correct');
  assert.equal(checkPinyin('xian1', "Xī'ān", 'Xi1 an1'), 'correct', 'the digit after n belongs to an');
  assert.equal(checkPinyin('lü4', 'lǜ', 'lu:4'), 'correct');
});

test('tones on only some syllables are read left to right', () => {
  assert.equal(checkPinyin('peng2you', 'péngyou'), 'correct');
  assert.equal(checkPinyin('bu4ke4qi', 'bù kèqì'), 'correct');
  assert.equal(checkPinyin('ni2hao', 'nǐhǎo'), 'tones');
});

test('ü is its own letter', () => {
  assert.equal(checkPinyin('lv', 'lǜ'), 'correct');
  assert.equal(checkPinyin('lü4', 'lǜ'), 'correct');
  assert.equal(checkPinyin('lu:', 'lǜ'), 'correct');
  assert.equal(checkPinyin('lu', 'lǜ'), 'wrong', '路 lù is a different word');
});

test('different letters are wrong, and so is an empty answer', () => {
  assert.equal(checkPinyin('nihou', 'nǐhǎo'), 'wrong');
  assert.equal(checkPinyin('', 'nǐhǎo'), 'wrong');
  assert.equal(checkPinyin('   ', 'nǐhǎo'), 'wrong');
});

test('apostrophes and spacing are ignored', () => {
  assert.equal(checkPinyin("xi an", "Xī'ān"), 'correct');
  assert.equal(pinyinLetters("Xī'ān"), 'xian');
});

test('tones are read in order from marks or digits', () => {
  assert.deepEqual(pinyinTones('nǐhǎo'), [3, 3]);
  assert.deepEqual(pinyinTones('ni3hao3'), [3, 3]);
  assert.deepEqual(pinyinTones('ma0'), [5]);
});
