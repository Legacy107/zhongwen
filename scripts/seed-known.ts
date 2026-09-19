/**
 * Marks vocabulary already learned elsewhere (Duolingo) as known, so the first
 * session doesn't re-teach it.
 *
 * Seeded cards enter FSRS in the Review state with a modest stability rather
 * than as new cards. A wrongly-seeded word simply resurfaces early, which is
 * harmless — so a rough estimate beats re-drilling known vocabulary.
 *
 * Emits data/seed-known.json, which the client applies once on first run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Word } from "../lib/hanviet";

/** Days of assumed retention. Two weeks of Duolingo is shallow but real. */
const STABILITY_DAYS = 2.5;

/**
 * Simplified forms, resolved from the pinyin list. Country names other than
 * 中国 are absent from the HSK 3.0 wordlist and are skipped rather than faked.
 */
const KNOWN: { simplified: string; pinyin?: string; note?: string }[] = [
  // unit 1 — drinks and food
  { simplified: "茶" },
  { simplified: "咖啡" },
  { simplified: "米饭" },
  { simplified: "热水" },
  { simplified: "豆腐" },
  { simplified: "粥", note: "read as congee, matching unit 1's food theme" },
  // "zhe shi" is 这 + 是, two words rather than one entry
  { simplified: "这" },
  { simplified: "是" },
  // unit 2 — identity and nationality
  { simplified: "还", pinyin: "hái", note: "hái (still/also), not huán (to return)" },
  { simplified: "我" },
  { simplified: "中国" },
  { simplified: "人" },
  { simplified: "你" },
  { simplified: "呢" },
];

const words: Word[] = JSON.parse(readFileSync("data/words.json", "utf8"));
/** Polyphones appear once per reading, so index to a list. */
const bySimplified = new Map<string, Word[]>();
for (const w of words) {
  const list = bySimplified.get(w.simplified);
  if (list) list.push(w);
  else bySimplified.set(w.simplified, [w]);
}

const resolved: { id: string; simplified: string; pinyin: string; note?: string }[] = [];
const missing: string[] = [];

for (const entry of KNOWN) {
  const candidates = bySimplified.get(entry.simplified) ?? [];
  const word = entry.pinyin
    ? candidates.find((w) => w.pinyin === entry.pinyin)
    : candidates[0];
  if (!word) {
    missing.push(entry.simplified + (entry.pinyin ? ` (${entry.pinyin})` : ""));
    continue;
  }
  resolved.push({ id: word.id, simplified: word.simplified, pinyin: word.pinyin, ...(entry.note ? { note: entry.note } : {}) });
}

writeFileSync(
  "data/seed-known.json",
  JSON.stringify({ stabilityDays: STABILITY_DAYS, words: resolved }, null, 2) + "\n",
);

console.log(`seeded ${resolved.length} known words at ${STABILITY_DAYS}d stability`);
for (const r of resolved) console.log(`  ${r.simplified.padEnd(4)} ${r.pinyin}${r.note ? `  (${r.note})` : ""}`);
if (missing.length) console.log(`not in HSK wordlist, skipped: ${missing.join(", ")}`);
