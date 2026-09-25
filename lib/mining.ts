/**
 * Sentence mining: pulling a word met while reading into the review queue,
 * and keeping the sentence it came from as a sentence-building exercise.
 *
 * Both live in the synced settings table under their own keys, one per word
 * and one per sentence. Per-key last-write-wins then never conflicts: mining
 * 学生 on the phone and 老师 on the laptop are two different rows. A single
 * "mined list" setting would have one device's list overwrite the other's.
 */
import { db, putSetting } from './db/local';
import { encodeSentence, parseSentence, type ReaderSentence, type ReaderSentenceWire } from './reader';
import type { Sentence } from './sentences';

const MINED = 'mined:';
const SAVED_SENTENCE = 'sentence:';

export interface MinedWord {
  wordId: string;
  /** ISO time it was mined; earlier mines are learned first. */
  at: string;
  /** Where it was met, shown when the word first comes up in review. */
  context?: { id: string; hanzi: string; en: string };
}

interface MinedValue {
  at: string;
  context?: MinedWord['context'];
}

export async function mineWord(wordId: string, from?: ReaderSentence): Promise<void> {
  const value: MinedValue = { at: new Date().toISOString() };
  if (from) value.context = { id: from.id, hanzi: from.hanzi, en: from.en };
  await putSetting(`${MINED}${wordId}`, value);
  if (from) await saveSentence(from);
}

/** Ordering two tiles is a coin flip, not an exercise. */
const MIN_TILES = 3;

/** Keeps a reading sentence as a tile-building exercise on /build. */
export async function saveSentence(s: ReaderSentence): Promise<void> {
  if (toPracticeSentence(s).tiles.length < MIN_TILES) return;
  const key = `${SAVED_SENTENCE}${s.id}`;
  if (await db.settings.get(key)) return;
  await putSetting(key, encodeSentence(s));
}

export async function loadMinedWords(): Promise<Map<string, MinedWord>> {
  const rows = await db.settings.where('key').startsWith(MINED).toArray();
  const out = new Map<string, MinedWord>();
  for (const row of rows) {
    const value = row.value as MinedValue | null;
    if (!value?.at) continue;
    const wordId = row.key.slice(MINED.length);
    out.set(wordId, { wordId, at: value.at, context: value.context });
  }
  return out;
}

export async function loadSavedSentences(): Promise<ReaderSentence[]> {
  const rows = await db.settings.where('key').startsWith(SAVED_SENTENCE).toArray();
  return (
    rows
      .map((row) => row.value as ReaderSentenceWire | null)
      .filter((v): v is ReaderSentenceWire => Boolean(v?.id && v.tk))
      .map(parseSentence)
      // Saved before the tile minimum existed; still too short to be worth building.
      .filter((s) => toPracticeSentence(s).tiles.length >= MIN_TILES)
  );
}

/**
 * A mined sentence in the shape the tile builder takes. Punctuation is dropped
 * from the tiles, as in the generated set: nobody is asked to place a 。.
 */
export function toPracticeSentence(s: ReaderSentence): Sentence {
  const tiles = s.tokens
    .filter((t) => t.pinyin || t.wordId || t.free || /[0-9０-９]/.test(t.text))
    .map((t) => ({ text: t.text, pinyin: t.pinyin, wordId: t.wordId ?? null }));
  return {
    id: s.id,
    hanzi: s.hanzi,
    pinyin: tiles.map((t) => t.pinyin).filter(Boolean).join(' '),
    modelPinyin: '',
    enGloss: s.en,
    viGloss: s.vi ?? '',
    grammarPointNo: 0,
    level: s.level,
    tiles,
  };
}
