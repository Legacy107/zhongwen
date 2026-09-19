/**
 * Segmentation and Vietnamese-contrast tagging.
 *
 * Split out from the generator so it can be exercised without an API key: the
 * tiles and the `viContrast` tag are derived entirely from the hanzi, and are
 * the two things most likely to need tuning once a human looks at the output.
 */
import { pinyin } from "pinyin-pro";

import type { Word } from "../lib/hanviet";
import {
  stripPunctuation,
  type SentenceTile,
  type ViContrast,
} from "../lib/sentences";

/**
 * Segment a sentence into word tiles.
 *
 * `pinyin-pro`'s own `segment()` is used as the base, but it splits on its
 * internal dictionary, which does not know our deck. 越南人 comes back as three
 * single characters even though 越南 is a word the learner has a card for. So
 * the deck's wordlist is overlaid with a longest-match-first pass, and
 * pinyin-pro is used for the pinyin of each resulting tile — which is the part
 * it is actually authoritative about (it handles 的/de, 不 sandhi, polyphones).
 *
 * Tiles therefore always rejoin to the input exactly: the pass only ever
 * consumes characters left to right, never rewrites them.
 */
export function segmentIntoTiles(
  hanzi: string,
  wordsBySurface: Map<string, Word>,
  maxWordLength: number,
): SentenceTile[] {
  const bare = stripPunctuation(hanzi);
  const chars = [...bare];
  const tiles: SentenceTile[] = [];

  let i = 0;
  while (i < chars.length) {
    let matched: { text: string; word: Word } | null = null;
    const maxTry = Math.min(maxWordLength, chars.length - i);
    for (let len = maxTry; len >= 2; len--) {
      const candidate = chars.slice(i, i + len).join("");
      const word = wordsBySurface.get(candidate);
      if (word) {
        matched = { text: candidate, word };
        break;
      }
    }
    if (matched) {
      tiles.push({
        text: matched.text,
        pinyin: tilePinyin(matched.text),
        wordId: matched.word.id,
      });
      i += [...matched.text].length;
      continue;
    }
    const ch = chars[i];
    const single = wordsBySurface.get(ch);
    tiles.push({
      text: ch,
      pinyin: tilePinyin(ch),
      wordId: single ? single.id : null,
    });
    i++;
  }

  return tiles;
}

/** Diacritic pinyin for a whole tile, space-separated per syllable. */
export function tilePinyin(text: string): string {
  const arr = pinyin(text, { type: "array", toneType: "symbol" });
  return (Array.isArray(arr) ? arr : []).join(" ");
}

/** Sentence-level pinyin, one space between every syllable. */
export function sentencePinyin(hanzi: string): string {
  return tilePinyin(stripPunctuation(hanzi));
}

/**
 * Nationality / language morphemes that form head-last compounds in Chinese
 * and head-first phrases in Vietnamese.
 *
 * 中国人 is "Chinese person": the head 人 comes last. Vietnamese says
 * "người Trung Quốc" — head first. The same holds for 语/文 (语言 names):
 * 中文 vs "tiếng Trung".
 */
const NATIONALITY_HEADS = ["人", "语", "文", "话", "菜"];

/**
 * Places and peoples that appear at HSK 1–2 and can head such a compound.
 *
 * Kept as an explicit list rather than inferred: inferring "any noun + 人" tags
 * 男人 and 女人, which are single lexical words in both languages and carry no
 * word-order lesson. A missed tag is harmless; a wrong tag teaches a rule that
 * does not exist.
 */
const PLACE_STEMS: Record<string, { vi: string; en: string }> = {
  中国: { vi: "Trung Quốc", en: "China" },
  美国: { vi: "Mỹ", en: "America" },
  英国: { vi: "Anh", en: "England" },
  法国: { vi: "Pháp", en: "France" },
  德国: { vi: "Đức", en: "Germany" },
  日本: { vi: "Nhật Bản", en: "Japan" },
  韩国: { vi: "Hàn Quốc", en: "Korea" },
  越南: { vi: "Việt Nam", en: "Vietnam" },
  北京: { vi: "Bắc Kinh", en: "Beijing" },
  上海: { vi: "Thượng Hải", en: "Shanghai" },
  中: { vi: "Trung", en: "Chinese" },
  英: { vi: "Anh", en: "English" },
  法: { vi: "Pháp", en: "French" },
  日: { vi: "Nhật", en: "Japanese" },
  汉: { vi: "Hán", en: "Chinese" },
};

const HEAD_VI: Record<string, string> = {
  人: "người",
  语: "tiếng",
  文: "tiếng",
  话: "tiếng",
  菜: "món ăn",
};

/** Pronouns that form the commonest possessive 的-phrase. */
const PRONOUN_VI: Record<string, string> = {
  我: "tôi",
  你: "bạn",
  您: "ngài",
  他: "anh ấy",
  她: "cô ấy",
  我们: "chúng tôi",
  你们: "các bạn",
  他们: "họ",
  她们: "họ",
};

/**
 * Tag the modifier+noun order contrast, if the sentence exhibits one.
 *
 * Deliberately conservative — only two structures are recognised, both of which
 * are unambiguous:
 *
 *   1. X的Y — a 的-phrase. Chinese puts the modifier before 的 and the head
 *      after; Vietnamese puts the head first and the modifier after ("của X").
 *   2. PLACE + 人/语/文 — a nationality or language compound, head last in
 *      Chinese, head first in Vietnamese.
 *
 * Anything subtler (adjective+noun without 的, relative clauses) is left
 * untagged on purpose: the plan's own warning is that a wrong tag is worse
 * than a missing one, because the UI presents the tag as a specific
 * correction rather than a hint.
 */
export function detectViContrast(hanzi: string): ViContrast | null {
  const bare = stripPunctuation(hanzi);

  const de = detectDePhrase(bare);
  if (de) return de;

  return detectNationality(bare);
}

function detectDePhrase(bare: string): ViContrast | null {
  const idx = bare.indexOf("的");
  if (idx <= 0 || idx === bare.length - 1) return null;

  // Modifier: the pronoun immediately before 的. Restricted to pronouns
  // because those are the cases where the Vietnamese "của X" ordering is
  // guaranteed; 红色的车 also contrasts but the Vietnamese rendering varies.
  let modifier: string | null = null;
  for (const len of [2, 1]) {
    const candidate = bare.slice(Math.max(0, idx - len), idx);
    if (PRONOUN_VI[candidate]) {
      modifier = candidate;
      break;
    }
  }
  if (!modifier) return null;

  // Head: the noun right after 的. Take the rest of the clause up to the next
  // punctuation-free boundary, capped at two characters — enough for 书/朋友,
  // and short enough not to swallow a following verb phrase.
  const rest = bare.slice(idx + 1);
  const head = rest.slice(0, Math.min(2, rest.length));
  if (head.length === 0) return null;

  const viModifier = PRONOUN_VI[modifier];
  return {
    vietnameseOrder: `<danh từ> của ${viModifier}`,
    chineseOrder: `${modifier}的${head}`,
    note:
      `Vietnamese puts the possessor after the noun ("... của ${viModifier}"); ` +
      `Chinese puts it before, as ${modifier}的 + noun.`,
  };
}

function detectNationality(bare: string): ViContrast | null {
  for (const head of NATIONALITY_HEADS) {
    let from = 0;
    for (;;) {
      const idx = bare.indexOf(head, from);
      if (idx <= 0) break;
      for (const len of [2, 1]) {
        if (idx - len < 0) continue;
        const stem = bare.slice(idx - len, idx);
        const place = PLACE_STEMS[stem];
        if (!place) continue;
        // 菜 only makes a nationality compound with a two-character country.
        if (head === "菜" && len === 1) continue;
        const viHead = HEAD_VI[head] ?? "";
        return {
          vietnameseOrder: `${viHead} ${place.vi}`,
          chineseOrder: `${stem}${head}`,
          note:
            `Vietnamese names the head first ("${viHead} ${place.vi}"); ` +
            `Chinese puts the modifier first, ${stem} + ${head}.`,
        };
      }
      from = idx + 1;
    }
  }
  return null;
}
