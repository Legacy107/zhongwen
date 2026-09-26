import assert from 'node:assert/strict';
import { test } from 'node:test';
import { checkSentence, markTyped } from './sentenceAnswer';
import type { Sentence } from './sentences';

// In the app's shape (lib/data.ts): pinyin per word, as the tiles show it, and
// the generated per-syllable pinyin beside it.
const sentence = (s: Pick<Sentence, 'hanzi' | 'pinyin' | 'tiles'> & Partial<Sentence>): Sentence => ({
  id: 'test',
  modelPinyin: '',
  enGloss: '',
  viGloss: '',
  grammarPointNo: 0,
  level: '1',
  ...s,
});

const busStop = sentence({
  hanzi: '车站在学校后边。',
  pinyin: 'chēzhàn zài xuéxiào hòubiān',
  syllablePinyin: 'chē zhàn zài xué xiào hòu biān',
  tiles: [
    { text: '车站', pinyin: 'chēzhàn', wordId: 'L1-0045' },
    { text: '在', pinyin: 'zài', wordId: 'L1-0455' },
    { text: '学校', pinyin: 'xuéxiào', wordId: 'L1-0421' },
    { text: '后边', pinyin: 'hòubiān', wordId: 'L1-0148' },
  ],
});

test('characters must match, but punctuation, spaces and full-width forms do not count', () => {
  for (const typed of ['车站在学校后边。', '车站在学校后边', '车站 在 学校 后边', '车站在学校后边!', '车站在学校后边？']) {
    const r = checkSentence(typed, busStop);
    assert.equal(r.verdict, 'correct', typed);
    assert.equal(r.script, 'hanzi');
  }
  assert.equal(checkSentence('车站在学校前边', busStop).verdict, 'wrong');
});

test('pinyin is accepted, with tones optional', () => {
  for (const typed of ['che zhan zai xue xiao hou bian', 'chezhanzaixuexiaohoubian', 'Che zhan zai xue xiao hou bian.']) {
    assert.deepEqual(checkSentence(typed, busStop), { verdict: 'correct', script: 'pinyin', slips: [], hint: null }, typed);
  }
  assert.equal(checkSentence('che1 zhan4 zai4 xue2 xiao4 hou4 bian1', busStop).verdict, 'correct');
  assert.equal(checkSentence('chē zhàn zài xué xiào hòu biān', busStop).verdict, 'correct');
  assert.equal(checkSentence('che zhan4 zai xue xiao hou bian', busStop).verdict, 'correct', 'some tones given, all right');
});

test('a tone typed wrong is "almost", and says which syllable', () => {
  const r = checkSentence('che zhan1 zai xue xiao hou bian', busStop);
  assert.equal(r.verdict, 'tones');
  assert.deepEqual(r.slips, [1]);
  assert.deepEqual(checkSentence('che1 zhan4 zai4 xue2 xiao4 hou4 bian4', busStop).slips, [6]);
});

test('neutral syllables never count against a typed tone', () => {
  const friends = sentence({
    hanzi: '我们是朋友。',
    pinyin: 'wǒmen shì péngyou',
    syllablePinyin: 'wǒ men shì péng you',
    tiles: [
      { text: '我们', pinyin: 'wǒmen', wordId: null },
      { text: '是', pinyin: 'shì', wordId: null },
      { text: '朋友', pinyin: 'péngyou', wordId: null },
    ],
  });
  assert.equal(checkSentence('wo3 men2 shi4 peng2 you3', friends).verdict, 'correct');
});

test('不 and 一 are right in their dictionary tone as well as their changed one', () => {
  const thanks = sentence({
    hanzi: '谢谢，不客气。',
    pinyin: 'xièxie búkèqi',
    syllablePinyin: 'xiè xiè bú kè qì',
    tiles: [
      { text: '谢谢', pinyin: 'xièxie', wordId: null },
      { text: '不客气', pinyin: 'búkèqi', wordId: null },
    ],
  });
  assert.equal(checkSentence('xie4 xie bu4 ke4 qi', thanks).verdict, 'correct');
  assert.equal(checkSentence('xie4 xie bu2 ke4 qi', thanks).verdict, 'correct');
  assert.deepEqual(checkSentence('xie4 xie bu3 ke4 qi', thanks).slips, [2]);
  assert.deepEqual(checkSentence('xie1 xie bu ke qi', thanks).slips, [0], 'the T1/T4 slip');
});

test('儿 is right read as its own syllable or as -r', () => {
  const where = sentence({
    hanzi: '洗手间在哪儿？',
    pinyin: 'xǐshǒujiān zài nǎr',
    syllablePinyin: 'xǐ shǒu jiān zài nǎ ér',
    tiles: [
      { text: '洗手间', pinyin: 'xǐshǒujiān', wordId: null },
      { text: '在', pinyin: 'zài', wordId: null },
      { text: '哪儿', pinyin: 'nǎr', wordId: null },
    ],
  });
  assert.equal(checkSentence('xi shou jian zai nar', where).verdict, 'correct');
  assert.equal(checkSentence('xi shou jian zai na er', where).verdict, 'correct');
  assert.deepEqual(checkSentence('xi3 shou3 jian4 zai4 na3 er2', where).slips, [2]);
});

test('pinyin spelled by whole words, as saved reading sentences are, is judged on letters alone', () => {
  const saved = sentence({
    hanzi: '我知道了。',
    pinyin: 'wǒ zhīdào le',
    tiles: [
      { text: '我', pinyin: 'wǒ', wordId: null },
      { text: '知道', pinyin: 'zhīdào', wordId: null },
      { text: '了', pinyin: 'le', wordId: null },
    ],
  });
  assert.equal(checkSentence('wo zhidao le', saved).verdict, 'correct');
  assert.equal(checkSentence('wo zhi4dao4 le', saved).verdict, 'correct', 'tones are not placed on word-level pinyin');
  assert.equal(checkSentence('wo zhidao', saved).verdict, 'wrong');
});

test('the sentence typed in Vietnamese order gets the order correction, in characters or pinyin', () => {
  for (const typed of ['车站在后边学校', 'che zhan zai hou bian xue xiao']) {
    const r = checkSentence(typed, busStop);
    assert.equal(r.verdict, 'wrong', typed);
    assert.equal(r.hint?.chinese, '学校后边', typed);
  }
  assert.equal(checkSentence('车站在学校', busStop).hint, null, 'missing a word is not an order mistake');
});

test("falls back to the contrast the sentence teaches, for a characters answer that isn't its words rearranged", () => {
  const book = sentence({
    hanzi: '这是我的书。',
    pinyin: 'zhè shì wǒ de shū',
    tiles: ['这', '是', '我', '的', '书'].map((text) => ({ text, pinyin: '', wordId: null })),
    viContrast: { vietnameseOrder: 'sách của tôi', chineseOrder: '我的书', note: 'describer first' },
  });
  assert.equal(checkSentence('这是书我的', book).hint?.chinese, '我的书', 'the rule the order breaks');
  assert.equal(checkSentence('这是书了', book).hint?.note, 'describer first', 'the tagged contrast');
  assert.equal(checkSentence('zhe shi shu le', book).hint, null, 'pinyin cannot show the chunk is missing');
});

test('marks the typed characters that are extra or out of place', () => {
  assert.ok(markTyped('我是越南人', '我是越南人').every((c) => c.ok));
  assert.ok(markTyped('我是越人', '我是越南人').every((c) => c.ok), 'a missing character flags nothing typed');
  assert.deepEqual(
    markTyped('我事越南人', '我是越南人').filter((c) => !c.ok).map((c) => c.ch),
    ['事'],
  );
  const swapped = markTyped('车站在后边学校', '车站在学校后边');
  assert.equal(swapped.filter((c) => !c.ok).length, 2);
  assert.equal(swapped.map((c) => c.ch).join(''), '车站在后边学校');
});
