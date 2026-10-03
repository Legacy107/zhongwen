/**
 * Merges the lesson content pass into data/phrases.json and data/emoji.json.
 *
 *   yarn lessons:merge
 *
 * Reads scripts/.cache/lessons/output-*.json, written by the phrase-and-emoji
 * pass over HSK 1–2 (brief and inputs alongside them): per word, an emoji or
 * null and three short items, a phrase and two sentences. Like the sentence
 * and gloss passes, the text was written by Claude and every item is checked
 * here before it is kept:
 *
 *   - It splits into deck words with the same segmenter as the generated
 *     sentences, and the target word is one of its tiles (not swallowed into
 *     a longer word: 有 inside 有人 teaches nothing about 有).
 *   - Every character belongs to a deck word at or below the target's level.
 *   - Length: phrases 2–5 characters, sentences 4–10.
 *
 * Whether the other words are already known is decided per lesson at runtime
 * (lib/lesson.ts), so an item that uses a later word is still kept: it simply
 * waits until that word has been met.
 *
 * Output is in the reading corpus's shape, ids `P:<wordId>:<n>`, so the client
 * parses it with the same code (lib/data.ts loadPhrases).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { Word } from "../lib/hanviet";
import { displayPinyin } from "../lib/pinyinFormat";
import type { ReaderShard, ReaderSentenceWire, ReaderTokenWire } from "../lib/reader";
import { countHanzi, isHanzi } from "../lib/sentences";
import { segmentIntoTiles } from "./segment-sentences";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIR = path.join(ROOT, "scripts", ".cache", "lessons");
const DATA = path.join(ROOT, "data");

interface Item {
  zh: string;
  en: string;
  vi: string;
}

interface Entry {
  id: string;
  emoji: string | null;
  items: Item[];
}

const LEVEL = (w: Word) => (w.level === "S" ? 1 : Number(w.level));

/** The word as written in a sentence: HSK lists some with an example, 们（朋友们）, 有（一）些. */
const surface = (w: Word) => w.simplified.replace(/（[^）]*）/g, "");

type Reason = "missing" | "length" | "target swallowed" | "not a deck word" | "duplicate";

async function main() {
  const words = JSON.parse(readFileSync(path.join(DATA, "words.json"), "utf8")) as Word[];
  const byId = new Map(words.map((w) => [w.id, w]));
  // Segmented against the words up to the target's level only. Against the
  // whole deck, longest-match reads 个人 into 左边那个人 and 只有 into 外边只有五度.
  const surfaces = new Map<number, Map<string, Word>>();
  const surfacesUpTo = (level: number) => {
    let map = surfaces.get(level);
    if (!map) {
      map = new Map();
      // Lowest level first, so a surface shared across levels resolves to the one taught first.
      for (const w of [...words].sort((a, b) => LEVEL(a) - LEVEL(b))) {
        if (LEVEL(w) > level) continue;
        for (const s of [w.simplified, surface(w)]) if (!map.has(s)) map.set(s, w);
      }
      surfaces.set(level, map);
    }
    return map;
  };
  const maxLen = Math.max(...words.map((w) => [...w.simplified].length));

  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^output-\d+\.json$/.test(f)).sort() : [];
  if (!files.length) throw new Error(`No output-*.json in ${DIR}`);

  const sentences: ReaderSentenceWire[] = [];
  const emoji: Record<string, string> = {};
  const rejected = new Map<Reason, string[]>();
  const reject = (reason: Reason, what: string) => rejected.set(reason, [...(rejected.get(reason) ?? []), what]);
  const seen = new Set<string>();
  let entries = 0;

  for (const file of files) {
    const list = JSON.parse(readFileSync(path.join(DIR, file), "utf8")) as Entry[];
    for (const entry of list) {
      const word = byId.get(entry.id);
      if (!word) {
        reject("missing", `${file}: unknown id ${entry.id}`);
        continue;
      }
      entries++;
      if (typeof entry.emoji === "string" && entry.emoji.trim()) emoji[word.id] = entry.emoji.trim();

      entry.items.forEach((item, n) => {
        const zh = item.zh?.trim();
        const target = surface(word);
        const label = `${target}: ${zh}`;
        if (!zh || !item.en?.trim()) return reject("missing", label);
        const phrase = n === 0;
        const chars = countHanzi(zh);
        if (phrase ? chars < 2 || chars > 5 : chars < 4 || chars > 10) return reject("length", label);
        if (seen.has(zh)) return reject("duplicate", label);

        const tiles = segmentIntoTiles(zh, surfacesUpTo(LEVEL(word)), maxLen);
        if (!tiles.some((t) => t.text === target)) return reject("target swallowed", label);
        const tokens: ReaderTokenWire[] = [];
        let level = 1;
        for (const t of tiles) {
          // The target itself carries its own id: a shared surface may resolve elsewhere.
          const w = t.text === target ? word : t.wordId ? byId.get(t.wordId) : undefined;
          if (!w) {
            if ([...t.text].some(isHanzi)) return reject("not a deck word", `${label} (${t.text})`);
            continue;
          }
          level = Math.max(level, LEVEL(w));
          tokens.push([t.text, displayPinyin(t.pinyin), w.id]);
        }

        // Punctuation back in, so the tokens rejoin to the sentence like the reading corpus's.
        const out: ReaderTokenWire[] = [];
        let rest = zh;
        for (const tok of tokens) {
          const at = rest.indexOf(tok[0]);
          for (const ch of rest.slice(0, at)) out.push([ch]);
          out.push(tok);
          rest = rest.slice(at + tok[0].length);
        }
        for (const ch of rest) out.push([ch]);
        if (out.map((t) => t[0]).join("") !== zh) return reject("not a deck word", `${label} (does not rejoin)`);

        seen.add(zh);
        sentences.push({
          id: `P:${word.id}:${n}`,
          zh,
          en: item.en.trim(),
          ...(item.vi?.trim() ? { vi: item.vi.trim() } : {}),
          lv: String(level),
          tk: out,
          by: "",
        });
      });
    }
  }

  const shard: ReaderShard = { level: "phrases", sentences };
  await writeFile(path.join(DATA, "phrases.json"), JSON.stringify(shard) + "\n");
  await writeFile(path.join(DATA, "emoji.json"), JSON.stringify(emoji, null, 1) + "\n");

  const total = sentences.length + [...rejected.values()].reduce((n, l) => n + l.length, 0);
  console.log(`${entries} words, ${Object.keys(emoji).length} emoji, ${sentences.length}/${total} items kept`);
  for (const [reason, list] of rejected) {
    console.log(`  ${reason}: ${list.length}`);
    for (const what of list.slice(0, 8)) console.log(`    ${what}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
