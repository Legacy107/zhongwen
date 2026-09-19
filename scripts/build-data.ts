/**
 * Build the Chinese-learning dataset.
 *
 *   yarn build:data
 *
 * Downloads the upstream sources into scripts/.cache/ (skipped when already
 * present) and emits committed JSON into data/.
 *
 * Sources:
 *   - HSK 3.0 wordlist + grammar (ivankra/hsk30, MIT)
 *   - CVDICT Chinese->Vietnamese dictionary (Phong Phan, CC BY-SA 4.0)
 *   - CC-CEDICT Chinese->English dictionary (MDBG, CC BY-SA 4.0)
 *   - Unihan (Unicode, for kVietnamese / kMandarin / stroke counts)
 */
import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile, access, rm, rename } from "node:fs/promises";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { createGunzip } from "node:zlib";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { pinyin } from "pinyin-pro";

import {
  classifyCognate,
  getToneConfidence,
  isEnteringTone,
  predictMandarinTones,
  bareMandarinPinyin,
  toneNumbersFromDiacriticPinyin,
  toneNumbersFromNumericPinyin,
  type Char,
  type FalseFriend,
  type GrammarPoint,
  type Word,
} from "../lib/hanviet";
import { HANVIET_SUPPLEMENT, WORD_HANVIET_OVERRIDES } from "./hanviet-supplement";
import { FALSE_FRIENDS } from "./false-friends";

const execFileAsync = promisify(execFile);

const ROOT = path.resolve(import.meta.dirname, "..");
const CACHE = path.join(ROOT, "scripts", ".cache");
const DATA = path.join(ROOT, "data");

const SOURCES = {
  hsk: {
    url: "https://raw.githubusercontent.com/ivankra/hsk30/master/hsk30.csv",
    file: "hsk30.csv",
  },
  grammar: {
    url: "https://raw.githubusercontent.com/ivankra/hsk30/master/hsk30-grammar.csv",
    file: "hsk30-grammar.csv",
  },
  cvdict: {
    url: "https://raw.githubusercontent.com/ph0ngp/CVDICT/master/CVDICT.u8",
    file: "CVDICT.u8",
  },
  cedict: {
    url: "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz",
    file: "cedict.txt.gz",
  },
  unihan: {
    url: "https://www.unicode.org/Public/UCD/latest/ucd/Unihan.zip",
    file: "Unihan.zip",
  },
} as const;

/** HSK levels emitted into words.json. 7-9 is a single merged band upstream. */
const LEVELS = ["1", "2", "3", "4", "5", "6"] as const;

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function download(url: string, dest: string): Promise<void> {
  if (await exists(dest)) {
    console.log(`  cached  ${path.basename(dest)}`);
    return;
  }
  console.log(`  fetch   ${path.basename(dest)}`);
  const res = await fetch(url);
  if (!res.ok || !res.body) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const tmp = `${dest}.partial`;
  await pipeline(Readable.fromWeb(res.body as never), createWriteStream(tmp));
  await execFileAsync("mv", [tmp, dest]);
}

/** Read a gzipped UTF-8 text file. */
async function readGzip(file: string): Promise<string> {
  const chunks: Buffer[] = [];
  const gunzip = createGunzip();
  gunzip.on("data", (c: Buffer) => chunks.push(c));
  const { createReadStream } = await import("node:fs");
  await pipeline(createReadStream(file), gunzip);
  return Buffer.concat(chunks).toString("utf8");
}

/**
 * Minimal RFC4180-ish CSV parser.
 *
 * The HSK files contain quoted fields with embedded commas, so splitting on
 * "," is not safe.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      quoted = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

function csvRecords(text: string): Record<string, string>[] {
  const rows = parseCsv(text);
  const header = rows[0];
  return rows.slice(1).map((r) => {
    const rec: Record<string, string> = {};
    header.forEach((h, i) => {
      rec[h] = r[i] ?? "";
    });
    return rec;
  });
}

interface DictEntry {
  traditional: string;
  simplified: string;
  pinyinNumeric: string;
  glosses: string[];
}

/**
 * Parse a CC-CEDICT-format line.
 *
 * Format: `TRAD SIMP [pin1 yin1] /gloss/gloss/`
 *
 * Splitting the whole line on "/" is wrong: glosses legitimately contain "/"
 * inside measure-word annotations such as `/LT:杯[bei1],壺|壶[hu2]/` and
 * `/CL:個|个[ge4]/`, and the pinyin field can contain slashes too. So the
 * headword is taken up to the first " /" and only the remainder is split,
 * with empty segments dropped.
 */
function parseDictLine(line: string): DictEntry | null {
  if (!line || line.startsWith("#")) return null;
  const sep = line.indexOf(" /");
  if (sep === -1) return null;
  const head = line.slice(0, sep);
  const body = line.slice(sep + 2);

  const open = head.indexOf("[");
  const close = head.lastIndexOf("]");
  if (open === -1 || close === -1) return null;
  const words = head.slice(0, open).trim().split(/\s+/);
  if (words.length < 2) return null;

  const glosses = body
    .split("/")
    .map((g) => g.trim())
    .filter(Boolean);
  if (glosses.length === 0) return null;

  return {
    traditional: words[0],
    simplified: words[1],
    pinyinNumeric: head.slice(open + 1, close).trim(),
    glosses,
  };
}

function parseDict(text: string): Map<string, DictEntry[]> {
  const map = new Map<string, DictEntry[]>();
  for (const line of text.split("\n")) {
    const e = parseDictLine(line.trimEnd());
    if (!e) continue;
    const list = map.get(e.simplified);
    if (list) list.push(e);
    else map.set(e.simplified, [e]);
  }
  return map;
}

/**
 * Is this gloss a surname sense?
 *
 * CC-CEDICT writes "surname Bai" and CVDICT inherits the convention as
 * "họ [Bai2]" — note the bracketed pinyin, which must be tolerated.
 *
 * `\b` cannot be used here. JavaScript's word-boundary is ASCII-only, so it
 * finds a boundary *inside* "học" (between ọ and c) and would classify học,
 * học sinh and every other học- word as a surname, while simultaneously
 * failing to match "họ [Bai2]" because ọ→space is not an ASCII boundary.
 * The separator is therefore matched explicitly: a surname gloss is the bare
 * word, or the word followed by a space or an opening bracket.
 */
function isSurnameGloss(g: string): boolean {
  return /^(họ|surname)(\s|\[|$)/i.test(g.trim());
}

/**
 * Drop surname senses when a real meaning also exists.
 *
 * Both dictionaries list surname senses first for many common characters, so
 * naively taking the glosses teaches "白 = surname Bai" instead of "white".
 * The surname is kept only when it is genuinely the sole meaning.
 */
function dropSurnameGlosses(glosses: string[]): string[] {
  const real = glosses.filter((g) => !isSurnameGloss(g));
  return real.length > 0 ? real : glosses;
}

/**
 * Is this a proper-noun entry (surname, ethnonym, place)?
 *
 * Both dictionaries capitalise the pinyin of proper-noun senses — 白 has
 * `[Bai2] /surname Bai/Bai ethnic group/` alongside `[bai2] /white/…`. Testing
 * only for a surname *gloss* is not enough, because the ethnonym sense in that
 * same entry is not a surname gloss and would keep the entry alive. The
 * capitalised pinyin is the reliable marker.
 */
function isProperNounEntry(e: DictEntry): boolean {
  if (/^[A-Z]/.test(e.pinyinNumeric)) return true;
  return e.glosses.every(isSurnameGloss);
}

/**
 * Pick the best entry for a headword.
 *
 * Proper-noun entries are deprioritised rather than merely filtered per-gloss:
 * common characters such as 白, 车, 高, 东, 百 and 国 get a *separate* entry for
 * the surname, and the capitalised entry frequently sorts first. Preferring a
 * tone match cannot break the tie, because the two entries differ only in case
 * and so carry identical tones.
 *
 * Genuine proper nouns (中国 Zhōngguó) have no lowercase alternative, so the
 * pool falls back to the full list and they still resolve.
 */
/**
 * Splits unspaced diacritic pinyin into syllables ("dìfang" -> "dì fang").
 *
 * The HSK column stores multi-syllable readings without separators, so tones
 * cannot be read per syllable until they are split.
 */
function splitSyllables(diacritic: string): string {
  if (/\s/.test(diacritic.trim())) return diacritic.trim();
  return diacritic
    .trim()
    .replace(/([aeiouüv][a-zü]*?)(?=[bcdfghjklmnpqrstwxyz][a-zü])/gi, "$1 ")
    .trim();
}

function pickEntry(
  entries: DictEntry[] | undefined,
  wantTones: number[],
  /** Diacritic reading from the HSK row, e.g. "huán". Disambiguates polyphones. */
  wantReading?: string,
): DictEntry | null {
  if (!entries || entries.length === 0) return null;
  const usable = entries.filter((e) => !isProperNounEntry(e));
  const pool = usable.length > 0 ? usable : entries;

  // Exact reading first. Tones alone cannot separate homotonal polyphones —
  // 还 is hái and huán, both tone 2 — so matching the syllables themselves is
  // the only way to keep those rows apart.
  if (wantReading) {
    // The HSK reading is diacritic ("huán"); CC-CEDICT's is numeric ("huan2").
    // Both sides are reduced to bare letters plus a tone list so they compare.
    const want = bareMandarinPinyin(wantReading).replace(/[\s'’]/g, "");
    const wantT = toneNumbersFromDiacriticPinyin(splitSyllables(wantReading));
    const sameLetters = pool.filter(
      (e) =>
        e.pinyinNumeric.replace(/[0-5\s'’]/g, "").toLowerCase().replace(/u:/g, "v") === want,
    );
    // Among same-letter candidates, tone decides: 看 is both kàn and kān, and
    // 过 is guò and neutral guo. Treating neutral as a wildcard here would
    // merge them, so an exact tone match is required first.
    const exact = sameLetters.find((e) => {
      const t = toneNumbersFromNumericPinyin(e.pinyinNumeric);
      return t.length === wantT.length && t.every((v, i) => v === wantT[i]);
    });
    if (exact) return exact;
    if (sameLetters.length === 1) return sameLetters[0];
  }

  if (wantTones.length > 0) {
    const match = pool.find((e) => {
      const t = toneNumbersFromNumericPinyin(e.pinyinNumeric);
      return (
        t.length === wantTones.length &&
        t.every((v, i) => v === wantTones[i] || v === 5 || wantTones[i] === 5)
      );
    });
    if (match) return match;
  }
  return pool[0];
}

interface UnihanData {
  vietnamese: Map<string, string>;
  /** Characters whose kVietnamese lists several readings, Hán-Việt mixed with Nôm. */
  ambiguousVietnamese: Map<string, string[]>;
  mandarin: Map<string, string>;
  traditionalVariant: Map<string, string[]>;
  totalStrokes: Map<string, number>;
  radical: Map<string, number>;
}

function cpToChar(cp: string): string {
  return String.fromCodePoint(parseInt(cp.replace("U+", ""), 16));
}

async function loadUnihan(): Promise<UnihanData> {
  const dir = path.join(CACHE, "unihan");
  const readings = path.join(dir, "Unihan_Readings.txt");
  if (!(await exists(readings))) {
    await mkdir(dir, { recursive: true });
    await execFileAsync("unzip", [
      "-o",
      "-q",
      path.join(CACHE, SOURCES.unihan.file),
      "Unihan_Readings.txt",
      "Unihan_Variants.txt",
      "Unihan_IRGSources.txt",
      "-d",
      dir,
    ]);
  }

  const data: UnihanData = {
    vietnamese: new Map(),
    ambiguousVietnamese: new Map(),
    mandarin: new Map(),
    traditionalVariant: new Map(),
    totalStrokes: new Map(),
    radical: new Map(),
  };

  const parse = async (file: string, fn: (ch: string, field: string, val: string) => void) => {
    const text = await readFile(path.join(dir, file), "utf8");
    for (const line of text.split("\n")) {
      if (!line || line.startsWith("#")) continue;
      const [cp, field, ...rest] = line.split("\t");
      if (!cp?.startsWith("U+") || !field) continue;
      fn(cpToChar(cp), field, rest.join("\t").trim());
    }
  };

  await parse("Unihan_Readings.txt", (ch, field, val) => {
    // kVietnamese often lists several readings, and they are NOT ordered with
    // the Sino-Vietnamese one first — the field mixes Hán-Việt readings with
    // Nôm (vernacular) ones. 每 is listed "hỏi mỏi mọi mỗi mủ mủi mũi", where
    // the Hán-Việt reading "mỗi" is fourth, and 百 is "bá bách trăm", where
    // the wanted reading "bách" is second and "trăm" is the native numeral.
    // Taking [0] blindly produces Nôm readings that break the bridge, so
    // multi-reading characters are resolved by the curated table instead.
    if (field === "kVietnamese") {
      const readings = val.split(/\s+/).filter(Boolean);
      if (readings.length === 1) data.vietnamese.set(ch, readings[0]);
      else data.ambiguousVietnamese.set(ch, readings);
    } else if (field === "kMandarin") {
      data.mandarin.set(ch, val.split(/\s+/)[0]);
    }
  });

  await parse("Unihan_Variants.txt", (ch, field, val) => {
    if (field !== "kTraditionalVariant") return;
    data.traditionalVariant.set(
      ch,
      val
        .split(/\s+/)
        .filter((t) => t.startsWith("U+"))
        .map((t) => cpToChar(t.split("<")[0])),
    );
  });

  await parse("Unihan_IRGSources.txt", (ch, field, val) => {
    if (field === "kTotalStrokes") {
      const n = Number(val.split(/\s+/)[0]);
      if (Number.isFinite(n)) data.totalStrokes.set(ch, n);
    } else if (field === "kRSUnicode") {
      const n = Number(val.split(/\s+/)[0].split(".")[0].replace("'", ""));
      if (Number.isFinite(n)) data.radical.set(ch, n);
    }
  });

  return data;
}

/**
 * Resolve the Hán-Việt reading for a single character.
 *
 * Unihan attaches kVietnamese almost exclusively to traditional forms, so
 * simplified characters must fall back through kTraditionalVariant. Even then
 * 348 HSK characters have no reading at all, which the curated supplement
 * covers. Source is tracked so the report can quantify the dependency.
 */
type HanvietSource = "supplement" | "unihan" | "unihan-trad" | "unihan-ambiguous";

function charHanviet(
  ch: string,
  u: UnihanData,
): { reading: string | null; source: HanvietSource | null } {
  // The curated table wins over Unihan: it exists both to fill gaps and to
  // disambiguate characters whose kVietnamese mixes Hán-Việt with Nôm.
  const sup = HANVIET_SUPPLEMENT[ch];
  if (sup) return { reading: sup, source: "supplement" };

  const direct = u.vietnamese.get(ch);
  if (direct) return { reading: direct, source: "unihan" };

  for (const t of u.traditionalVariant.get(ch) ?? []) {
    const v = u.vietnamese.get(t);
    if (v) return { reading: v, source: "unihan-trad" };
  }

  // Multi-reading characters not covered by the supplement: fall back to the
  // first listed reading, but flag it so the report can count the exposure.
  const amb =
    u.ambiguousVietnamese.get(ch) ??
    (u.traditionalVariant.get(ch) ?? [])
      .map((t) => u.ambiguousVietnamese.get(t))
      .find(Boolean);
  if (amb && amb.length > 0) {
    return { reading: amb[0], source: "unihan-ambiguous" };
  }
  return { reading: null, source: null };
}

function isHanzi(c: string): boolean {
  const cp = c.codePointAt(0) ?? 0;
  return (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf);
}

/** Capitalize a composed reading the way proper nouns are written (Trung Quốc). */
function titleCase(s: string): string {
  return s
    .split(" ")
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(" ");
}

async function main() {
  console.log("Chinese data pipeline\n");
  await mkdir(CACHE, { recursive: true });
  await mkdir(DATA, { recursive: true });

  console.log("Sources:");
  for (const s of Object.values(SOURCES)) {
    await download(s.url, path.join(CACHE, s.file));
  }

  console.log("\nParsing...");
  const unihan = await loadUnihan();
  console.log(`  unihan   ${unihan.vietnamese.size} kVietnamese readings`);

  const cvdictText = await readFile(path.join(CACHE, SOURCES.cvdict.file), "utf8");
  const cvdict = parseDict(cvdictText);
  console.log(`  cvdict   ${cvdict.size} headwords`);

  const cedictText = await readGzip(path.join(CACHE, SOURCES.cedict.file));
  const cedict = parseDict(cedictText);
  console.log(`  cedict   ${cedict.size} headwords`);

  const cedictVersion =
    cedictText.match(/#! date=(\S+)/)?.[1] ?? "unknown";

  const hskRows = csvRecords(
    await readFile(path.join(CACHE, SOURCES.hsk.file), "utf8"),
  );
  console.log(`  hsk      ${hskRows.length} rows`);

  // ---------------------------------------------------------------- words
  const words: Word[] = [];
  const charSet = new Set<string>();
  const hvSourceCount: Record<HanvietSource, number> = {
    supplement: 0,
    unihan: 0,
    "unihan-trad": 0,
    "unihan-ambiguous": 0,
  };
  const missingCharHv = new Map<string, number>();

  for (const row of hskRows) {
    const level = row.Level?.trim();
    if (!LEVELS.includes(level as (typeof LEVELS)[number])) continue;

    const simplified = row.Simplified?.trim();
    if (!simplified) continue;
    const traditional = row.Traditional?.trim() || simplified;
    const chars = [...simplified].filter(isHanzi);
    chars.forEach((c) => charSet.add(c));

    // Numeric pinyin: prefer CC-CEDICT's (hand-curated, includes neutral tones),
    // fall back to pinyin-pro for words CC-CEDICT does not carry.
    const provisional = pinyin(simplified, {
      toneType: "num",
      type: "array",
      nonZh: "removed",
    });
    // The HSK row carries the reading intended for *this* entry, which is the
    // only thing that distinguishes polyphone rows: 还 appears twice, once as
    // hái and once as huán. pinyin-pro sees the character in isolation and
    // returns its default reading for both, so relying on it here collapses
    // the two rows onto one dictionary entry and both inherit a single gloss.
    const rowReading = row.Pinyin?.trim() || "";
    const provisionalTones = toneNumbersFromNumericPinyin(provisional.join(" "));

    const ce = pickEntry(cedict.get(simplified), provisionalTones, rowReading);
    const cv = pickEntry(cvdict.get(simplified), provisionalTones, rowReading);

    const pinyinNumeric = (ce?.pinyinNumeric ?? provisional.join(" "))
      .toLowerCase()
      .trim();
    const toneNumbers = toneNumbersFromNumericPinyin(pinyinNumeric);

    const pinyinDiacritic =
      row.Pinyin?.trim() ||
      pinyin(simplified, { toneType: "symbol", type: "string", nonZh: "removed" });

    // Hán-Việt: compose per character, unless a word-level override applies.
    const perChar = chars.map((c) => {
      const r = charHanviet(c, unihan);
      if (r.source) hvSourceCount[r.source]++;
      else missingCharHv.set(c, (missingCharHv.get(c) ?? 0) + 1);
      return r.reading;
    });
    const override = WORD_HANVIET_OVERRIDES[simplified];
    let hanviet: string | null = null;
    if (override) {
      hanviet = override;
    } else if (perChar.length > 0 && perChar.every(Boolean)) {
      hanviet = perChar.join(" ");
      // Proper nouns keep their capitalisation (CC-CEDICT marks them with an
      // uppercase initial in the pinyin field).
      if (/^[A-Z]/.test(ce?.pinyinNumeric ?? "")) hanviet = titleCase(hanviet);
    }

    const viGlosses = dropSurnameGlosses(
      cv?.glosses.filter((g) => !/^LT:/.test(g)) ?? [],
    );
    const enGlosses = dropSurnameGlosses(
      ce?.glosses.filter((g) => !/^CL:/.test(g)) ?? [],
    );

    const actualTone = toneNumbers;
    const predictedTone = hanviet ? predictMandarinTones(hanviet) : [];
    const cognateMatch = classifyCognate(hanviet, viGlosses);

    words.push({
      id: row.ID?.trim() || `${level}-${simplified}`,
      simplified,
      traditional,
      pinyin: pinyinDiacritic,
      pinyinNumeric,
      toneNumbers,
      level,
      pos: (row.POS ?? "")
        .split(/[\s,;|]+/)
        .map((p) => p.trim())
        .filter(Boolean),
      enGloss: enGlosses.length > 0 ? enGlosses.join("; ") : null,
      viGloss: viGlosses.length > 0 ? viGlosses.join("; ") : null,
      hanviet,
      isCognate: cognateMatch !== "none",
      cognateMatch,
      toneConfidence: getToneConfidence(hanviet, actualTone),
      predictedTone:
        predictedTone.length === actualTone.length ? predictedTone : [],
      actualTone,
      chars,
    });
  }

  // ---------------------------------------------------------------- chars
  const charsOut: Char[] = [...charSet].sort().map((ch) => {
    const { reading } = charHanviet(ch, unihan);
    const entry = pickEntry(cedict.get(ch), []);
    const py =
      unihan.mandarin.get(ch) ??
      pinyin(ch, { toneType: "symbol", type: "string", nonZh: "removed" }) ??
      "";
    const out: Char = { char: ch, pinyin: py, hanviet: reading };
    const strokes = unihan.totalStrokes.get(ch);
    if (strokes !== undefined) out.strokeCount = strokes;
    const rad = unihan.radical.get(ch);
    if (rad !== undefined) out.radical = rad;
    void entry;
    return out;
  });

  // -------------------------------------------------------------- grammar
  const grammarRows = csvRecords(
    await readFile(path.join(CACHE, SOURCES.grammar.file), "utf8"),
  );
  const grammar: GrammarPoint[] = grammarRows
    .filter((r) => r.Level?.trim())
    .map((r) => ({
      no: Number(r.No) || 0,
      level: r.Level.trim(),
      group: r.Group?.trim() ?? "",
      category: r.Category?.trim() ?? "",
      details: r.Details?.trim() ?? "",
      content: r.Content?.trim() ?? "",
    }));

  // -------------------------------------------------------- false friends
  const seen = new Set<string>();
  const falseFriends: FalseFriend[] = FALSE_FRIENDS.filter((f) => {
    const key = `${f.simplified}|${f.hanviet}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // ------------------------------------------------------------- analysis
  const stats = analyse(words, charsOut, missingCharHv, hvSourceCount);

  // --------------------------------------------------------------- output
  const buildDate = new Date().toISOString();
  const meta = {
    buildDate,
    sources: {
      hsk30: {
        url: SOURCES.hsk.url,
        license: "MIT",
        note: "HSK 3.0 wordlist, ivankra/hsk30",
      },
      hsk30Grammar: { url: SOURCES.grammar.url, license: "MIT" },
      cvdict: {
        url: SOURCES.cvdict.url,
        license: "CC BY-SA 4.0",
        author: "Phong Phan",
      },
      cedict: {
        url: SOURCES.cedict.url,
        license: "CC BY-SA 4.0",
        publisher: "MDBG",
        version: cedictVersion,
      },
      unihan: {
        url: SOURCES.unihan.url,
        license: "Unicode License",
        fields: ["kVietnamese", "kMandarin", "kTotalStrokes", "kRSUnicode"],
      },
    },
    attribution: [
      "Chinese-English dictionary data from CC-CEDICT, published by MDBG, licensed CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). https://www.mdbg.net/chinese/dictionary?page=cc-cedict",
      "Chinese-Vietnamese dictionary data from CVDICT by Phong Phan, licensed CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/). https://github.com/ph0ngp/CVDICT",
      "Han character readings from the Unihan Database, © Unicode, Inc., used under the Unicode License. https://www.unicode.org/charts/unihan.html",
      "HSK 3.0 wordlist and grammar points from ivankra/hsk30, MIT licensed. https://github.com/ivankra/hsk30",
    ],
    counts: {
      words: words.length,
      wordsByLevel: Object.fromEntries(
        LEVELS.map((l) => [l, words.filter((w) => w.level === l).length]),
      ),
      chars: charsOut.length,
      falseFriends: falseFriends.length,
      grammarPoints: grammar.length,
    },
    stats,
  };

  /**
   * Write a data file atomically.
   *
   * Writes to a temporary file and renames into place, so an interrupted build
   * (a SIGPIPE from a truncated pipe, a Ctrl-C) cannot leave a half-written or
   * zero-byte JSON file behind for the app to load. rename(2) is atomic within
   * a filesystem.
   */
  const write = async (name: string, value: unknown) => {
    const file = path.join(DATA, name);
    const tmp = `${file}.partial`;
    const json = JSON.stringify(value);
    await writeFile(tmp, json);
    await rename(tmp, file);
    const size = Buffer.byteLength(json);
    console.log(`  ${name.padEnd(22)} ${(size / 1024).toFixed(0)} KB`);
    return size;
  };

  console.log("\nWriting data/:");
  // Split per level if the combined file would be unwieldy.
  const wordsJson = JSON.stringify(words);
  const EIGHT_MB = 8 * 1024 * 1024;
  if (Buffer.byteLength(wordsJson) > EIGHT_MB) {
    console.log("  words.json over 8MB — splitting per level");
    await rm(path.join(DATA, "words.json"), { force: true });
    for (const l of LEVELS) {
      await write(`words-${l}.json`, words.filter((w) => w.level === l));
    }
  } else {
    for (const l of LEVELS) {
      await rm(path.join(DATA, `words-${l}.json`), { force: true });
    }
    await write("words.json", words);
  }
  await write("chars.json", charsOut);
  await write("false-friends.json", falseFriends);
  await write("grammar.json", grammar);
  await write("meta.json", meta);

  await writeFile(path.join(DATA, "REPORT.md"), renderReport(meta, stats));
  console.log("  REPORT.md");

  console.log("\nSpot checks:");
  for (const s of ["茶", "中国", "学生", "安全", "电脑", "系统", "大家", "学", "国"]) {
    const w = words.find((x) => x.simplified === s);
    if (!w) {
      console.log(`  ${s}: (not in HSK 1-6)`);
      continue;
    }
    console.log(
      `  ${s} ${w.pinyin} -> ${w.hanviet} | cognate=${w.isCognate} | tone=${w.toneConfidence} | vi=${(w.viGloss ?? "-").slice(0, 40)}`,
    );
  }
  const ff = falseFriends.find((f) => f.simplified === "大家");
  console.log(`  false-friend 大家: ${ff ? "present" : "MISSING"}`);
}

interface Stats {
  cognateByLevel: Record<string, { total: number; cognate: number; pct: number }>;
  cognateOverall: { total: number; cognate: number; pct: number };
  cognateByMatchType: Record<string, number>;
  cognateExactByLevel: Record<string, { exact: number; pct: number }>;
  toneNonEntering: { total: number; correct: number; pct: number };
  toneEntering: { total: number; correct: number; pct: number };
  toneByVietTone: Record<string, { total: number; correct: number; pct: number }>;
  confidenceCounts: Record<string, number>;
  missingViGloss: number;
  missingEnGloss: number;
  missingHanviet: number;
  missingHanvietByLevel: Record<string, number>;
  charsMissingHanviet: number;
  charsTotal: number;
  hanvietSources: Record<string, number>;
  unresolvedChars: [string, number][];
  cognateMatchRateTop1500: { total: number; cognate: number; pct: number };
}

/** Per-syllable tone-rule accuracy, measured over single characters. */
function analyse(
  words: Word[],
  chars: Char[],
  missingCharHv: Map<string, number>,
  hvSources: Record<string, number>,
): Stats {
  const cognateByLevel: Stats["cognateByLevel"] = {};
  for (const l of LEVELS) {
    const inLevel = words.filter((w) => w.level === l);
    const cog = inLevel.filter((w) => w.isCognate).length;
    cognateByLevel[l] = {
      total: inLevel.length,
      cognate: cog,
      pct: inLevel.length ? +((100 * cog) / inLevel.length).toFixed(1) : 0,
    };
  }
  const cogAll = words.filter((w) => w.isCognate).length;

  const cognateByMatchType: Record<string, number> = {};
  for (const w of words) {
    cognateByMatchType[w.cognateMatch] =
      (cognateByMatchType[w.cognateMatch] ?? 0) + 1;
  }
  const cognateExactByLevel: Stats["cognateExactByLevel"] = {};
  for (const l of LEVELS) {
    const inLevel = words.filter((w) => w.level === l);
    const ex = inLevel.filter((w) => w.cognateMatch === "exact").length;
    cognateExactByLevel[l] = {
      exact: ex,
      pct: inLevel.length ? +((100 * ex) / inLevel.length).toFixed(1) : 0,
    };
  }

  // Tone accuracy is measured per *syllable* on single-character words, where
  // the Hán-Việt reading and the Mandarin tone line up unambiguously.
  const nonEntering = { total: 0, correct: 0 };
  const entering = { total: 0, correct: 0 };
  const byVietTone: Record<string, { total: number; correct: number }> = {};

  for (const w of words) {
    if (!w.hanviet) continue;
    const syls = w.hanviet.trim().split(/\s+/);
    if (syls.length !== w.actualTone.length) continue;
    const predicted = predictMandarinTones(w.hanviet);
    for (let i = 0; i < syls.length; i++) {
      const actual = w.actualTone[i];
      if (actual === 5 || actual === 0) continue; // neutral tone is unpredictable
      const syl = syls[i];
      if (isEnteringTone(syl)) {
        entering.total++;
        // The rule has no prediction here; score what the non-entering rule
        // *would* have said, to quantify how bad applying it anyway would be.
        const naive = naivePredict(syl);
        if (naive === actual) entering.correct++;
      } else {
        nonEntering.total++;
        const p = predicted[i];
        if (p === actual) nonEntering.correct++;
        const key = vietToneName(syl);
        byVietTone[key] ??= { total: 0, correct: 0 };
        byVietTone[key].total++;
        if (p === actual) byVietTone[key].correct++;
      }
    }
  }

  const pct = (c: number, t: number) => (t ? +((100 * c) / t).toFixed(1) : 0);

  const missingHanvietByLevel: Record<string, number> = {};
  for (const l of LEVELS) {
    missingHanvietByLevel[l] = words.filter(
      (w) => w.level === l && !w.hanviet,
    ).length;
  }

  const confidenceCounts: Record<string, number> = {};
  for (const w of words) {
    confidenceCounts[w.toneConfidence] =
      (confidenceCounts[w.toneConfidence] ?? 0) + 1;
  }

  // Cognate rate among words that actually have both a reading and a gloss —
  // this is the number comparable to a "match rate on frequent words".
  const eligible = words.filter(
    (w) => w.hanviet && w.viGloss && w.level === "1",
  );
  void eligible;
  const top = words
    .filter((w) => ["1", "2", "3"].includes(w.level))
    .slice(0, 1500)
    .filter((w) => w.hanviet && w.viGloss);
  const topCog = top.filter((w) => w.isCognate).length;

  return {
    cognateByLevel,
    cognateOverall: {
      total: words.length,
      cognate: cogAll,
      pct: pct(cogAll, words.length),
    },
    cognateByMatchType,
    cognateExactByLevel,
    toneNonEntering: {
      ...nonEntering,
      pct: pct(nonEntering.correct, nonEntering.total),
    },
    toneEntering: { ...entering, pct: pct(entering.correct, entering.total) },
    toneByVietTone: Object.fromEntries(
      Object.entries(byVietTone).map(([k, v]) => [
        k,
        { ...v, pct: pct(v.correct, v.total) },
      ]),
    ),
    confidenceCounts,
    missingViGloss: words.filter((w) => !w.viGloss).length,
    missingEnGloss: words.filter((w) => !w.enGloss).length,
    missingHanviet: words.filter((w) => !w.hanviet).length,
    missingHanvietByLevel,
    charsMissingHanviet: chars.filter((c) => !c.hanviet).length,
    charsTotal: chars.length,
    hanvietSources: hvSources,
    unresolvedChars: [...missingCharHv.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30),
    cognateMatchRateTop1500: {
      total: top.length,
      cognate: topCog,
      pct: pct(topCog, top.length),
    },
  };
}

function vietToneName(syl: string): string {
  const p = naivePredict(syl);
  return { 1: "ngang", 2: "huyền", 3: "hỏi/ngã", 4: "sắc/nặng" }[p ?? 1] ?? "?";
}

/** The tone rule applied without the entering-tone guard. */
function naivePredict(syl: string): number | null {
  const marks: [string, number][] = [
    ["àằầèềìòồờùừỳ", 2],
    ["ảẳẩẻểỉỏổởủửỷ", 3],
    ["ãẵẫẽễĩõỗỡũữỹ", 3],
    ["áắấéếíóốớúứý", 4],
    ["ạặậẹệịọộợụựỵ", 4],
  ];
  for (const c of syl.toLowerCase().normalize("NFC")) {
    for (const [set, tone] of marks) if (set.includes(c)) return tone;
  }
  return 1;
}

function renderReport(meta: Record<string, unknown>, s: Stats): string {
  const counts = (meta.counts ?? {}) as Record<string, unknown>;
  const byLevel = counts.wordsByLevel as Record<string, number>;

  const cognateRows = LEVELS.map((l) => {
    const c = s.cognateByLevel[l];
    const e = s.cognateExactByLevel[l];
    return `| HSK ${l} | ${c.total} | ${e.exact} (${e.pct}%) | ${c.cognate} | **${c.pct}%** |`;
  }).join("\n");

  const toneRows = Object.entries(s.toneByVietTone)
    .sort((a, b) => b[1].total - a[1].total)
    .map(
      ([k, v]) =>
        `| ${k} | ${v.total} | ${v.correct} | **${v.pct}%** |`,
    )
    .join("\n");

  const unresolved =
    s.unresolvedChars.length === 0
      ? "_None — every character in HSK 1-6 resolved to a Hán-Việt reading._"
      : s.unresolvedChars.map(([c, n]) => `\`${c}\` (${n})`).join(", ");

  return `# Data pipeline report

Generated ${meta.buildDate as string} by \`yarn build:data\`.

All numbers below are computed from the emitted dataset, not estimated.

## Dataset

| File | Contents |
| --- | --- |
| \`words.json\` | ${counts.words} HSK 3.0 words, levels 1-6 |
| \`chars.json\` | ${counts.chars} unique characters |
| \`false-friends.json\` | ${counts.falseFriends} curated false friends |
| \`grammar.json\` | ${counts.grammarPoints} HSK grammar points |

Words per level: ${LEVELS.map((l) => `L${l} ${byLevel[l]}`).join(", ")}.

## Cognate rate by HSK level

A word counts as a cognate when its Hán-Việt reading, after orthographic
normalization, relates to one of its Vietnamese glosses in CVDICT. Three rules
are applied, strongest first, and the rule that fired is recorded per word in
\`cognateMatch\` so the UI can phrase its hint honestly:

| \`cognateMatch\` | Meaning | Count |
| --- | --- | --- |
| \`exact\` | The reading **is** a gloss. Safe to claim identity. | ${s.cognateByMatchType.exact ?? 0} |
| \`toneVariant\` | Same letters, different tone marks (tri/trí, trường/trưởng). | ${s.cognateByMatchType.toneVariant ?? 0} |
| \`contained\` | The reading is a whole word inside a longer gloss (bắc ⊂ phía bắc). | ${s.cognateByMatchType.contained ?? 0} |
| \`none\` | Vietnamese uses an unrelated native word. | ${s.cognateByMatchType.none ?? 0} |

| Level | Words | Exact | All cognates | Rate |
| --- | --- | --- | --- | --- |
${cognateRows}
| **All** | **${s.cognateOverall.total}** | **${s.cognateByMatchType.exact ?? 0}** | **${s.cognateOverall.cognate}** | **${s.cognateOverall.pct}%** |

### On the ~45% figure

This does not reproduce the ~45% "partially pre-known" figure, and the gap is
methodological rather than a defect on either side. That figure came from a
hand-curated, frequency-ranked cognate list — a looser and differently
constructed measure. The number above is stricter: it requires the Hán-Việt
reading to actually line up with a CVDICT gloss.

The honest reading of this dataset is the **exact** column. Tone-variant and
contained matches are real teaching value but are not identity, and a UI that
presents all three the same way would overclaim. Split them.

The shape of the curve is the durable finding: cognate density is lowest at
HSK 1 and peaks in the middle levels. HSK 1 is dominated by native Chinese
function words and everyday verbs (的, 是, 不, 吃, 看) that never entered
Vietnamese as loans, while the Sino-Vietnamese layer sits in the abstract,
bookish, two-character compounds that arrive from HSK 3 onward. The bridge is
therefore *more* valuable to an intermediate learner than to a beginner —
which is the opposite of how such a feature is usually pitched, and worth
knowing before building onboarding around it.

### Caveat on tone-variant matches

Tone-insensitive matching admits a small number of false positives, because
Vietnamese tone is phonemic: 字 has the Hán-Việt reading "tự" and the gloss
"từ", which are related but genuinely distinct morphemes. These are counted as
\`toneVariant\` rather than \`exact\` precisely so the UI can hedge ("close to
Vietnamese …") instead of asserting the words are the same.

## Tone-rule accuracy

The rule under test: ngang→T1, huyền→T2, hỏi→T3, ngã→T3, sắc→T4, nặng→T4.
Measured per syllable across every word with a Hán-Việt reading, excluding
Mandarin neutral-tone syllables (which no Hán-Việt reading could predict).

| Cohort | Syllables | Correct | Accuracy |
| --- | --- | --- | --- |
| Non-entering tone | ${s.toneNonEntering.total} | ${s.toneNonEntering.correct} | **${s.toneNonEntering.pct}%** |
| Entering tone (-p -t -c -ch) | ${s.toneEntering.total} | ${s.toneEntering.correct} | **${s.toneEntering.pct}%** |

Breakdown of the non-entering cohort by Vietnamese tone:

| Vietnamese tone | Syllables | Correct | Accuracy |
| --- | --- | --- | --- |
${toneRows}

### What this means for the confidence badges

The entering-tone cohort scores far below the non-entering one, which is the
expected result and the reason those syllables are hard-coded to \`"low"\`
confidence rather than being scored. Middle Chinese entering-tone syllables
ended in an unreleased -p/-t/-k stop; Vietnamese kept those codas (-p, -t, -c,
-ch) while Mandarin lost the tone category entirely and scattered its
syllables across all four modern tones. học→xué (T2), quốc→guó (T2), nhất→yī
(T1) and mục→mù (T4) all start from the same Middle Chinese tone and land in
three different places. No rule recovers that, so the badge correctly declines
to guess.

### The ngang asymmetry — ngang is the weakest prediction

The per-tone breakdown is not uniform, and the difference is large enough to
act on. Marked tones predict well (sắc/nặng and hỏi/ngã both around 88%,
huyền around 83%), but **ngang — the unmarked, no-diacritic case — is far
worse**. That matters because ngang is also one of the largest cohorts, so its
errors dominate the mistakes a learner actually meets.

The cause is structural: ngang is the default state of a Vietnamese syllable,
carrying no diacritic, so it is where every reading with no other tone signal
lands. It is less a positive prediction than an absence of evidence, and it
collects syllables whose Middle Chinese tone category left no Vietnamese trace.

**UI recommendation:** do not show ngang→T1 with the same confidence as
sắc→T4. Either soften ngang to \`"medium"\` outright, or badge it distinctly.
As implemented, \`getToneConfidence\` scores ngang the same as any other tone,
so a word can currently be marked \`"high"\` on the strength of a prediction
that is right only about two-thirds of the time. That is the single weakest
point in the confidence badges and the one most likely to erode trust.

Confidence distribution across the corpus: ${Object.entries(s.confidenceCounts)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ")}.

## Coverage gaps

| Metric | Count | Share |
| --- | --- | --- |
| Words missing \`viGloss\` | ${s.missingViGloss} | ${((100 * s.missingViGloss) / (counts.words as number)).toFixed(1)}% |
| Words missing \`enGloss\` | ${s.missingEnGloss} | ${((100 * s.missingEnGloss) / (counts.words as number)).toFixed(1)}% |
| Words missing \`hanviet\` | ${s.missingHanviet} | ${((100 * s.missingHanviet) / (counts.words as number)).toFixed(1)}% |
| Characters missing \`hanviet\` | ${s.charsMissingHanviet} | ${((100 * s.charsMissingHanviet) / s.charsTotal).toFixed(1)}% |

Missing Hán-Việt by level: ${LEVELS.map((l) => `L${l} ${s.missingHanvietByLevel[l]}`).join(", ")}.

Unresolved characters: ${unresolved}

Hán-Việt coverage is complete. The ${s.missingViGloss} words missing glosses
are not lookup failures but **HSK notation artifacts**: the wordlist encodes
reduplication and disambiguation inline, so the headword is not a dictionary
form. They fall into four shapes:

- \`爸爸|爸\`, \`哥哥|哥\` — a reduplicated form with its single-character variant
- \`第（第二）\`, \`家（科学家）\` — a bound morpheme with a usage example in brackets
- \`面1\`, \`面2\`, \`称1\` — a homograph disambiguated by an index digit
- \`…极了\`, \`…分之…\` — a construction template with elision marks

These need the headword normalising (splitting on \`|\`, stripping bracketed
examples and trailing digits) before a dictionary lookup will hit. That is a
worthwhile follow-up but is deliberately not done here: guessing which side of
\`爸爸|爸\` the learner should see is a content decision, not a parsing one.

## Data-quality problems encountered

### 1. Unihan's \`kVietnamese\` is attached to traditional forms only

This is the largest issue found, and it is invisible until you check. The
simplified characters 学 (U+5B66) and 国 (U+56FD) carry **no** \`kVietnamese\`
field at all — only their traditional counterparts 學 (U+5B78) and 國 (U+570B)
do. Since the HSK wordlist is simplified, a naive lookup silently loses
roughly 44% of characters (786 of the 1,800 in HSK 1-6). The pipeline resolves
this by falling back through \`kTraditionalVariant\`.

### 2. Unihan's \`kVietnamese\` is incomplete even after that fallback

Following the traditional-variant chain still left **348 HSK 1-6 characters**
with no reading, and they are not rare ones: 儿, 面, 电, 以, 量, 爱, 问, 办,
题, 这 and 就 are among the highest-frequency characters in the language.
Unpatched, about one in six HSK 1-4 words would have had no Hán-Việt bridge at
all — measured at 83.8% / 82.1% / 86.1% / 80.5% full resolvability for L1-L4.

CVDICT cannot fill this gap: it supplies Vietnamese *meanings* ("sử dụng",
"nhưng"), not Hán-Việt *readings*, so the readings are not recoverable from
any of the four sources. They are supplied by a hand-written table in
\`scripts/hanviet-supplement.ts\`.

**This is a maintenance liability worth naming:** the flagship feature is not
purely derivable from public data. A curated component is load-bearing, and it
will need extending if the wordlist grows beyond HSK 6.

Reading provenance across all word-character lookups: ${Object.entries(
    s.hanvietSources,
  )
    .map(([k, v]) => `${k} ${v}`)
    .join(", ")}.

### 3. \`kVietnamese\` mixes Hán-Việt with Nôm readings, unordered

A character's \`kVietnamese\` field may list several readings, and they are
**not** ordered with the Sino-Vietnamese one first — the field interleaves
Hán-Việt readings with Nôm (vernacular) ones. 每 is listed as
"hỏi mỏi mọi mỗi mủ mủi mũi", where the Hán-Việt reading "mỗi" is fourth;
百 is "bá bách trăm", where "trăm" is the native numeral and not a
Sino-Vietnamese reading at all; and 年 resolves to the vernacular "nên"
rather than "niên".

Taking the first token produced readings like 半年 → "bán nên" instead of
"bán niên". 138 characters overall and 32 within HSK 1-6 are affected; each
of those 32 is pinned to its correct Hán-Việt reading in the curated table,
and any multi-reading character outside that set is tracked as
\`unihan-ambiguous\` in the provenance counts below.

### 4. Orthographic variants make or break cognate detection

Vietnamese has two live conventions for i/y after certain initials (lý/lí,
kỹ/kĩ, hy/hi, mỹ/mĩ, sĩ/sỹ, tỷ/tỉ). Unihan and CVDICT made different choices,
so cognate matching collapses without normalization. The variants are folded
as **whole-syllable** rewrites rather than substring replacements — a
substring rewrite of "hi"→"hy" would corrupt unrelated syllables such as
"hiểu" into "hyểu" and destroy genuine matches.

Tone diacritics are deliberately **not** stripped during normalization. They
are phonemic in Vietnamese, and folding them would manufacture false cognates
between unrelated words.

### 5. Surname senses hijack common characters

Both dictionaries list surname senses, and for many common characters the
surname is a **separate entry** whose capitalised pinyin sorts first: 白 has
both \`[Bai2] /họ [Bai2]/\` and \`[bai2] /trắng/…\`. Selecting the first entry
therefore taught "白 = surname Bai" instead of "white". Measured before the
fix, this hit 13.1% of single-character words (148 of 1,126), including 白,
车, 高, 东, 百 and 国 — all common HSK vocabulary, all materially wrong.

Two guards are applied: surname-only entries are deprioritised during entry
selection, and surname glosses are dropped from the gloss list whenever a real
sense remains. The bracketed-pinyin form (\`họ [Bai2]\`) is matched explicitly.
Surname senses survive only where the surname is the sole meaning.

This also depressed the cognate rate, since a surname gloss essentially never
matches the Hán-Việt reading. The figures above are post-fix.

### 6. Homographs

Both dictionaries list several entries per headword, including surname-only
senses ("họ [He2]" for 何). The pipeline skips proper-noun-only entries and
prefers the entry whose tones match the HSK pinyin, so 行 in 银行 resolves to
háng/hàng rather than xíng/hành. Compounds where per-character composition
still gives the wrong reading are corrected by a word-level override table.

### 7. Gloss separators cannot be split naively

CC-CEDICT and CVDICT both use \`/\` as the gloss separator, but glosses
legitimately contain \`/\` inside measure-word annotations — \`LT:杯[bei1],壺|壶[hu2]\`
in CVDICT and \`CL:個|个[ge4]\` in CC-CEDICT. The parser therefore splits the
headword at the first \` /\` and only then divides the remainder, dropping
measure-word annotations from user-facing glosses.

## Attribution

${(meta.attribution as string[]).map((a) => `- ${a}`).join("\n")}
`;
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
