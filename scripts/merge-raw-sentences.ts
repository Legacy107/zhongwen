/**
 * Merges hand-authored raw sentence parts into the cache file that
 * `generate-sentences.ts --from-cache` consumes.
 *
 * The sentences for this deck were written directly rather than fetched from
 * the Batch API. That changes only where the raw text comes from: segmentation,
 * tile building, viContrast tagging and the full validator all still run
 * afterwards, unchanged. This script exists so that handoff is reproducible
 * instead of a manual copy.
 *
 * Usage: yarn sentences:merge --level=1 <part.json> [part.json ...]
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const CACHE = path.join(ROOT, "scripts", ".cache");

interface RawSentence {
  hanzi: string;
  pinyin: string;
  enGloss: string;
  viGloss: string;
}

type Part = [number, RawSentence[]][];

function parseArgs(argv: string[]): { level: string; files: string[] } {
  let level = "1";
  const files: string[] = [];
  for (const arg of argv) {
    if (arg.startsWith("--level=")) level = arg.slice("--level=".length);
    else if (!arg.startsWith("--")) files.push(arg);
  }
  return { level, files };
}

const REQUIRED: Array<keyof RawSentence> = ["hanzi", "pinyin", "enGloss", "viGloss"];

async function main() {
  const { level, files } = parseArgs(process.argv.slice(2));
  if (files.length === 0) {
    console.error("Usage: yarn sentences:merge --level=1 <part.json> [...]");
    process.exitCode = 1;
    return;
  }

  const byPoint = new Map<number, RawSentence[]>();
  let total = 0;

  for (const file of files) {
    const parsed = JSON.parse(await readFile(file, "utf8")) as Part;
    if (!Array.isArray(parsed)) throw new Error(`${file}: expected a JSON array`);

    for (const entry of parsed) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        throw new Error(`${file}: each entry must be [pointNo, sentences[]]`);
      }
      const [pointNo, sentences] = entry;
      if (typeof pointNo !== "number") throw new Error(`${file}: bad point number ${pointNo}`);
      if (!Array.isArray(sentences)) throw new Error(`${file}: point ${pointNo} has no array`);

      for (const s of sentences) {
        for (const field of REQUIRED) {
          if (typeof s?.[field] !== "string" || !s[field].trim()) {
            throw new Error(`${file}: point ${pointNo} has a sentence missing "${field}"`);
          }
        }
      }

      // Parts are meant to cover disjoint point ranges; overlapping is a
      // mistake worth surfacing rather than silently concatenating.
      if (byPoint.has(pointNo)) {
        console.warn(`  warning: point ${pointNo} appears in more than one part; appending`);
        byPoint.get(pointNo)!.push(...sentences);
      } else {
        byPoint.set(pointNo, [...sentences]);
      }
      total += sentences.length;
    }
    console.log(`  ${path.basename(file)}: ${parsed.length} point(s)`);
  }

  const ordered = [...byPoint.entries()].sort((a, b) => a[0] - b[0]);
  const dump = path.join(CACHE, `sentences-raw-L${level}.json`);
  await mkdir(CACHE, { recursive: true });

  // Atomic write, matching build-data.ts.
  const tmp = `${dump}.tmp`;
  await writeFile(tmp, JSON.stringify(ordered));
  await rename(tmp, dump);

  console.log(`\nmerged ${total} sentence(s) across ${ordered.length} grammar point(s)`);
  console.log(`wrote ${path.relative(ROOT, dump)}`);
  console.log(`\nNext: yarn sentences:generate --level=${level} --from-cache`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
