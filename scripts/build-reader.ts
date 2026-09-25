/**
 * Build the Stage 3 reading corpus.
 *
 *   yarn build:reader
 *
 * Tatoeba's Mandarin sentences with an English translation, kept only when
 * every word in them is a deck word, so any word the learner taps has a
 * Hán-Việt reading, a gloss and a card behind it. Proper nouns (汤姆 "Tom") and
 * a few particles outside the deck are allowed through with a gloss of their
 * own, because excluding them would drop thousands of ordinary sentences.
 *
 * Emits data/reader/L1.json ... L6.json (one shard per HSK level, loaded
 * lazily), data/reader/index.json, data/word-frequency.json (new-card order)
 * and data/READER-REPORT.md.
 *
 * Sources, cached in scripts/.cache/:
 *   - Tatoeba sentences and links, CC BY 2.0 FR (https://tatoeba.org)
 *   - CC-CEDICT, for the traditional-character filter and proper-noun glosses
 */
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, readFileSync } from "node:fs";
import { mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { gunzipSync } from "node:zlib";
import { pinyin } from "pinyin-pro";

import { bareMandarinPinyin, type Word } from "../lib/hanviet";
import { encodeSentence, type ReaderSentence, type ReaderToken } from "../lib/reader";
import { NON_ERHUA_WORDS } from "./segment-sentences";

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "scripts", ".cache");
const DATA = path.join(ROOT, "data");
const OUT = path.join(DATA, "reader");

const TATOEBA = "https://downloads.tatoeba.org/exports/per_language";
const SOURCES = {
  cmn: `${TATOEBA}/cmn/cmn_sentences_detailed.tsv.bz2`,
  cmnEng: `${TATOEBA}/cmn/cmn-eng_links.tsv.bz2`,
  eng: `${TATOEBA}/eng/eng_sentences.tsv.bz2`,
  cmnVie: `${TATOEBA}/cmn/cmn-vie_links.tsv.bz2`,
  vie: `${TATOEBA}/vie/vie_sentences.tsv.bz2`,
} as const;

const LEVELS = ["1", "2", "3", "4", "5", "6"] as const;
const LEVEL_RANK: Record<string, number> = { "1": 1, "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, S: 1 };

/** Sentences worth reading on a phone: long enough to say something, short enough to parse. */
const MIN_HANZI = 3;
const MAX_HANZI = 20;
/** Mined sentences become tile exercises, where more than this many tiles is a slog. */
const MAX_WORD_TOKENS = 14;
/** Per shard. The corpus is precached, so it is capped rather than shipped whole. */
const SHARD_CAP: Record<string, number> = { "1": 2600, "2": 2400, "3": 2000, "4": 1600, "5": 1400, "6": 1200 };
/** Sentences per rarest word before that word stops earning a sentence a slot. */
const PER_WORD = 6;

/**
 * Particles outside the deck, glossed so they are not dead taps. 们 and 第 are
 * bound morphemes that HSK lists only inside words (我们, 第一), but Tatoeba
 * attaches them freely (朋友们, 第三).
 */
const FREE_PARTICLES: Record<string, string> = {
  们: "plural suffix for people (朋友们 = friends)",
  第: "ordinal prefix (第三 = third)",
  哦: "oh! (surprise, realisation)",
  嗯: "mm, uh-huh",
  哈: "ha",
  唉: "sigh; alas",
  嘿: "hey",
};

/**
 * Vulgarities made entirely of HSK characters, so the deck filter lets them
 * through (他妈的 is 他 + 妈 + 的).
 */
const BLOCKLIST = ["他妈", "妈的", "操你", "傻逼", "婊子", "屁股", "混蛋", "王八"];

const HAN = /\p{Script=Han}/u;
const LATIN = /[A-Za-zＡ-Ｚａ-ｚ]/;

async function download(url: string, dest: string): Promise<void> {
  if (existsSync(dest)) {
    console.log(`  cached  ${path.basename(dest)}`);
    return;
  }
  console.log(`  fetch   ${path.basename(dest)}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) throw new Error(`Failed to download ${url}: ${res.status}`);
  const tmp = `${dest}.partial`;
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
  await rename(tmp, dest);
}

/** Decompresses with the system bzip2; Node has no bzip2 codec of its own. */
function readBz2(file: string): string {
  const out = spawnSync("bzip2", ["-dc", file], { maxBuffer: 1024 * 1024 * 1024 });
  if (out.status !== 0) throw new Error(`bzip2 failed on ${file}: ${out.stderr.toString()}`);
  return out.stdout.toString("utf8");
}

function tsvRows(text: string): string[][] {
  return text.split("\n").filter(Boolean).map((line) => line.split("\t"));
}

/** Lexicon entry for one surface form. */
interface Entry {
  words?: Word[];
  name?: string;
  particle?: string;
}

interface Lexicon {
  entries: Map<string, Entry>;
  maxLength: number;
}

/**
 * Deck words, plus erhua-less spellings of the 儿 words. HSK writes 玩儿 and
 * 女孩儿; written Mandarin mostly drops the 儿, and without these Tatoeba's 玩
 * and 女孩 would be unknown tokens.
 */
function deckEntries(words: Word[]): Map<string, Entry> {
  const entries = new Map<string, Entry>();
  const add = (surface: string, word: Word) => {
    const e = entries.get(surface) ?? {};
    e.words = [...(e.words ?? []), word];
    entries.set(surface, e);
  };
  for (const w of words) {
    add(w.simplified, w);
    for (const v of w.variants ?? []) add(v, w);
  }
  for (const w of words) {
    const s = w.simplified;
    if (s.length < 2 || !s.endsWith("儿") || NON_ERHUA_WORDS.has(s)) continue;
    const base = s.slice(0, -1);
    if (!entries.has(base)) add(base, w);
  }
  return entries;
}

interface Cedict {
  /** Characters that only ever occur in traditional forms. */
  traditionalOnly: Set<string>;
  /** Proper nouns with no common-noun reading, e.g. 汤姆 -> "Tom". */
  properNouns: Map<string, string>;
}

/**
 * CC-CEDICT marks proper nouns with capitalised pinyin. Only those with no
 * lowercase (common-word) entry are kept, so 东方 "the East" never gets read as
 * the surname Dongfang.
 */
function readCedict(file: string): Cedict {
  const simplifiedChars = new Set<string>();
  const traditionalCandidates = new Set<string>();
  const common = new Set<string>();
  const proper = new Map<string, string>();

  for (const line of gunzipSync(readFileSync(file)).toString("utf8").split("\n")) {
    if (line.startsWith("#")) continue;
    const m = line.match(/^(\S+) (\S+) \[([^\]]*)\] \/(.*)\/\s*$/);
    if (!m) continue;
    const [, trad, simp, py, defs] = m;
    const tc = [...trad];
    const sc = [...simp];
    for (const c of sc) simplifiedChars.add(c);
    if (tc.length === sc.length) tc.forEach((c, i) => c !== sc[i] && traditionalCandidates.add(c));

    if (/^[a-z]/.test(py)) {
      common.add(simp);
      continue;
    }
    if (sc.length < 2 || !sc.every((c) => HAN.test(c)) || proper.has(simp)) continue;
    const first = defs.split("/")[0] ?? "";
    if (/surname|variant of|abbr\.|old name/i.test(first)) continue;
    const gloss = first
      .replace(/\s*\((?:name|given name|female name|male name)\)/gi, "")
      .split(/[,;(]/)[0]
      .trim();
    if (gloss && gloss.length <= 32) proper.set(simp, gloss);
  }

  for (const s of common) proper.delete(s);
  return {
    traditionalOnly: new Set([...traditionalCandidates].filter((c) => !simplifiedChars.has(c))),
    properNouns: proper,
  };
}

function buildLexicon(words: Word[], cedict: Cedict): Lexicon {
  const entries = deckEntries(words);
  for (const [surface, gloss] of cedict.properNouns) {
    if (!entries.has(surface)) entries.set(surface, { name: gloss });
  }
  for (const [surface, gloss] of Object.entries(FREE_PARTICLES)) {
    if (!entries.has(surface)) entries.set(surface, { particle: gloss });
  }
  let maxLength = 1;
  for (const s of entries.keys()) maxLength = Math.max(maxLength, [...s].length);
  return { entries, maxLength: Math.min(maxLength, 8) };
}

interface RawToken {
  text: string;
  entry?: Entry;
}

/**
 * Splits a sentence into tokens, or returns null if any hanzi is not covered.
 *
 * Han runs are segmented by dynamic programming rather than greedy longest
 * match: fewest tokens wins, then the lowest-level words. Greedy matching
 * reads 汤姆 as 汤 "soup" + an unknown 姆 simply because 汤 comes first.
 */
export function tokenize(text: string, lexicon: Lexicon): RawToken[] | null {
  const chars = [...text];
  const out: RawToken[] = [];
  let i = 0;
  while (i < chars.length) {
    if (!HAN.test(chars[i])) {
      // Digits run together (2023, 10); everything else is one token per char.
      let j = i + 1;
      if (/[0-9０-９]/.test(chars[i])) while (j < chars.length && /[0-9０-９.:]/.test(chars[j])) j++;
      out.push({ text: chars.slice(i, j).join("") });
      i = j;
      continue;
    }
    let j = i;
    while (j < chars.length && HAN.test(chars[j])) j++;
    const run = segmentRun(chars.slice(i, j), lexicon);
    if (!run) return null;
    out.push(...run);
    i = j;
  }
  return out;
}

function entryCost(entry: Entry): number {
  if (entry.words) return 1000 + Math.min(...entry.words.map((w) => LEVEL_RANK[w.level] ?? 6));
  if (entry.name) return 1007;
  return 1008;
}

function segmentRun(chars: string[], lexicon: Lexicon): RawToken[] | null {
  const n = chars.length;
  const best: Array<{ cost: number; from: number; text: string; entry: Entry } | undefined> =
    new Array(n + 1);
  best[0] = { cost: 0, from: -1, text: "", entry: {} };
  for (let i = 0; i < n; i++) {
    const at = best[i];
    if (!at) continue;
    for (let len = 1; len <= Math.min(lexicon.maxLength, n - i); len++) {
      const text = chars.slice(i, i + len).join("");
      const entry = lexicon.entries.get(text);
      if (!entry) continue;
      const cost = at.cost + entryCost(entry);
      const cur = best[i + len];
      if (!cur || cost < cur.cost) best[i + len] = { cost, from: i, text, entry };
    }
  }
  if (!best[n]) return null;
  const tokens: RawToken[] = [];
  for (let k = n; k > 0; ) {
    const step = best[k]!;
    tokens.unshift({ text: step.text, entry: step.entry });
    k = step.from;
  }
  return tokens;
}

/** Syllables that need an apostrophe when joined inside a word (Tiān'ānmén). */
const VOWEL_INITIAL = /^[aeoāáǎàēéěèōóǒò]/;

function joinSyllables(syllables: string[]): string {
  return syllables.reduce(
    (acc, syl, i) => (i > 0 && VOWEL_INITIAL.test(syl) ? `${acc}'${syl}` : acc + syl),
    "",
  );
}

/**
 * Per-token pinyin, read from the whole sentence so polyphones and tone
 * sandhi resolve in context (了 le, 不是 bú shì, 一个 yí gè), then sliced.
 * 儿 after a syllable merges into it as erhua (一点儿 yìdiǎnr).
 */
function tokenPinyin(tokens: RawToken[]): string[] | null {
  const han = tokens.filter((t) => HAN.test(t.text)).map((t) => t.text).join("");
  const syllables = pinyin(han, { type: "array", toneType: "symbol" });
  const hanChars = [...han];
  if (!Array.isArray(syllables) || syllables.length !== hanChars.length) return null;

  const out: string[] = [];
  let k = 0;
  for (const t of tokens) {
    if (!HAN.test(t.text)) {
      out.push("");
      continue;
    }
    const chars = [...t.text];
    const parts: string[] = [];
    chars.forEach((c, i) => {
      const syl = syllables[k + i];
      const forward = c + (chars[i + 1] ?? "");
      const backward = (chars[i - 1] ?? "") + c;
      const erhua = c === "儿" && i > 0 && !NON_ERHUA_WORDS.has(forward) && !NON_ERHUA_WORDS.has(backward);
      if (erhua) parts[parts.length - 1] += "r";
      else parts.push(syl);
    });
    k += chars.length;
    const joined = joinSyllables(parts);
    out.push(t.entry?.name ? joined.charAt(0).toUpperCase() + joined.slice(1) : joined);
  }
  return out;
}

function comparablePinyin(p: string): string {
  return p.normalize("NFC").toLowerCase().replace(/[\s']/g, "");
}

const NUMERAL_OR_DEMONSTRATIVE = /^[一二两三四五六七八九十几这那每半哪]$/;
const PRONOUN = /^(我|你|他|她|您|我们|你们|他们|她们|咱们|大家)$/;

/**
 * Context rules for the polyphones pinyin-pro gets wrong often enough to
 * matter at beginner level. Each is a surface pattern with a clear winner:
 *
 *   只  zhī after a numeral or demonstrative (一只猫), otherwise zhǐ "only"
 *   还  huán before 给/钱/书 (还给我, 还钱), otherwise hái
 *   得  děi "must" right after a pronoun (我得走了), otherwise pinyin-pro
 *   谁  shéi, the HSK reading; pinyin-pro gives the literary shuí
 */
export function correctPolyphone(text: string, contextPinyin: string, prev?: string, next?: string): string {
  switch (text) {
    case "只":
      return prev && NUMERAL_OR_DEMONSTRATIVE.test(prev) ? "zhī" : "zhǐ";
    case "还":
      return next && /^(给|钱|书)$/.test(next) ? "huán" : "hái";
    case "得":
      return prev && PRONOUN.test(prev) ? "děi" : contextPinyin;
    case "谁":
      return "shéi";
    default:
      return contextPinyin;
  }
}

/**
 * The deck's own reading for a multi-character word carries its neutral tones
 * (朋友 péngyou, 认识 rènshi), which pinyin-pro drops. Words with 一 or 不 keep
 * the context reading, since their tone depends on what follows.
 */
function displayPinyin(text: string, word: Word | undefined, context: string): string {
  if (!word || [...text].length < 2 || /[一不]/.test(text)) return context;
  const isSurface = text === word.simplified || (word.variants ?? []).includes(text);
  return isSurface ? word.pinyin.replace(/\s+/g, "") : context;
}

/**
 * Picks the deck entry for a surface with several (还 hái "still" and 还 huán
 * "return"), by which one's reading matches the context pinyin. Falls back to
 * the lowest level, which is the commoner sense.
 */
function resolveWord(words: Word[], contextPinyin: string): Word {
  if (words.length === 1) return words[0];
  const target = comparablePinyin(contextPinyin);
  const exact = words.find((w) => comparablePinyin(w.pinyin) === target);
  if (exact) return exact;
  const bare = bareMandarinPinyin(target);
  const loose = words.find((w) => bareMandarinPinyin(comparablePinyin(w.pinyin)) === bare);
  if (loose) return loose;
  return [...words].sort((a, b) => (LEVEL_RANK[a.level] ?? 6) - (LEVEL_RANK[b.level] ?? 6))[0];
}

interface Candidate {
  sentence: ReaderSentence;
  hanziCount: number;
  wordIds: string[];
}

function levelOf(wordIds: string[], byId: Map<string, Word>): string {
  let max = 1;
  for (const id of wordIds) max = Math.max(max, LEVEL_RANK[byId.get(id)?.level ?? "6"] ?? 6);
  return String(max);
}

async function main() {
  await mkdir(CACHE, { recursive: true });
  await mkdir(OUT, { recursive: true });

  console.log("Downloading sources");
  const files: Record<keyof typeof SOURCES, string> = {} as never;
  for (const [key, url] of Object.entries(SOURCES) as [keyof typeof SOURCES, string][]) {
    files[key] = path.join(CACHE, `tatoeba-${path.basename(url)}`);
    await download(url, files[key]);
  }

  console.log("Reading deck and CC-CEDICT");
  const words = JSON.parse(readFileSync(path.join(DATA, "words.json"), "utf8")) as Word[];
  const byId = new Map(words.map((w) => [w.id, w]));
  const cedict = readCedict(path.join(CACHE, "cedict.txt.gz"));
  const lexicon = buildLexicon(words, cedict);

  console.log("Reading Tatoeba");
  const firstLink = (rows: string[][]) => {
    const m = new Map<string, string[]>();
    for (const [a, b] of rows) (m.get(a) ?? m.set(a, []).get(a)!).push(b);
    return m;
  };
  const engLinks = firstLink(tsvRows(readBz2(files.cmnEng)));
  const vieLinks = firstLink(tsvRows(readBz2(files.cmnVie)));
  const wanted = new Set([...engLinks.values(), ...vieLinks.values()].flat());
  const translations = new Map<string, string>();
  for (const key of ["eng", "vie"] as const) {
    for (const [id, , text] of tsvRows(readBz2(files[key]))) {
      if (wanted.has(id) && text) translations.set(id, text.trim());
    }
  }

  const stats = {
    tatoeba: 0,
    withEnglish: 0,
    simplified: 0,
    lengthOk: 0,
    covered: 0,
    unique: 0,
    rejected: { latin: 0, blocklist: 0, tooManyWords: 0, pinyin: 0, noDeckWord: 0 },
  };
  const frequency = new Map<string, number>();
  const nameUse = new Map<string, number>();
  const particleUse = new Map<string, number>();
  const dedupe = new Set<string>();
  const candidates: Candidate[] = [];

  for (const [id, , rawText, author] of tsvRows(readBz2(files.cmn))) {
    stats.tatoeba++;
    const en = (engLinks.get(id) ?? []).map((e) => translations.get(e)).find(Boolean);
    if (!en) continue;
    stats.withEnglish++;
    const text = rawText.trim();
    if ([...text].some((c) => cedict.traditionalOnly.has(c))) continue;
    stats.simplified++;
    if (LATIN.test(text)) {
      stats.rejected.latin++;
      continue;
    }
    const hanziCount = [...text].filter((c) => HAN.test(c)).length;
    if (hanziCount < MIN_HANZI || hanziCount > MAX_HANZI) continue;
    stats.lengthOk++;
    if (BLOCKLIST.some((b) => text.includes(b))) {
      stats.rejected.blocklist++;
      continue;
    }

    const raw = tokenize(text, lexicon);
    if (!raw) continue;
    stats.covered++;
    const wordTokens = raw.filter((t) => t.entry?.words);
    if (raw.filter((t) => HAN.test(t.text)).length > MAX_WORD_TOKENS) {
      stats.rejected.tooManyWords++;
      continue;
    }
    if (wordTokens.length === 0) {
      stats.rejected.noDeckWord++;
      continue;
    }
    const pys = tokenPinyin(raw);
    if (!pys) {
      stats.rejected.pinyin++;
      continue;
    }

    const tokens: ReaderToken[] = raw.map((t, i) => {
      const context = correctPolyphone(t.text, pys[i], raw[i - 1]?.text, raw[i + 1]?.text);
      const token: ReaderToken = { text: t.text, pinyin: context };
      if (t.entry?.words) {
        const word = resolveWord(t.entry.words, context);
        token.wordId = word.id;
        token.pinyin = displayPinyin(t.text, word, context);
      } else if (t.entry?.name) token.free = { kind: "name", gloss: t.entry.name };
      else if (t.entry?.particle) token.free = { kind: "particle", gloss: t.entry.particle };
      return token;
    });
    const wordIds = [...new Set(tokens.flatMap((t) => (t.wordId ? [t.wordId] : [])))];
    for (const w of wordIds) frequency.set(w, (frequency.get(w) ?? 0) + 1);

    const key = [...text].filter((c) => HAN.test(c)).join("");
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    stats.unique++;

    for (const t of tokens) {
      if (t.free?.kind === "name") nameUse.set(t.text, (nameUse.get(t.text) ?? 0) + 1);
      if (t.free?.kind === "particle") particleUse.set(t.text, (particleUse.get(t.text) ?? 0) + 1);
    }
    const vi = (vieLinks.get(id) ?? []).map((v) => translations.get(v)).find(Boolean);
    candidates.push({
      sentence: {
        id: `T${id}`,
        hanzi: text,
        en,
        ...(vi ? { vi } : {}),
        level: levelOf(wordIds, byId),
        tokens,
        author: author && author !== "\\N" ? author : "",
      },
      hanziCount,
      wordIds,
    });
  }

  console.log("Selecting per level");
  const shards: Record<string, ReaderSentence[]> = {};
  const available: Record<string, number> = {};
  for (const level of LEVELS) {
    const pool = candidates.filter((c) => c.sentence.level === level);
    available[level] = pool.length;
    const rarest = (c: Candidate) =>
      c.wordIds.reduce((min, w) => ((frequency.get(w) ?? 0) < (frequency.get(min) ?? 0) ? w : min));
    // Fewest at-level words first (the gentlest way into the level), then
    // shortest, then oldest id for a stable order across rebuilds.
    const atLevel = (c: Candidate) =>
      c.wordIds.filter((w) => (LEVEL_RANK[byId.get(w)?.level ?? "6"] ?? 6) === Number(level)).length;
    pool.sort(
      (a, b) =>
        atLevel(a) - atLevel(b) ||
        a.hanziCount - b.hanziCount ||
        Number(a.sentence.id.slice(1)) - Number(b.sentence.id.slice(1)),
    );
    const perWord = new Map<string, number>();
    const chosen: ReaderSentence[] = [];
    for (const c of pool) {
      if (chosen.length >= SHARD_CAP[level]) break;
      const r = rarest(c);
      if ((perWord.get(r) ?? 0) >= PER_WORD) continue;
      perWord.set(r, (perWord.get(r) ?? 0) + 1);
      chosen.push(c.sentence);
    }
    chosen.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
    shards[level] = chosen;
  }

  console.log("Writing");
  const counts: Record<string, number> = {};
  let bytes = 0;
  for (const level of LEVELS) {
    const lines = shards[level].map((s) => JSON.stringify(encodeSentence(s)));
    const body = `{"level":"${level}","sentences":[\n${lines.join(",\n")}\n]}\n`;
    await writeFile(path.join(OUT, `L${level}.json`), body);
    counts[level] = shards[level].length;
    bytes += Buffer.byteLength(body);
  }
  await writeFile(
    path.join(OUT, "index.json"),
    `${JSON.stringify(
      {
        builtAt: new Date().toISOString(),
        levels: counts,
        attribution:
          "Sentences from Tatoeba (https://tatoeba.org), licensed CC BY 2.0 FR. Each sentence links to its page and author.",
      },
      null,
      2,
    )}\n`,
  );

  // Deck words by how many corpus sentences use them: the new-card order, so
  // the words met most often in real text are learned first.
  const freqOut: Record<string, number> = {};
  for (const w of words) freqOut[w.id] = frequency.get(w.id) ?? 0;
  await writeFile(path.join(DATA, "word-frequency.json"), `${JSON.stringify(freqOut)}\n`);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const top = (m: Map<string, number>, n: number) =>
    [...m].sort((a, b) => b[1] - a[1]).slice(0, n);
  const glossOf = (surface: string) =>
    lexicon.entries.get(surface)?.name ?? lexicon.entries.get(surface)?.particle ?? "";
  const sample = (level: string) =>
    shards[level]
      .filter((_, i) => i % Math.max(1, Math.floor(shards[level].length / 6)) === 0)
      .slice(0, 6)
      .map(
        (s) =>
          `- ${s.hanzi} — ${s.en}\n  ${s.tokens
            .filter((t) => t.pinyin)
            .map((t) => `${t.text}/${t.pinyin}${t.free ? `(${t.free.kind})` : ""}`)
            .join(" ")}`,
      )
      .join("\n");

  const report = `# Reader corpus report

Generated by \`yarn build:reader\` on ${new Date().toISOString().slice(0, 10)}.

## Funnel

| Step | Sentences |
|---|---:|
| Tatoeba Mandarin | ${stats.tatoeba.toLocaleString()} |
| with an English translation | ${stats.withEnglish.toLocaleString()} |
| simplified script only | ${stats.simplified.toLocaleString()} |
| ${MIN_HANZI}–${MAX_HANZI} hanzi, no Latin letters, not blocklisted | ${stats.lengthOk.toLocaleString()} |
| every hanzi covered by the deck, a name or a particle | ${stats.covered.toLocaleString()} |
| unique after dropping duplicates | ${stats.unique.toLocaleString()} |
| **shipped** | **${total.toLocaleString()}** (${(bytes / 1024 / 1024).toFixed(1)} MB) |

Rejected after segmentation: ${stats.rejected.tooManyWords} over ${MAX_WORD_TOKENS} word tokens,
${stats.rejected.noDeckWord} with no deck word at all, ${stats.rejected.pinyin} where the pinyin did not
line up with the characters. Before it: ${stats.rejected.latin} containing Latin letters,
${stats.rejected.blocklist} blocklisted.

## Per level

A sentence's level is the highest HSK level among its words. Each shard keeps the gentlest
sentences first (fewest words at that level, then shortest), and caps each sentence's rarest
word at ${PER_WORD} sentences so common words cannot crowd out the rest.

| Level | Available | Shipped |
|---|---:|---:|
${LEVELS.map((l) => `| HSK ${l} | ${available[l].toLocaleString()} | ${counts[l].toLocaleString()} |`).join("\n")}

## Proper nouns and particles

Allowed through with a gloss but never counted as unknown words.

Names, most used: ${top(nameUse, 25).map(([s, n]) => `${s} ${glossOf(s)} (${n})`).join(", ")}

Particles: ${top(particleUse, 10).map(([s, n]) => `${s} (${n})`).join(", ")}

## Known limits

- Polyphones are read by pinyin-pro in sentence context. It is right for the common cases
  (了 le, 得 de, 不/一 sandhi) but not always: it reads 还 in 把书还给我 as hái, not huán.
- Tatoeba is crowd-written. Sentences are natural far more often than not, but a few are stilted.

## Samples

${LEVELS.map((l) => `### HSK ${l}\n\n${sample(l)}`).join("\n\n")}
`;
  await writeFile(path.join(DATA, "READER-REPORT.md"), report);

  console.log(`  ${total} sentences across ${LEVELS.length} shards, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`  levels ${JSON.stringify(counts)}`);
}

// Guarded so tests can import tokenize() without triggering a full build.
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
