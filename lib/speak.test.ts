import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pickVoice, rankVoices, shortVoiceName } from './speak';

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

// Edge on Android: the device's Google voice, then Microsoft's neural voices.
const android = [
  v('Chinese China', 'zh_CN'),
  v('Microsoft HsiaoChen Online (Natural) - Chinese (Taiwan)', 'zh-TW', false),
  v('Microsoft Yunxi Online (Natural) - Chinese (Mainland)', 'zh-CN', false),
  v('Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)', 'zh-CN', false),
  v('English United States', 'en_US'),
];

test('skips Apple novelty voices that list first alphabetically', () => {
  assert.equal(pickVoice(mac, { online: false })?.name, 'Tingting');
});

test('prefers a neural voice when online', () => {
  assert.equal(pickVoice(mac)?.name, 'Microsoft 晓晓 Online (Natural) - Chinese (Mandarin, Simplified)');
  assert.equal(pickVoice(android)?.name, 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)');
});

test('falls back to the device voice offline', () => {
  assert.equal(pickVoice(android, { online: false })?.name, 'Chinese China');
});

test('prefers mainland Mandarin over Taiwan', () => {
  assert.equal(pickVoice([v('Meijia', 'zh-TW'), v('Li-Mu', 'zh-CN')])?.name, 'Li-Mu');
});

test('prefers a local voice over a network one that is not neural', () => {
  const picked = pickVoice([v('Google 普通话（中国大陆）', 'zh-CN', false), v('Li-Mu', 'zh-CN')]);
  assert.equal(picked?.name, 'Li-Mu');
});

test('uses the chosen voice when this device has it', () => {
  const chosen = 'Microsoft Yunxi Online (Natural) - Chinese (Mainland)';
  assert.equal(pickVoice(android, { chosen })?.name, chosen);
  assert.equal(pickVoice(android, { chosen: 'Tingting' })?.name, 'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)');
});

test('ignores a chosen network voice offline', () => {
  const chosen = 'Microsoft Yunxi Online (Natural) - Chinese (Mainland)';
  assert.equal(pickVoice(android, { chosen, online: false })?.name, 'Chinese China');
});

test('falls back to an unranked Chinese voice rather than none', () => {
  assert.equal(pickVoice([v('Some Voice', 'zh-CN')])?.name, 'Some Voice');
});

test('never picks a novelty or non-Chinese voice', () => {
  assert.equal(pickVoice([v('Eddy (Chinese (China mainland))', 'zh-CN'), v('Samantha', 'en-US')]), undefined);
});

test('ranks only Chinese voices, best first', () => {
  assert.deepEqual(
    rankVoices(android).map(shortVoiceName),
    ['Xiaoxiao', 'Yunxi', 'Chinese China', 'HsiaoChen'],
  );
});
