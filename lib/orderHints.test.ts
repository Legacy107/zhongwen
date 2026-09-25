import assert from 'node:assert/strict';
import { test } from 'node:test';
import { vietnameseOrderHint } from './orderHints';

const t = (s: string) => s.split(' ');

test('a position word placed before its place gets the localizer note', () => {
  const hint = vietnameseOrderHint(t('书店 在 医院 旁边'), t('书店 在 旁边 医院'));
  assert.ok(hint);
  assert.equal(hint.chinese, '医院旁边');
  assert.match(hint.note, /bên cạnh/);
});

test('a noun placed before its 的 describer gets the modifier note', () => {
  const hint = vietnameseOrderHint(t('这 是 我 的 书'), t('这 是 书 我 的'));
  assert.equal(hint?.chinese, '我的书');
});

test('在 + place after the verb gets the place-before-verb note', () => {
  const hint = vietnameseOrderHint(t('我 在 家 吃饭'), t('我 吃饭 在 家'));
  assert.equal(hint?.chinese, '在家吃饭');
});

test('a time word moved to the end gets the time note', () => {
  const hint = vietnameseOrderHint(t('我 今天 去 学校'), t('我 去 学校 今天'));
  assert.equal(hint?.chinese, '我今天去');
});

test('no note for a mistake that is not a Vietnamese-order reversal', () => {
  assert.equal(vietnameseOrderHint(t('我 是 越南 人'), t('是 我 越南 人')), null);
  assert.equal(vietnameseOrderHint(t('我 在 家'), t('在 家 我')), null, '在 as the main verb');
  assert.equal(vietnameseOrderHint(t('我 的 书 很 好'), t('我 的 书 很 好')), null, 'a correct answer');
});
