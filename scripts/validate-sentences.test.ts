/**
 * Validator unit tests.
 *
 *   yarn sentences:test
 *
 * Uses node:test (built in — no new dependency) and runs against the real
 * words.json, so a check that passes here passes against the data the app
 * actually ships.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import type { FalseFriend, Word } from "../lib/hanviet";
import type { Sentence } from "../lib/sentences";
import { countHanzi, stripPunctuation } from "../lib/sentences";
import { detectViContrast, segmentIntoTiles, sentencePinyin } from "./segment-sentences";
import {
  buildAllowedChars,
  buildNonErhuaWords,
  countErhua,
  levelsUpTo,
  validateSentences,
  type ValidationOptions,
} from "./validate-sentences";

const DATA = path.resolve(import.meta.dirname, "..", "data");

// Read synchronously: tsx transpiles this file to CJS, which has no top-level
// await, and the test bodies need the data available at module scope anyway.
const words: Word[] = JSON.parse(readFileSync(path.join(DATA, "words.json"), "utf8"));
const falseFriends: FalseFriend[] = JSON.parse(
  readFileSync(path.join(DATA, "false-friends.json"), "utf8"),
);

const wordsBySurface = new Map<string, Word>();
for (const w of words) if (!wordsBySurface.has(w.simplified)) wordsBySurface.set(w.simplified, w);
const maxWordLength = Math.max(...words.map((w) => [...w.simplified].length));

const baseOpts: ValidationOptions = { level: "1", words, falseFriends };

/** Build a well-formed sentence the way the generator does, so tests exercise the real path. */
function make(hanzi: string, over: Partial<Sentence> = {}): Sentence {
  const bare = stripPunctuation(hanzi);
  const s: Sentence = {
    id: over.id ?? "S1-001-1",
    hanzi,
    pinyin: sentencePinyin(bare),
    modelPinyin: sentencePinyin(bare),
    enGloss: "gloss",
    viGloss: "nghĩa",
    grammarPointNo: 1,
    level: "1",
    tiles: segmentIntoTiles(bare, wordsBySurface, maxWordLength),
    ...over,
  };
  return s;
}

test("levelsUpTo includes the curated supplementary level", () => {
  assert.deepEqual(levelsUpTo("1"), ["1", "S"]);
  assert.deepEqual(levelsUpTo("3"), ["1", "2", "3", "S"]);
  // "S" is a hand-curated 41-word list of countries, nationalities and
  // languages that HSK omits. It must be available at every level, or
  // 我是越南人 - the motivating example for this stage - is rejected.
  assert.ok(levelsUpTo("6").includes("S"));
});

test("accepts a clean HSK 1 sentence", () => {
  const r = validateSentences([make("我喜欢喝茶。")], baseOpts);
  assert.equal(r.valid.length, 1);
  assert.equal(r.rejected.length, 0);
});

test("tiles rejoin to exactly the hanzi", () => {
  const s = make("我喜欢喝茶。");
  assert.equal(s.tiles.map((t) => t.text).join(""), "我喜欢喝茶");
});

test("rejects tiles that do not rejoin", () => {
  const s = make("我喜欢喝茶。");
  s.tiles = s.tiles.slice(0, 2); // drop the tail
  const r = validateSentences([s], baseOpts);
  assert.equal(r.valid.length, 0);
  assert.equal(r.rejected[0].code, "tiles-mismatch");
  assert.match(r.rejected[0].detail, /rejoin/);
});

test("rejects a word above the target level and names it", () => {
  // 银行 is HSK 3; at level 1 it must be rejected, not silently kept.
  const s = make("我去银行。");
  const r = validateSentences([s], baseOpts);
  assert.equal(r.valid.length, 0);
  assert.equal(r.rejected[0].code, "out-of-level");
  assert.match(r.rejected[0].detail, /银|行/);
});

test("the same out-of-level word passes at a higher level", () => {
  const s = make("我去银行。", { level: "3" });
  const r = validateSentences([s], { ...baseOpts, level: "3" });
  assert.equal(r.valid.length, 1, r.rejected[0]?.detail);
});

test("rejects pinyin whose syllable count disagrees with the hanzi", () => {
  // The model's own pinyin is what gets checked; a short one means it dropped
  // a character from one of the two fields.
  const s = make("我喜欢喝茶。", { modelPinyin: "wǒ xǐ huan hē" });
  const r = validateSentences([s], baseOpts);
  assert.equal(r.rejected[0].code, "pinyin-length");
  assert.match(r.rejected[0].detail, /4 syllables.*5 characters/);
});

test("the derived pinyin field alone cannot mask a truncation", () => {
  // Regression guard: `pinyin` is re-derived from the hanzi and so always
  // matches by construction. If the check ever reads it instead of
  // modelPinyin, this sentence passes and the detector is dead.
  const s = make("我喜欢喝茶。", { modelPinyin: "wǒ xǐ" });
  const r = validateSentences([s], baseOpts);
  assert.equal(r.valid.length, 0);
  assert.equal(r.rejected[0].code, "pinyin-length");
});

test("rejects duplicates and points at the original", () => {
  const a = make("我喜欢喝茶。", { id: "S1-001-1" });
  const b = make("我喜欢喝茶。", { id: "S1-002-1", grammarPointNo: 2 });
  const r = validateSentences([a, b], baseOpts);
  assert.equal(r.valid.length, 1);
  assert.equal(r.rejected[0].code, "duplicate");
  assert.match(r.rejected[0].detail, /S1-001-1/);
});

test("differing punctuation still counts as a duplicate", () => {
  const a = make("我喜欢喝茶。");
  const b = make("我喜欢喝茶！", { id: "S1-002-1" });
  const r = validateSentences([a, b], baseOpts);
  assert.equal(r.valid.length, 1);
  assert.equal(r.rejected[0].code, "duplicate");
});

test("rejects sentences outside the 4-12 character window", () => {
  const short = validateSentences([make("我好。")], baseOpts);
  assert.equal(short.rejected[0].code, "length-bounds");

  const long = make("我今天上午在家里看书看了很长时间的书。");
  const r = validateSentences([long], baseOpts);
  assert.ok(["length-bounds", "out-of-level"].includes(r.rejected[0].code));
});

test("rejects a malformed record instead of throwing", () => {
  const broken = { ...make("我喜欢喝茶。"), tiles: [] } as Sentence;
  const r = validateSentences([broken], baseOpts);
  assert.equal(r.rejected[0].code, "malformed");
});

test("flags a false friend without rejecting the sentence", () => {
  // 老师 reads as Hán-Việt "lão sư" — a false friend present at HSK 1.
  const s = make("他是我的老师。");
  const r = validateSentences([s], baseOpts);
  assert.equal(r.valid.length, 1, r.rejected[0]?.detail);
  assert.equal(r.flagged.length, 1);
  assert.ok(r.flagged[0].falseFriends.includes("老师"));
  assert.ok(r.valid[0].falseFriends?.includes("老师"));
});

test("a false friend above the target level is still rejected by the level cap", () => {
  // 大家 is the canonical false friend but is HSK 2 — flagging must not
  // smuggle it past the level cap at HSK 1.
  const r = validateSentences([make("大家都很好。")], baseOpts);
  assert.equal(r.valid.length, 0);
  assert.equal(r.rejected[0].code, "out-of-level");
});

test("grammar-point content words are allowed through the level cap", () => {
  // Content words of HSK 1 point 1 (方位名词). Without grammarWords these
  // would be rejected, which would gut the point they exist to teach.
  const opts = { ...baseOpts, grammarWords: new Set(["前边", "后边"]) };
  const chars = buildAllowedChars(words, "1", opts.grammarWords);
  assert.ok(chars.has("边"));
});

test("byCode tallies every rejection", () => {
  const r = validateSentences(
    [make("我好。"), make("我去银行。"), make("我喜欢喝茶。")],
    baseOpts,
  );
  const tallied = Object.values(r.byCode).reduce((a, b) => a + b, 0);
  assert.equal(tallied, r.rejected.length);
});

test("countHanzi ignores punctuation", () => {
  assert.equal(countHanzi("我喜欢喝茶。"), 5);
  assert.equal(countHanzi("你好，你好！"), 4);
});

test("segmentation keeps multi-character deck words whole", () => {
  const tiles = segmentIntoTiles("我喜欢喝茶", wordsBySurface, maxWordLength);
  assert.deepEqual(
    tiles.map((t) => t.text),
    ["我", "喜欢", "喝", "茶"],
  );
  assert.ok(tiles.every((t) => t.wordId !== null));
});

test("tiles carry the deck word id when the tile is a deck word", () => {
  const tiles = segmentIntoTiles("我喜欢喝茶", wordsBySurface, maxWordLength);
  const xihuan = tiles.find((t) => t.text === "喜欢");
  assert.ok(xihuan?.wordId?.startsWith("L1-"));
});

test("viContrast tags a possessive de-phrase", () => {
  const c = detectViContrast("这是我的书。");
  assert.ok(c, "expected a contrast tag");
  assert.equal(c.chineseOrder, "我的书");
  assert.match(c.vietnameseOrder, /của tôi/);
});

test("viContrast tags a nationality compound", () => {
  const c = detectViContrast("他是中国人。");
  assert.ok(c);
  assert.equal(c.chineseOrder, "中国人");
  assert.match(c.vietnameseOrder, /người Trung Quốc/);
});

test("viContrast stays silent on sentences with no modifier phrase", () => {
  assert.equal(detectViContrast("我喜欢喝茶。"), null);
  assert.equal(detectViContrast("你好！"), null);
});

test("viContrast does not tag 男人 / 女人 as a nationality compound", () => {
  // These are single lexical words in both languages and carry no word-order
  // lesson; tagging them would teach a rule that does not exist.
  assert.equal(detectViContrast("那个男人很高。"), null);
  assert.equal(detectViContrast("这个女人是老师。"), null);
});

test("countErhua counts only backward-merging 儿", () => {
  const nonErhua = buildNonErhuaWords(words);
  assert.equal(countErhua("一点儿", nonErhua), 1);
  assert.equal(countErhua("这儿有水果吗", nonErhua), 1);
  assert.equal(countErhua("哪儿", nonErhua), 1);
  assert.equal(countErhua("我是越南人", nonErhua), 0);
  assert.equal(countErhua("这儿那儿", nonErhua), 2);
  // 儿子 (érzi) and 女儿 (nǚ'ér) keep 儿 as its own syllable - detected from
  // the deck's own pinyin, not a hand-maintained exception list.
  assert.equal(countErhua("我儿子", nonErhua), 0);
  assert.equal(countErhua("我女儿今年六岁", nonErhua), 0);
});

test("buildNonErhuaWords finds the genuine syllable breaks", () => {
  const s = buildNonErhuaWords(words);
  assert.ok(s.has("女儿"), "女儿 is nǚ'ér - two syllables");
  assert.ok(s.has("儿子"), "儿子 is érzi - 儿 is its own initial syllable");
  assert.ok(!s.has("一点儿"), "一点儿 is erhua");
});

test("a correct erhua transcription is not rejected as truncated", () => {
  // 我会说一点儿汉语 - 8 hanzi, but "yì diǎnr" merges 儿, so 7 syllables.
  const s = make("我会说一点儿汉语。");
  s.modelPinyin = "wǒ huì shuō yì diǎnr hàn yǔ";
  const r = validateSentences([s], baseOpts);
  assert.equal(
    r.rejected.filter((x) => x.code === "pinyin-length").length,
    0,
    "erhua must not count as a truncation",
  );
});

test("a genuinely truncated pinyin is still rejected", () => {
  const s = make("我会说一点儿汉语。");
  s.modelPinyin = "wǒ huì shuō"; // dropped the tail
  const r = validateSentences([s], baseOpts);
  assert.equal(r.rejected.filter((x) => x.code === "pinyin-length").length, 1);
});
