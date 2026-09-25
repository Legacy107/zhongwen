/**
 * Merge hand-written learner glosses into data/glosses.json.
 *
 *   yarn glosses:merge
 *
 * Reads scripts/.cache/glosses/output-*.json (written by the gloss-writing
 * pass over HSK 1–2, see input-*.json), validates every row against the deck
 * and the house rules, and writes { [wordId]: { en, vi } }. The client merges
 * it into the deck at load time (lib/data.ts); anything without an entry falls
 * back to the cleaned dictionary gloss (lib/gloss.ts).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import path from "node:path";

import type { Word } from "../lib/hanviet";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIR = path.join(ROOT, "scripts", ".cache", "glosses");
const OUT = path.join(ROOT, "data", "glosses.json");

const MAX = 48;
const FORBIDDEN = /[[\]|]|CL:|variant of/i;
const HANZI = /\p{Script=Han}/u;

/**
 * Australian/British spelling, matching the app's own copy (the learner is in
 * Melbourne). The gloss pass was split across writers who did not all agree.
 */
const SPELLING: Array<[RegExp, string]> = [
  [/\bcolor/gi, "colour"],
  [/\bfavorite/gi, "favourite"],
  [/\bcenter/gi, "centre"],
  [/\btheater/gi, "theatre"],
  [/\bneighbor/gi, "neighbour"],
  [/\bhonor/gi, "honour"],
  [/\bflavor/gi, "flavour"],
  [/\bbehavior/gi, "behaviour"],
  [/\bgray\b/gi, "grey"],
  [/\b(real|organ|recogn|apolog|critic|memor|special|emphas|summar)iz(e|es|ed|ing)\b/gi, "$1is$2"],
  [/\btraveled/gi, "travelled"],
  [/\btraveling/gi, "travelling"],
  [/\bcanceled/gi, "cancelled"],
];

function australian(text: string): string {
  return SPELLING.reduce((t, [re, to]) => t.replace(re, (m) => (m[0] === m[0].toUpperCase() ? to[0].toUpperCase() + to.slice(1) : to)), text);
}

interface Row {
  id: string;
  en: string;
  vi: string;
}

function problems(row: Row, known: Set<string>): string[] {
  const out: string[] = [];
  if (!known.has(row.id)) out.push("unknown id");
  for (const field of ["en", "vi"] as const) {
    const v = row[field];
    if (typeof v !== "string" || !v.trim()) out.push(`${field} empty`);
    else {
      if ([...v].length > MAX) out.push(`${field} over ${MAX} chars`);
      if (FORBIDDEN.test(v)) out.push(`${field} has dictionary markup`);
      if (HANZI.test(v)) out.push(`${field} has hanzi`);
    }
  }
  return out;
}

async function main() {
  const words = JSON.parse(readFileSync(path.join(ROOT, "data", "words.json"), "utf8")) as Word[];
  const known = new Set(words.map((w) => w.id));

  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => /^output-\d+\.json$/.test(f)).sort() : [];
  if (files.length === 0) throw new Error(`No output-*.json in ${DIR}`);

  const merged: Record<string, { en: string; vi: string }> = {};
  const rejected: string[] = [];
  for (const file of files) {
    const rows = JSON.parse(readFileSync(path.join(DIR, file), "utf8")) as Row[];
    const input = path.join(DIR, file.replace("output", "input"));
    if (existsSync(input)) {
      const expected = (JSON.parse(readFileSync(input, "utf8")) as Array<{ id: string }>).map((r) => r.id);
      const got = new Set(rows.map((r) => r.id));
      const missing = expected.filter((id) => !got.has(id));
      if (missing.length) rejected.push(`${file}: missing ${missing.length} ids (${missing.slice(0, 5).join(", ")}…)`);
    }
    for (const row of rows) {
      const p = problems(row, known);
      if (p.length) {
        rejected.push(`${file} ${row.id}: ${p.join(", ")}`);
        continue;
      }
      merged[row.id] = { en: australian(row.en.trim()), vi: row.vi.trim() };
    }
  }

  const sorted = Object.fromEntries(Object.entries(merged).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(OUT, `${JSON.stringify(sorted, null, 1)}\n`);
  console.log(`${Object.keys(sorted).length} glosses from ${files.length} file(s) -> ${path.relative(ROOT, OUT)}`);
  if (rejected.length) {
    console.log(`${rejected.length} rejected:`);
    for (const r of rejected.slice(0, 30)) console.log(`  ${r}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
