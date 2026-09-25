/**
 * Hán-Việt (Sino-Vietnamese) bridge helpers.
 *
 * Pure functions only — no I/O, no filesystem, no fetch. Everything here is
 * safe to import from both the build script and React components.
 */

export type ToneConfidence = "high" | "medium" | "low";

export type DriftType = "semantic" | "pos" | "referential";

export interface Char {
  char: string;
  pinyin: string;
  hanviet: string | null;
  strokeCount?: number;
  radical?: number;
}

export interface Word {
  id: string;
  simplified: string;
  traditional: string;
  /** Diacritic pinyin, e.g. "ānquán". */
  pinyin: string;
  /** Numeric pinyin, e.g. "an1 quan2". */
  pinyinNumeric: string;
  /** One entry per syllable; 5 means neutral tone. */
  toneNumbers: number[];
  level: string;
  pos: string[];
  enGloss: string | null;
  viGloss: string | null;
  hanviet: string | null;
  isCognate: boolean;
  /** Which cognate rule fired, so the UI can hedge instead of claiming identity. */
  cognateMatch: CognateMatch;
  toneConfidence: ToneConfidence;
  /** Tone predicted from the Hán-Việt diacritic, per syllable. null when unknown. */
  predictedTone: (number | null)[];
  /** Actual Mandarin tone, per syllable. */
  actualTone: number[];
  chars: string[];
  /**
   * Accepted short forms, e.g. 爸 for 爸爸.
   *
   * HSK lists these in the same cell as the headword. They are worth showing
   * but not worth drilling as separate cards.
   */
  variants?: string[];
  /**
   * Hand-written learner glosses (data/glosses.json, HSK 1–2), merged in at
   * load time. Use glossEn()/glossVi() from lib/gloss.ts rather than reading
   * these or the raw dictionary glosses directly.
   */
  enShort?: string;
  viShort?: string;
}

export interface FalseFriend {
  simplified: string;
  pinyin: string;
  hanviet: string;
  mandarinMeaning: string;
  vietnameseMeaning: string;
  driftType: DriftType;
  note: string;
}

export interface GrammarPoint {
  no: number;
  level: string;
  group: string;
  category: string;
  details: string;
  content: string;
}

/**
 * Vietnamese orthographic variants that are the *same* word spelled two ways.
 *
 * Vietnamese has two competing conventions for i/y after certain initials
 * (the "i ngắn / y dài" debate). Dictionaries disagree, so `lý` and `lí` both
 * occur in the wild for the same morpheme. Unihan's kVietnamese and CVDICT's
 * glosses made different choices, so cognate detection collapses far too often
 * unless these are folded together before comparison.
 *
 * Applied as whole-syllable rewrites, not substring rewrites: naive substring
 * replacement would corrupt unrelated syllables (e.g. turning "hiểu" into
 * "hyểu").
 */
const SYLLABLE_VARIANTS: Record<string, string> = {
  // i/y alternation after l, k, m, s, t, h, b, v, q, ngh
  lí: "ly",
  lý: "ly",
  li: "ly",
  ly: "ly",
  lị: "lỵ",
  lỵ: "lỵ",
  lỉ: "lỷ",
  lỷ: "lỷ",
  lĩ: "lỹ",
  lỹ: "lỹ",
  kí: "ky",
  ký: "ky",
  ki: "ky",
  ky: "ky",
  kỉ: "kỷ",
  kỷ: "kỷ",
  kĩ: "kỹ",
  kỹ: "kỹ",
  kị: "kỵ",
  kỵ: "kỵ",
  mĩ: "mỹ",
  mỹ: "mỹ",
  mí: "my",
  mý: "my",
  mị: "mỵ",
  mỵ: "mỵ",
  sĩ: "sỹ",
  sỹ: "sỹ",
  sí: "sy",
  sý: "sy",
  tí: "ty",
  tý: "ty",
  ti: "ty",
  ty: "ty",
  tỉ: "tỷ",
  tỷ: "tỷ",
  tị: "tỵ",
  tỵ: "tỵ",
  tì: "tỳ",
  tỳ: "tỳ",
  tĩ: "tỹ",
  tỹ: "tỹ",
  hi: "hy",
  hy: "hy",
  hí: "hý",
  hý: "hý",
  hỉ: "hỷ",
  hỷ: "hỷ",
  hì: "hỳ",
  hỳ: "hỳ",
  bí: "by",
  bý: "by",
  vi: "vy",
  vy: "vy",
  ví: "vý",
  vý: "vý",
  quí: "quý",
  quý: "quý",
  nghi: "nghy",
  nghy: "nghy",
  // d/gi alternation and other common doublets
  nhất: "nhất",
  nhứt: "nhất",
  chánh: "chính",
  chính: "chính",
  hoà: "hòa",
  hòa: "hòa",
  thuý: "thúy",
  thúy: "thúy",
  quỳ: "quỳ",
};

/** Strip punctuation/extra whitespace and lowercase, preserving diacritics. */
function tidy(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFC")
    .replace(/[^\p{L}\p{M}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Fold a Vietnamese string into a canonical form for equality comparison.
 *
 * Lowercases, strips punctuation, and rewrites known orthographic variants
 * (lí↔lý, kĩ↔kỹ, hi↔hy, ...) so that two spellings of the same word compare
 * equal. Tone diacritics are otherwise preserved — they are phonemic in
 * Vietnamese and dropping them would create false cognate matches.
 */
export function normalizeVietnamese(s: string): string {
  if (!s) return "";
  return tidy(s)
    .split(" ")
    .map((syl) => SYLLABLE_VARIANTS[syl] ?? syl)
    .join(" ");
}

/** Vowels carrying each Vietnamese tone diacritic. */
const TONE_MARKS: Record<string, string[]> = {
  // huyền (grave)
  huyen: ["à", "ằ", "ầ", "è", "ề", "ì", "ò", "ồ", "ờ", "ù", "ừ", "ỳ"],
  // hỏi (hook above)
  hoi: ["ả", "ẳ", "ẩ", "ẻ", "ể", "ỉ", "ỏ", "ổ", "ở", "ủ", "ử", "ỷ"],
  // ngã (tilde)
  nga: ["ã", "ẵ", "ẫ", "ẽ", "ễ", "ĩ", "õ", "ỗ", "ỡ", "ũ", "ữ", "ỹ"],
  // sắc (acute)
  sac: ["á", "ắ", "ấ", "é", "ế", "í", "ó", "ố", "ớ", "ú", "ứ", "ý"],
  // nặng (dot below)
  nang: ["ạ", "ặ", "ậ", "ẹ", "ệ", "ị", "ọ", "ộ", "ợ", "ụ", "ự", "ỵ"],
};

const MARK_LOOKUP = new Map<string, VietTone>();
for (const [tone, chars] of Object.entries(TONE_MARKS)) {
  for (const c of chars) MARK_LOOKUP.set(c, tone as VietTone);
}

export type VietTone = "ngang" | "huyen" | "hoi" | "nga" | "sac" | "nang";

/** Identify the Vietnamese tone of a single syllable from its diacritic. */
export function vietnameseTone(syllable: string): VietTone {
  for (const c of syllable.toLowerCase().normalize("NFC")) {
    const t = MARK_LOOKUP.get(c);
    if (t) return t;
  }
  return "ngang";
}

/**
 * Entering-tone (入聲) codas.
 *
 * Middle Chinese entering-tone syllables ended in an unreleased -p/-t/-k stop.
 * Vietnamese preserved those codas (written -p, -t, -c, -ch); Mandarin lost the
 * category entirely and redistributed its syllables across all four modern
 * tones with no surviving regularity (học→xué T2, quốc→guó T2, nhất→yī T1,
 * mục→mù T4). Any tone prediction for these is a coin flip.
 */
const ENTERING_CODAS = ["ch", "c", "p", "t"];

/** True if the Hán-Việt syllable (or any syllable of a word) is entering-tone. */
export function isEnteringTone(hanviet: string): boolean {
  if (!hanviet) return false;
  return tidy(hanviet)
    .split(" ")
    .some((syl) => ENTERING_CODAS.some((coda) => syl.endsWith(coda)));
}

/**
 * The classical Hán-Việt → Mandarin tone correspondence.
 *
 * ngang→T1, huyền→T2, hỏi→T3, ngã→T3, sắc→T4, nặng→T4.
 * Returns null for entering-tone syllables, where the rule does not apply.
 */
export function predictMandarinTone(hanviet: string): number | null {
  const syl = tidy(hanviet);
  if (!syl) return null;
  if (isEnteringTone(syl)) return null;
  switch (vietnameseTone(syl)) {
    case "ngang":
      return 1;
    case "huyen":
      return 2;
    case "hoi":
    case "nga":
      return 3;
    case "sac":
    case "nang":
      return 4;
  }
}

/** Per-syllable tone predictions for a whole Hán-Việt reading. */
export function predictMandarinTones(hanviet: string): (number | null)[] {
  if (!hanviet) return [];
  return tidy(hanviet)
    .split(" ")
    .map((syl) => predictMandarinTone(syl));
}

/**
 * Grade how trustworthy the tone prediction is for a word.
 *
 * - "low"    — any syllable is entering-tone; the rule simply does not apply.
 * - "high"   — the rule's prediction matches the real Mandarin tone everywhere.
 * - "medium" — the rule applies but gets at least one syllable wrong.
 *
 * Neutral-tone syllables (5) are skipped rather than counted as misses: they
 * are a Mandarin prosodic reduction, not a tone the Hán-Việt reading could
 * ever have predicted.
 */
export function getToneConfidence(
  hanviet: string | null,
  actualTones: number[],
): ToneConfidence {
  if (!hanviet) return "low";
  if (isEnteringTone(hanviet)) return "low";
  const predicted = predictMandarinTones(hanviet);
  if (predicted.length === 0 || predicted.length !== actualTones.length) {
    return "low";
  }
  let compared = 0;
  for (let i = 0; i < predicted.length; i++) {
    const actual = actualTones[i];
    if (actual === 5 || actual === 0) continue;
    const p = predicted[i];
    if (p === null) return "low";
    compared++;
    if (p !== actual) return "medium";
  }
  return compared === 0 ? "low" : "high";
}

/**
 * How a Hán-Việt reading lines up with the Vietnamese glosses.
 *
 * - "exact"       — the reading IS one of the glosses. Safe to claim identity.
 * - "toneVariant" — same base letters, different tone marks (tri/trí,
 *                   trường/trưởng). The learner will recognise it, but it is
 *                   not the same word, so the UI should hedge.
 * - "contained"   — the reading appears as a whole word inside a longer gloss
 *                   ("bắc" within "phía bắc"). Recognisable, but the Vietnamese
 *                   word carries extra material.
 * - "none"        — no relationship; Vietnamese uses an unrelated native word.
 */
export type CognateMatch = "exact" | "toneVariant" | "contained" | "none";

/** Strip Vietnamese tone diacritics, keeping letter identity (đ, ă, ơ, ư). */
export function stripTones(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̣̀́̃̉]/g, "")
    .normalize("NFC");
}

/** Split a gloss into individual senses. CVDICT separates them with ";" and "/". */
function senses(gloss: string): string[] {
  return gloss.split(/[;/]/).map((g) => g.trim()).filter(Boolean);
}

/**
 * Classify the relationship between a Hán-Việt reading and the Vietnamese
 * glosses, from strongest to weakest.
 *
 * Containment is tested on whole-syllable boundaries rather than with raw
 * substring search: `"phía bắc".includes("bắc")` is correct, but a raw
 * `includes` would also match "ba" inside "bao" and manufacture cognates out
 * of unrelated short syllables.
 */
export function classifyCognate(
  hanviet: string | null,
  viGlosses: string[],
): CognateMatch {
  if (!hanviet) return "none";
  const target = normalizeVietnamese(hanviet);
  if (!target) return "none";
  const targetSyls = target.split(" ");
  const targetBare = stripTones(target);

  const all = viGlosses.flatMap(senses).map((s) => normalizeVietnamese(s));

  for (const s of all) if (s === target) return "exact";
  for (const s of all) if (stripTones(s) === targetBare) return "toneVariant";

  // Whole-syllable containment, e.g. "bắc" inside "phía bắc".
  for (const s of all) {
    const syls = s.split(" ");
    if (syls.length <= targetSyls.length) continue;
    for (let i = 0; i + targetSyls.length <= syls.length; i++) {
      if (syls.slice(i, i + targetSyls.length).join(" ") === target) {
        return "contained";
      }
    }
  }
  return "none";
}

/**
 * Is the Hán-Việt reading itself a live Vietnamese word with the same meaning?
 *
 * True for exact, tone-variant and whole-word-contained matches. Callers that
 * need to phrase a hint honestly should use `classifyCognate` and tell the
 * user which kind of match it is rather than asserting identity.
 */
export function isCognateMatch(
  hanviet: string | null,
  viGlosses: string[],
): boolean {
  return classifyCognate(hanviet, viGlosses) !== "none";
}

/** Convert numeric pinyin ("an1 quan2") into per-syllable tone numbers. */
/**
 * Tone numbers from *diacritic* pinyin ("hái" -> [2], "dìfang" -> [4, 5]).
 *
 * The HSK wordlist stores readings this way, and it is the only field that
 * distinguishes polyphone rows from each other: 还 appears once as hái and
 * once as huán. Deriving the reading from the character instead collapses the
 * two onto one dictionary entry.
 */
/**
 * Bare letters from Mandarin diacritic pinyin ("kān" -> "kan", "lǜ" -> "lv").
 *
 * Distinct from stripTones(), which is tuned for Vietnamese and deliberately
 * preserves letters like đ/ă/ơ. Applied to pinyin it leaves the tone mark in
 * place, so Mandarin needs its own reduction.
 */
export function bareMandarinPinyin(diacritic: string): string {
  return diacritic
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ü/g, "v")
    .toLowerCase()
    .trim();
}

export function toneNumbersFromDiacriticPinyin(diacritic: string): number[] {
  // Combining marks, in Unicode tone order: macron, acute, caron, grave.
  const MARKS: Record<string, number> = {
    "\u0304": 1,
    "\u0301": 2,
    "\u030c": 3,
    "\u0300": 4,
  };
  return diacritic
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((syl) => {
      for (const ch of syl.normalize("NFD")) {
        const tone = MARKS[ch];
        if (tone) return tone;
      }
      return 5; // no mark: neutral tone
    });
}

export function toneNumbersFromNumericPinyin(numeric: string): number[] {
  return numeric
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((syl) => {
      const m = syl.match(/([0-5])$/);
      if (!m) return 5;
      const n = Number(m[1]);
      return n === 0 ? 5 : n;
    });
}
