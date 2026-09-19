/**
 * Generate sentence-construction data for Stage 2.5.
 *
 *   yarn sentences:generate --level=1
 *
 * For every HSK grammar point at the target level, asks Claude for ~6 short
 * everyday sentences constrained to that level's vocabulary, segments them into
 * word tiles, validates every one, and emits data/sentences.json plus
 * data/SENTENCES-REPORT.md.
 *
 * Generation goes through the Batch API: this is a bulk structured-generation
 * job with no latency requirement, so the 50% discount is free money and the
 * whole level fits in one batch.
 *
 * The API key is read from ANTHROPIC_API_KEY and never logged or written. If it
 * is absent the script exits with a clear message before doing any work — the
 * validator and the segmenter are separate modules precisely so they remain
 * usable and testable without one.
 */
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

import type { FalseFriend, GrammarPoint, Word } from "../lib/hanviet";
import { stripPunctuation, type Sentence, type SentenceTile } from "../lib/sentences";
import { detectViContrast, segmentIntoTiles, sentencePinyin } from "./segment-sentences";
import {
  coverageByGrammarPoint,
  levelsUpTo,
  validateSentences,
  type Rejection,
  type ValidationResult,
} from "./validate-sentences";

const ROOT = path.resolve(import.meta.dirname, "..");
const DATA = path.join(ROOT, "data");
const CACHE = path.join(ROOT, "scripts", ".cache");

/**
 * A bulk structured-generation job over a few dozen short prompts. Sonnet is
 * the right tier here: the task is heavily constrained by the vocabulary list
 * in the prompt and every output is machine-validated afterwards, so the
 * marginal value of a larger model is small against 48 batch requests.
 */
const MODEL = "claude-sonnet-5";
const SENTENCES_PER_POINT = 6;
const MIN_CHARS = 4;
const MAX_CHARS = 12;

/** How long to wait between batch polls, and how long before giving up. */
const POLL_INTERVAL_MS = 30_000;
const POLL_TIMEOUT_MS = 6 * 60 * 60 * 1000;

interface Args {
  level: string;
  /** Reuse a batch that is already submitted instead of creating a new one. */
  batchId?: string;
  /** Skip the API entirely and re-validate a previously fetched raw dump. */
  fromCache: boolean;
}

function parseArgs(argv: string[]): Args {
  let level = "1";
  let batchId: string | undefined;
  let fromCache = false;
  for (const arg of argv) {
    if (arg.startsWith("--level=")) level = arg.slice("--level=".length);
    else if (arg.startsWith("--batch-id=")) batchId = arg.slice("--batch-id=".length);
    else if (arg === "--from-cache") fromCache = true;
  }
  return { level, batchId, fromCache };
}

/**
 * The tool Claude must call, one call per sentence.
 *
 * Structured output via tool use rather than "reply with JSON": the schema is
 * enforced server-side with `strict`, so the script never parses prose and a
 * malformed field is an API error rather than a silent data defect.
 */
const SENTENCE_TOOL: Anthropic.Tool = {
  name: "emit_sentences",
  description:
    "Emit the generated practice sentences for one grammar point. Call exactly once with every sentence.",
  strict: true,
  input_schema: {
    type: "object",
    additionalProperties: false,
    properties: {
      sentences: {
        type: "array",
        description: `Between 4 and ${SENTENCES_PER_POINT} sentences.`,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            hanzi: {
              type: "string",
              description:
                "The sentence in simplified Chinese, 4-12 characters, ending in 。 or ？ or ！",
            },
            pinyin: {
              type: "string",
              description:
                "Pinyin with tone diacritics, one space between every syllable, no punctuation. Must have exactly as many syllables as the sentence has hanzi characters.",
            },
            enGloss: { type: "string", description: "Natural English translation." },
            viGloss: { type: "string", description: "Natural Vietnamese translation." },
          },
          required: ["hanzi", "pinyin", "enGloss", "viGloss"],
        },
      },
    },
    required: ["sentences"],
  },
};

interface RawSentence {
  hanzi: string;
  pinyin: string;
  enGloss: string;
  viGloss: string;
}

function systemPrompt(level: string, vocabulary: string[]): string {
  return [
    `You write practice sentences for a Chinese-learning app. The learner is a native Vietnamese speaker, fluent in English, studying HSK level ${level}.`,
    "",
    "Hard constraints on every sentence you write:",
    `- Use ONLY words from the vocabulary list below, plus the content words of the grammar point you are given. Nothing else. A single out-of-list word makes the sentence useless.`,
    `- ${MIN_CHARS} to ${MAX_CHARS} hanzi characters, not counting the final punctuation mark.`,
    "- Natural, idiomatic Mandarin that a native speaker would actually say. Not textbook-stilted, not a word-order exercise dressed as a sentence.",
    "- Everyday life only: groceries, ordering food and drink, greetings, family, simple small talk about work.",
    "- The sentence must genuinely exercise the target grammar point, not merely contain one of its words.",
    "- Simplified characters only. No proper nouns outside the vocabulary list.",
    "- The pinyin must use tone diacritics and have exactly one syllable per hanzi character, space-separated.",
    "- Vary the sentences: different subjects, verbs and contexts within one grammar point.",
    "",
    `Vocabulary list (HSK ${levelsUpTo(level).join(", ")}):`,
    vocabulary.join(" "),
  ].join("\n");
}

function userPrompt(point: GrammarPoint): string {
  return [
    `Grammar point ${point.no} (HSK ${point.level}).`,
    `Category: ${point.group} › ${point.category} › ${point.details}`,
    `Forms to exercise: ${point.content}`,
    "",
    `Write ${SENTENCES_PER_POINT} sentences that exercise this grammar point, then call emit_sentences exactly once with all of them.`,
  ].join("\n");
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  console.log("Sentence generation pipeline\n");
  console.log(`  level    ${args.level}`);
  console.log(`  model    ${MODEL}`);

  const [words, grammar, falseFriends] = await Promise.all([
    readJson<Word[]>(path.join(DATA, "words.json")),
    readJson<GrammarPoint[]>(path.join(DATA, "grammar.json")),
    readJson<FalseFriend[]>(path.join(DATA, "false-friends.json")),
  ]);

  const points = grammar.filter((p) => p.level === args.level);
  if (points.length === 0) {
    console.error(`\nNo grammar points at level "${args.level}".`);
    console.error(`Levels present: ${[...new Set(grammar.map((p) => p.level))].join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const allowedLevels = new Set(levelsUpTo(args.level));
  const levelWords = words.filter((w) => allowedLevels.has(w.level));
  console.log(`  grammar  ${points.length} points`);
  console.log(`  vocab    ${levelWords.length} words\n`);

  // Content words from the grammar points themselves. A point like 方位名词
  // lists 上、下、里、外 as the very thing to practise, and some of those are
  // not separately in the wordlist.
  const grammarWords = new Set<string>();
  for (const p of points) {
    for (const token of p.content.split(/[、，,；;\s]+/)) {
      const t = token.trim();
      if (t.length > 0 && t.length <= 4) grammarWords.add(t);
    }
  }

  const raw = await collectRawSentences(args, points, levelWords);
  if (!raw) return; // collectRawSentences reported why

  // Segmentation and tagging are done here rather than asked of the model:
  // tile boundaries must agree with pinyin-pro and the deck, which is a
  // deterministic question with a right answer.
  // Built from the level's words, not the whole deck. Segmenting against all
  // 5,497 words lets a longer out-of-level compound win the longest-match pass
  // - 再说 is HSK 6, so 请你再说一下儿 segmented as 再说 and was then rejected as
  // out-of-level, even though 再 and 说 are both HSK 1 words the learner has.
  const wordsBySurface = new Map<string, Word>();
  for (const w of levelWords) if (!wordsBySurface.has(w.simplified)) wordsBySurface.set(w.simplified, w);
  const maxWordLength = Math.max(...levelWords.map((w) => [...w.simplified].length));

  const sentences: Sentence[] = [];
  for (const [pointNo, list] of raw) {
    list.forEach((r, i) => {
      const bare = stripPunctuation(r.hanzi ?? "");
      const tiles: SentenceTile[] =
        bare.length > 0 ? segmentIntoTiles(bare, wordsBySurface, maxWordLength) : [];
      const s: Sentence = {
        id: `S${args.level}-${String(pointNo).padStart(3, "0")}-${i + 1}`,
        hanzi: r.hanzi ?? "",
        // Re-derive pinyin from the hanzi: pinyin-pro knows 的/de, 不 sandhi and
        // polyphones, and the model does not reliably. The model's own attempt
        // is kept alongside so validation has something independent to compare.
        pinyin: bare.length > 0 ? sentencePinyin(bare) : "",
        modelPinyin: r.pinyin ?? "",
        enGloss: r.enGloss ?? "",
        viGloss: r.viGloss ?? "",
        grammarPointNo: pointNo,
        level: args.level,
        tiles,
      };
      const contrast = detectViContrast(bare);
      if (contrast) s.viContrast = contrast;
      sentences.push(s);
    });
  }

  console.log(`\nGenerated ${sentences.length} candidate sentences.`);

  const result = validateSentences(sentences, {
    level: args.level,
    words,
    falseFriends,
    grammarWords,
    minChars: MIN_CHARS,
    maxChars: MAX_CHARS,
  });

  reportToConsole(result);

  await write(path.join(DATA, "sentences.json"), result.valid);
  await updateMeta(args.level, result, points.length);

  const report = renderReport(args.level, result, points, MODEL);
  await writeFile(path.join(DATA, "SENTENCES-REPORT.md"), report);
  console.log("  SENTENCES-REPORT.md");
}

/**
 * Get the model's raw output, either from the API or from the on-disk dump of
 * a previous run.
 *
 * Returns null (having explained why) when generation could not run.
 */
async function collectRawSentences(
  args: Args,
  points: GrammarPoint[],
  levelWords: Word[],
): Promise<Map<number, RawSentence[]> | null> {
  const dump = path.join(CACHE, `sentences-raw-L${args.level}.json`);

  if (args.fromCache) {
    try {
      const cached = await readJson<[number, RawSentence[]][]>(dump);
      console.log(`Reusing cached batch output (${dump}).`);
      return new Map(cached);
    } catch {
      console.error(`\n--from-cache given but no cached output at ${dump}.`);
      process.exitCode = 1;
      return null;
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("\nANTHROPIC_API_KEY is not set.");
    console.error("Generation needs it; segmentation and validation do not.");
    console.error("");
    console.error("  export ANTHROPIC_API_KEY=sk-ant-...   then re-run");
    console.error("");
    console.error("To re-validate data that already exists, run instead:");
    console.error("  yarn sentences:validate");
    process.exitCode = 1;
    return null;
  }

  const client = new Anthropic();
  const vocabulary = levelWords.map((w) => w.simplified);
  const system = systemPrompt(args.level, vocabulary);

  let batchId = args.batchId;
  if (batchId) {
    console.log(`Resuming batch ${batchId}.`);
  } else {
    const requests = points.map((p) => ({
      custom_id: `gp-${p.no}`,
      params: {
        model: MODEL,
        max_tokens: 4096,
        // The vocabulary list is identical across all 48 requests; caching it
        // turns the bulk of the input into cache reads after the first.
        system: [
          { type: "text" as const, text: system, cache_control: { type: "ephemeral" as const } },
        ],
        tools: [SENTENCE_TOOL],
        tool_choice: { type: "tool" as const, name: SENTENCE_TOOL.name },
        messages: [{ role: "user" as const, content: userPrompt(p) }],
      },
    }));

    console.log(`Submitting ${requests.length} batch requests...`);
    const batch = await client.messages.batches.create({ requests });
    batchId = batch.id;
    console.log(`  batch ${batchId} (${batch.processing_status})`);
    console.log(`  resume with: yarn sentences:generate --level=${args.level} --batch-id=${batchId}`);
  }

  const ended = await pollBatch(client, batchId);
  if (!ended) return null;

  const byPoint = new Map<number, RawSentence[]>();
  const errors: string[] = [];
  for await (const entry of await client.messages.batches.results(batchId)) {
    const no = Number(entry.custom_id.replace(/^gp-/, ""));
    if (entry.result.type !== "succeeded") {
      errors.push(`${entry.custom_id}: ${entry.result.type}`);
      continue;
    }
    const parsed: RawSentence[] = [];
    for (const block of entry.result.message.content) {
      if (block.type !== "tool_use" || block.name !== SENTENCE_TOOL.name) continue;
      const input = block.input as { sentences?: RawSentence[] };
      for (const s of input.sentences ?? []) parsed.push(s);
    }
    byPoint.set(no, parsed);
  }

  if (errors.length > 0) {
    console.log(`\n${errors.length} batch requests did not succeed:`);
    for (const e of errors.slice(0, 10)) console.log(`  ${e}`);
  }

  await mkdir(CACHE, { recursive: true });
  await writeFile(dump, JSON.stringify([...byPoint]));
  console.log(`  cached raw output at ${path.relative(ROOT, dump)}`);

  return byPoint;
}

async function pollBatch(client: Anthropic, batchId: string): Promise<boolean> {
  const started = Date.now();
  for (;;) {
    const batch = await client.messages.batches.retrieve(batchId);
    if (batch.processing_status === "ended") {
      const c = batch.request_counts;
      console.log(
        `  ended: ${c.succeeded} succeeded, ${c.errored} errored, ${c.expired} expired, ${c.canceled} canceled`,
      );
      return true;
    }
    if (Date.now() - started > POLL_TIMEOUT_MS) {
      console.error(`\nBatch ${batchId} still ${batch.processing_status} after 6h — giving up.`);
      console.error(`Resume later with --batch-id=${batchId}.`);
      process.exitCode = 1;
      return false;
    }
    const c = batch.request_counts;
    console.log(`  ${batch.processing_status}: ${c.processing} processing, ${c.succeeded} done`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

function reportToConsole(result: ValidationResult) {
  console.log(`  valid    ${result.valid.length}`);
  console.log(`  rejected ${result.rejected.length}`);
  for (const [code, n] of Object.entries(result.byCode)) {
    if (n > 0) console.log(`    ${code.padEnd(16)} ${n}`);
  }
  console.log(`  flagged  ${result.flagged.length} (contain a false friend)`);
  console.log("\nWriting data/:");
}

/**
 * Write a data file atomically, matching build-data.ts: temp file then
 * rename(2), so an interrupted run cannot leave a half-written JSON file
 * behind for the app to load.
 */
async function write(file: string, value: unknown) {
  const tmp = `${file}.partial`;
  const json = JSON.stringify(value);
  await writeFile(tmp, json);
  await rename(tmp, file);
  console.log(`  ${path.basename(file).padEnd(22)} ${(Buffer.byteLength(json) / 1024).toFixed(0)} KB`);
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await readFile(file, "utf8")) as T;
}

/**
 * Extend meta.json in place.
 *
 * The attribution line is deliberately blunt: these sentences are model output,
 * not a licensed corpus, and the app must not imply otherwise to the learner.
 */
async function updateMeta(level: string, result: ValidationResult, pointCount: number) {
  const file = path.join(DATA, "meta.json");
  const meta = await readJson<Record<string, unknown>>(file);

  const counts = (meta.counts ?? {}) as Record<string, unknown>;
  counts.sentences = result.valid.length;
  counts.sentencesByLevel = {
    ...((counts.sentencesByLevel as Record<string, number>) ?? {}),
    [level]: result.valid.length,
  };
  meta.counts = counts;

  const sources = (meta.sources ?? {}) as Record<string, unknown>;
  sources.sentences = {
    generator: "scripts/generate-sentences.ts",
    model: MODEL,
    method: "Anthropic Batch API, structured output via tool use",
    license: "generated for this project; not a third-party corpus",
    note: "LLM-generated, machine-validated. Not native-written and not reviewed by a native speaker.",
    generatedAt: new Date().toISOString(),
    levels: [level],
    grammarPointsRequested: pointCount,
    validated: result.valid.length,
    rejected: result.rejected.length,
  };
  meta.sources = sources;

  const attribution = (meta.attribution ?? []) as string[];
  const line =
    "Practice sentences in sentences.json are generated by Claude (Anthropic) from the HSK 3.0 grammar points and machine-validated against the HSK wordlist. They are not native-written, are not a licensed corpus, and have not been reviewed by a native speaker.";
  meta.attribution = attribution.filter((a) => !a.startsWith("Practice sentences")).concat(line);

  await write(file, meta);
}

function renderReport(
  level: string,
  result: ValidationResult,
  points: GrammarPoint[],
  model: string,
): string {
  const total = result.valid.length + result.rejected.length;
  const coverage = coverageByGrammarPoint(
    result.valid,
    result.rejected,
    points.map((p) => p.no),
  );

  const byPoint = new Map(points.map((p) => [p.no, p]));
  const coverageRows = [...coverage.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([no, c]) => {
      const p = byPoint.get(no);
      const label = p ? `${p.category} › ${p.details}` : "—";
      const flag = c.valid === 0 ? " ⚠️ **none**" : c.valid < 3 ? " ⚠️ thin" : "";
      return `| ${no} | ${label} | ${c.valid} | ${c.rejected} |${flag} |`;
    })
    .join("\n");

  const empty = [...coverage.entries()].filter(([, c]) => c.valid === 0).map(([no]) => no);
  const thin = [...coverage.entries()]
    .filter(([, c]) => c.valid > 0 && c.valid < 3)
    .map(([no]) => no);

  const rejectionSections = (
    Object.keys(result.byCode) as (keyof typeof result.byCode)[]
  )
    .filter((code) => result.byCode[code] > 0)
    .map((code) => {
      const examples = result.rejected
        .filter((r) => r.code === code)
        .slice(0, 5)
        .map((r) => `- \`${r.sentence.hanzi || "(empty)"}\` (gp ${r.sentence.grammarPointNo}) — ${r.detail}`)
        .join("\n");
      return `### \`${code}\` — ${result.byCode[code]}\n\n${REJECTION_NOTES[code]}\n\n${examples}`;
    })
    .join("\n\n");

  const flaggedRows = result.flagged
    .slice(0, 25)
    .map((f) => `| \`${f.sentence.hanzi}\` | ${f.falseFriends.join(", ")} | ${f.sentence.viGloss} |`)
    .join("\n");

  const contrastCount = result.valid.filter((s) => s.viContrast).length;
  const contrastExamples = result.valid
    .filter((s) => s.viContrast)
    .slice(0, 8)
    .map(
      (s) =>
        `| \`${s.hanzi}\` | ${s.viContrast?.vietnameseOrder} | ${s.viContrast?.chineseOrder} |`,
    )
    .join("\n");

  const pct = (n: number) => (total ? ((100 * n) / total).toFixed(1) : "0.0");

  return `# Sentence pipeline report

Generated ${new Date().toISOString()} by \`yarn sentences:generate --level=${level}\`.

All numbers below are computed from the emitted dataset, not estimated.

## Dataset

| | |
| --- | --- |
| Target level | HSK ${level} |
| Grammar points | ${points.length} |
| Sentences requested | ${points.length * SENTENCES_PER_POINT} |
| Sentences returned | ${total} |
| **Passed validation** | **${result.valid.length}** (${pct(result.valid.length)}%) |
| Rejected | ${result.rejected.length} (${pct(result.rejected.length)}%) |
| Flagged for review | ${result.flagged.length} |
| Tagged \`viContrast\` | ${contrastCount} |

Model: \`${model}\`, via the Batch API with structured output (tool use).

**These sentences are LLM-generated, not native-written.** Every one passed the
machine checks below; none has been read by a native speaker. The checks verify
*structure* — that tiles rejoin, that no vocabulary escapes the level, that
nothing was truncated. They cannot verify that a sentence is idiomatic, that the
Vietnamese gloss is natural, or that the sentence actually teaches the grammar
point it was generated for. Those remain open.

## Validation

Every sentence must pass all of these before it is written. Failures are
reported with the offending sentence rather than dropped silently.

1. **Tiles rejoin** — concatenating every tile's text reproduces the hanzi exactly.
2. **Level cap** — no character and no multi-character tile above HSK ${level}.
   The allowed set is built from \`words.json\`, plus the content words of the
   level's own grammar points.
3. **Pinyin length** — syllable count equals hanzi character count. This is the
   cheap detector for a truncated or hallucinated sentence.
4. **No duplicates** — compared on the hanzi string across the whole corpus.
5. **Length bounds** — ${MIN_CHARS}–${MAX_CHARS} characters.

${result.rejected.length === 0 ? "_No sentence was rejected._" : `## Rejections\n\n${rejectionSections}`}

## Coverage per grammar point

${SENTENCES_PER_POINT} sentences were requested per point.

| # | Grammar point | Valid | Rejected | |
| --- | --- | --- | --- | --- |
${coverageRows}

${
  empty.length === 0
    ? "_Every grammar point has at least one valid sentence._"
    : `⚠️ **${empty.length} grammar points have no valid sentences at all**: ${empty.join(", ")}. These are not padded — the exercise simply cannot be offered for them until they are regenerated or hand-written.`
}

${
  thin.length === 0
    ? ""
    : `⚠️ **${thin.length} grammar points have fewer than 3 valid sentences**: ${thin.join(", ")}. Too few to space out over an SRS interval; expect immediate repeats.`
}

## Vietnamese word-order contrast

${contrastCount} sentences carry a \`viContrast\` tag, so a wrong tile order that
follows Vietnamese head-first order gets a specific correction instead of a
generic "incorrect".

Detection is structural and deliberately conservative — only 的-phrases with a
pronoun modifier, and nationality/language compounds built on a known place
name. Adjective+noun without 的 and relative clauses are **not** tagged, because
a wrong tag teaches a rule that does not exist, while a missing tag merely
falls back to the generic message.

${
  contrastCount === 0
    ? "_No sentence in this run exhibits a detectable contrast._"
    : `| Sentence | Vietnamese order | Chinese order |\n| --- | --- | --- |\n${contrastExamples}`
}

## False-friend flags

${result.flagged.length} sentences contain a word from \`false-friends.json\`.
These are **not** rejected — a false friend in context is often exactly what
should be drilled — but they are the sentences most likely to mislead a
Vietnamese reader through Hán-Việt transfer, so they need a human first.

${
  result.flagged.length === 0
    ? "_No sentence contains a known false friend._"
    : `| Sentence | False friend | Vietnamese gloss |\n| --- | --- | --- |\n${flaggedRows}`
}

## Limitations

Stated plainly, because the numbers above can only speak to structure:

- **No native review.** Naturalness, register and idiom are unverified. The
  prompt asks for everyday speech; whether it got it is unknown.
- **Vietnamese glosses are model output too**, and are the least checked field
  in the dataset — nothing validates them at all. They are the learner's native
  language, so an unnatural gloss is more damaging here than an unnatural
  English one.
- **"Exercises the grammar point" is unverified.** Nothing checks that a
  sentence generated for point ${points[0]?.no ?? "N"} actually uses that
  construction rather than merely containing one of its words.
- **Level-capping is lexical, not grammatical.** A sentence can use only HSK ${level}
  words and still be grammatically far beyond HSK ${level}.
- **Tone sandhi is not represented.** Pinyin comes from \`pinyin-pro\` per
  sentence, which applies 不/一 sandhi but writes third-tone sandhi in its
  underlying form — correct for reading, not a pronunciation guide.
- **Segmentation follows the deck, not a parser.** Tiles are longest-match
  against \`words.json\`, so a string that happens to contain a longer deck word
  splits along that word even when the sentence does not mean it.
`;
}

const REJECTION_NOTES: Record<Rejection["code"], string> = {
  "tiles-mismatch":
    "Segmentation did not reproduce the sentence. Always a pipeline bug rather than a model error, since tiles are derived from the hanzi.",
  "out-of-level":
    "The sentence used vocabulary above the target level — the failure mode the whole level cap exists to catch.",
  "pinyin-length":
    "Syllable count did not match character count, which usually means the model truncated or hallucinated one of the two fields.",
  duplicate: "The same hanzi string was produced twice, wasting a card.",
  "length-bounds": "Outside the 4–12 character window the tile exercise is built for.",
  malformed: "The tool call came back missing a required field.",
};

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
