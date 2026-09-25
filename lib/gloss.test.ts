import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanGloss, glossEn } from './gloss';
import { displayPinyin, numericToMarks } from './pinyinFormat';

test('dictionary markup is stripped from glosses', () => {
  assert.equal(cleanGloss('you (informal, as opposed to courteous 您[nin2])'), 'you (informal, as opposed to courteous 您)');
  assert.equal(
    cleanGloss('book; letter; CL:本[ben3],冊|册[ce4],部[bu4]'),
    'book; letter',
  );
  assert.equal(cleanGloss('waiter (in a restaurant); see 跑堂兒的|跑堂儿的[pao3 tang2 r5 de5]'), 'waiter (in a restaurant)');
  assert.equal(cleanGloss('measure word; 個|个 counter'), 'measure word; 个 counter');
});

test('housekeeping senses are dropped and at most n senses are kept', () => {
  assert.equal(cleanGloss('surname Wang; king; monarch; best', 2), 'king; monarch');
  assert.equal(cleanGloss('variant of 哪[na3]; which; how'), 'which; how');
  assert.equal(cleanGloss(null), '');
});

test('a curated gloss wins over the dictionary', () => {
  assert.equal(glossEn({ enGloss: 'to exist; to be alive', enShort: 'at; in; (doing) -ing' }), 'at; in; (doing) -ing');
  assert.equal(glossEn({ enGloss: 'to exist; to be alive; to be at' }, 2), 'to exist; to be alive');
});

test('word pinyin is written as one unit', () => {
  assert.equal(displayPinyin('shǒu jī'), 'shǒujī');
  assert.equal(displayPinyin('xiǎoxīn'), 'xiǎoxīn');
  assert.equal(displayPinyin('Xī ān'), "Xī'ān");
  assert.equal(displayPinyin("nǚ'ér"), "nǚ'ér");
  assert.equal(displayPinyin('bù kèqì'), 'bùkèqì');
});

test('tone digits become tone marks on the right vowel', () => {
  assert.equal(numericToMarks('ni3hao3'), 'nǐhǎo');
  assert.equal(numericToMarks('xiao3xin1'), 'xiǎoxīn');
  assert.equal(numericToMarks('dou1'), 'dōu');
  assert.equal(numericToMarks('gui4'), 'guì');
  assert.equal(numericToMarks('liu2'), 'liú');
  assert.equal(numericToMarks('lv4'), 'lǜ');
  assert.equal(numericToMarks('nu:3'), 'nǚ');
  assert.equal(numericToMarks('ma5'), 'ma');
  assert.equal(numericToMarks('peng2you'), 'péngyou');
  assert.equal(numericToMarks('nihao'), 'nihao', 'no digits, no change');
});

test('tone changes are explained, identical readings are not', async () => {
  const { toneChangeNote } = await import('./pinyinFormat');
  assert.equal(toneChangeNote('好', 'hǎo', 'hǎo'), null);
  assert.match(toneChangeNote('不用', 'búyòng', 'bùyòng') ?? '', /bú before a fourth tone/);
  assert.match(toneChangeNote('一个', 'yígè', 'yīgè') ?? '', /yí before a fourth tone/);
  assert.match(toneChangeNote('还', 'huán', 'hái') ?? '', /Dictionary form/);
});
