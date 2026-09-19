/**
 * Re-validate the committed sentence data.
 *
 *   yarn sentences:validate
 *
 * Runs the same checks the generator runs, over data/sentences.json as it sits
 * in the repo. Needs no API key: if a later edit to words.json narrows the
 * level, or a hand-edited sentence breaks its tiles, this catches it without
 * regenerating anything.
 *
 * Exits non-zero when anything fails, so it is usable as a pre-commit or CI gate.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { FalseFriend, GrammarPoint, Word } from "../lib/hanviet";
import type { Sentence } from "../lib/sentences";
import { validateSentences } from "./validate-sentences";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

async function main() {
  let sentences: Sentence[];
  try {
    sentences = await readJson<Sentence[]>(path.join(DATA, "sentences.json"));
  } catch {
    console.error("data/sentences.json does not exist yet.");
    console.error("Run `yarn sentences:generate --level=1` first (needs ANTHROPIC_API_KEY).");
    process.exitCode = 1;
    return;
  }

  const [words, grammar, falseFriends] = await Promise.all([
    readJson<Word[]>(path.join(DATA, "words.json")),
    readJson<GrammarPoint[]>(path.join(DATA, "grammar.json")),
    readJson<FalseFriend[]>(path.join(DATA, "false-friends.json")),
  ]);

  // Validate each level present in the file against its own cap, so a mixed
  // file is checked correctly rather than against whichever level came first.
  const levels = [...new Set(sentences.map((s) => s.level))].sort();
  console.log(`Validating ${sentences.length} sentences across level(s) ${levels.join(", ")}.\n`);

  let failures = 0;
  for (const level of levels) {
    const grammarWords = new Set<string>();
    for (const p of grammar.filter((g) => g.level === level)) {
      for (const token of p.content.split(/[、，,；;\s]+/)) {
        const t = token.trim();
        if (t.length > 0 && t.length <= 4) grammarWords.add(t);
      }
    }

    const subset = sentences.filter((s) => s.level === level);
    const result = validateSentences(subset, {
      level,
      words,
      falseFriends,
      grammarWords,
    });

    console.log(`HSK ${level}: ${result.valid.length}/${subset.length} valid`);
    for (const [code, n] of Object.entries(result.byCode)) {
      if (n > 0) console.log(`  ${code.padEnd(16)} ${n}`);
    }
    for (const r of result.rejected.slice(0, 20)) {
      console.log(`  ✗ ${r.sentence.id} ${r.sentence.hanzi} — ${r.detail}`);
    }
    if (result.flagged.length > 0) {
      console.log(`  ${result.flagged.length} flagged (contain a false friend)`);
    }
    failures += result.rejected.length;
  }

  if (failures > 0) {
    console.error(`\n${failures} sentences in committed data fail validation.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll committed sentences pass.");
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
