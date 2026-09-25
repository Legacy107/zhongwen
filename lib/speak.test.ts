import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickVoice } from './speak';

const v = (name: string, lang: string, localService = true) =>
  ({ name, lang, localService, default: false, voiceURI: name }) as SpeechSynthesisVoice;

// The macOS list, in the order the browser returns it.
const mac = [
  v('Eddy (Chinese (China mainland))', 'zh-CN'),
  v('Flo (Chinese (China mainland))', 'zh-CN'),
  v('Grandma (Chinese (China mainland))', 'zh-CN'),
  v('Li-Mu', 'zh-CN'),
  v('Meijia', 'zh-TW'),
  v('Tingting', 'zh-CN'),
  v('Microsoft 晓晓 Online (Natural) - Chinese (Mandarin, Simplified)', 'zh-CN', false),
  v('Samantha', 'en-US'),
];

test('skips Apple novelty voices that list first alphabetically', () => {
  assert.equal(pickVoice(mac)?.name, 'Tingting');
});

test('prefers mainland Mandarin over Taiwan', () => {
  assert.equal(pickVoice([v('Meijia', 'zh-TW'), v('Li-Mu', 'zh-CN')])?.name, 'Li-Mu');
});

test('prefers a local voice over a network one, for offline use', () => {
  const picked = pickVoice([v('Google 普通话（中国大陆）', 'zh-CN', false), v('Li-Mu', 'zh-CN')]);
  assert.equal(picked?.name, 'Li-Mu');
});

test('falls back to an unranked Chinese voice rather than none', () => {
  assert.equal(pickVoice([v('Some Voice', 'zh-CN')])?.name, 'Some Voice');
});

test('never picks a novelty or non-Chinese voice', () => {
  assert.equal(pickVoice([v('Eddy (Chinese (China mainland))', 'zh-CN'), v('Samantha', 'en-US')]), undefined);
});
