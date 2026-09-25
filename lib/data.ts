/**
 * Loaders for the static JSON under public/data, shared across screens.
 *
 * Each file is fetched once per page load and the parsed result reused, so
 * moving between Read and Review does not re-parse the 2.4 MB deck. A failed
 * fetch is evicted rather than cached, so the next caller retries.
 */
import type { FalseFriend, Word } from './hanviet';
import { parseSentence, type ReaderSentence, type ReaderShard } from './reader';
import type { Sentence } from './sentences';

const cache = new Map<string, Promise<unknown>>();

function once<T>(key: string, load: () => Promise<T>): Promise<T> {
  let p = cache.get(key) as Promise<T> | undefined;
  if (!p) {
    p = load().catch((error) => {
      cache.delete(key);
      throw error;
    });
    cache.set(key, p);
  }
  return p;
}

async function json<T>(url: string): Promise<T> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return (await r.json()) as T;
}

export function loadWords(): Promise<Map<string, Word>> {
  return once('words', async () => {
    const words = await json<Word[]>('/data/words.json');
    return new Map(words.map((w) => [w.id, w]));
  });
}

export function loadFalseFriends(): Promise<Map<string, FalseFriend>> {
  return once('falseFriends', async () => {
    const list = await json<FalseFriend[]>('/data/false-friends.json').catch(() => []);
    return new Map(list.map((f) => [f.simplified, f]));
  });
}

/** Sentences per deck word in the reading corpus: the new-card order. */
export function loadWordFrequency(): Promise<Record<string, number>> {
  return once('frequency', () =>
    json<Record<string, number>>('/data/word-frequency.json').catch(() => ({})),
  );
}

export const READER_LEVELS = ['1', '2', '3', '4', '5', '6'] as const;

export function loadReaderShard(level: string): Promise<ReaderSentence[]> {
  return once(`reader:${level}`, async () => {
    const shard = await json<ReaderShard>(`/data/reader/L${level}.json`);
    return shard.sentences.map(parseSentence);
  });
}

export async function loadReaderShards(levels: readonly string[]): Promise<ReaderSentence[]> {
  const shards = await Promise.all(levels.map(loadReaderShard));
  return shards.flat();
}

/** The generated Stage 2.5 practice set, with the committed fixture as a fallback. */
export function loadPracticeSentences(): Promise<Sentence[]> {
  return once('practice', async () => {
    for (const url of ['/data/sentences.json', '/data/sentences-fixture.json']) {
      try {
        const data = await json<Sentence[]>(url);
        if (data.length) return data;
      } catch {
        // Try the next source.
      }
    }
    throw new Error('No sentence set found. Run yarn sentences:generate.');
  });
}
