import Dexie, { type EntityTable } from 'dexie';
import { z } from 'zod';

import {
  cardPayloadSchema,
  fromStoredCard,
  reviewPayloadSchema,
  settingPayloadSchema,
  toStoredCard,
  type CardPayload,
  type ReviewPayload,
  type SettingPayload,
  type StoredCard,
} from './wire';

/**
 * The local mirror of Postgres. Every read and write in the app goes here
 * first; sync reconciles in the background. Grading a card must never wait on
 * the network, so nothing in this module talks to the server.
 */

/** A review as stored locally. Append-only, so it never conflicts on merge. */
export interface StoredReview {
  id: string;
  cardId: string;
  rating: number;
  reviewedAt: Date;
  durationMs: number | null;
  state: number;
  deviceId: string;
}

export interface StoredSetting {
  key: string;
  value: unknown;
  updatedAt: Date;
}

export type OutboxKind = 'card' | 'review' | 'setting';

/**
 * Pending mutations awaiting a push. Entries are keyed by `${kind}:${entityId}`
 * for cards and settings so that grading the same card ten times offline
 * collapses to one queued row carrying the latest state, rather than ten.
 * Reviews are append-only and each gets its own entry.
 */
export interface OutboxEntry {
  id: string;
  kind: OutboxKind;
  payload: CardPayload | ReviewPayload | SettingPayload;
  createdAt: Date;
  /**
   * Bumped on every enqueue. A push deletes a row only if its `seq` still
   * matches the one that was sent, so a card re-graded while the request was
   * in flight keeps its queued row instead of being silently dropped.
   */
  seq: number;
}

/** Sync watermarks and one-off flags. */
export interface MetaEntry {
  key: string;
  value: unknown;
}

const DB_NAME = 'chinese';

class ChineseDb extends Dexie {
  cards!: EntityTable<StoredCard, 'id'>;
  reviews!: EntityTable<StoredReview, 'id'>;
  settings!: EntityTable<StoredSetting, 'key'>;
  outbox!: EntityTable<OutboxEntry, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor() {
    super(DB_NAME);
    this.version(1).stores({
      // Only indexed fields are listed; Dexie stores the whole object regardless.
      cards: 'id, wordId, cardType, due, state, suspended, updatedAt',
      reviews: 'id, cardId, reviewedAt',
      settings: 'key, updatedAt',
      outbox: 'id, kind, createdAt, seq',
      meta: 'key',
    });
  }
}

export const db = new ChineseDb();

const LAST_SYNCED_AT = 'lastSyncedAt';
const PERSISTENCE_REQUESTED = 'persistenceRequested';
const PERSISTENCE_GRANTED = 'persistenceGranted';

export async function getMeta<T>(key: string): Promise<T | undefined> {
  const row = await db.meta.get(key);
  return row === undefined ? undefined : (row.value as T);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await db.meta.put({ key, value });
}

export async function getLastSyncedAt(): Promise<Date | null> {
  const iso = await getMeta<string>(LAST_SYNCED_AT);
  return iso ? new Date(iso) : null;
}

export async function setLastSyncedAt(when: Date): Promise<void> {
  await setMeta(LAST_SYNCED_AT, when.toISOString());
}

/**
 * Ask the browser to exempt this origin from storage eviction. iOS in
 * particular will clear IndexedDB for sites it considers idle, which would
 * take every unsynced grade with it. Asked once and the outcome recorded;
 * the JSON backup below is the fallback for when this is denied.
 */
export async function requestPersistence(): Promise<boolean | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return null;

  const alreadyAsked = await getMeta<boolean>(PERSISTENCE_REQUESTED);
  if (alreadyAsked) return (await getMeta<boolean>(PERSISTENCE_GRANTED)) ?? null;

  const granted = await navigator.storage.persist();
  await setMeta(PERSISTENCE_REQUESTED, true);
  await setMeta(PERSISTENCE_GRANTED, granted);
  return granted;
}

function outboxKey(kind: OutboxKind, entityId: string): string {
  return `${kind}:${entityId}`;
}

/**
 * Monotonic within a tab. Combined with `Date.now()` it stays ordered across
 * reloads without needing a persisted counter, and only ever has to be
 * comparable to itself.
 */
let seqCounter = 0;
function nextSeq(): number {
  seqCounter += 1;
  return Date.now() * 1000 + (seqCounter % 1000);
}

/**
 * Queues a card for the next push. Uses `put` on a derived key so repeated
 * grades of one card between syncs collapse into a single pending mutation
 * carrying the newest state.
 */
export async function enqueueCard(card: StoredCard): Promise<void> {
  await db.outbox.put({
    id: outboxKey('card', card.id),
    kind: 'card',
    payload: fromStoredCard(card),
    createdAt: new Date(),
    seq: nextSeq(),
  });
}

export async function enqueueReview(review: StoredReview): Promise<void> {
  await db.outbox.put({
    id: outboxKey('review', review.id),
    kind: 'review',
    payload: {
      id: review.id,
      cardId: review.cardId,
      rating: review.rating,
      reviewedAt: review.reviewedAt.toISOString(),
      durationMs: review.durationMs,
      state: review.state,
      deviceId: review.deviceId,
    },
    createdAt: new Date(),
    seq: nextSeq(),
  });
}

export async function enqueueSetting(setting: StoredSetting): Promise<void> {
  await db.outbox.put({
    id: outboxKey('setting', setting.key),
    kind: 'setting',
    payload: {
      key: setting.key,
      value: setting.value,
      updatedAt: setting.updatedAt.toISOString(),
    },
    createdAt: new Date(),
    seq: nextSeq(),
  });
}

/**
 * Persists a graded card and its review log entry, and queues both, in one
 * transaction. If the tab dies mid-write the card and its outbox entry are
 * committed together or not at all.
 */
export async function saveGradedCard(card: StoredCard, review: StoredReview): Promise<void> {
  await db.transaction('rw', db.cards, db.reviews, db.outbox, async () => {
    await db.cards.put(card);
    await db.reviews.put(review);
    await enqueueCard(card);
    await enqueueReview(review);
  });
}

export async function putSetting(key: string, value: unknown): Promise<void> {
  const setting: StoredSetting = { key, value, updatedAt: new Date() };
  await db.transaction('rw', db.settings, db.outbox, async () => {
    await db.settings.put(setting);
    await enqueueSetting(setting);
  });
}

const backupFileSchema = z.object({
  version: z.literal(1),
  cards: z.array(cardPayloadSchema).default([]),
  reviews: z.array(reviewPayloadSchema).default([]),
  settings: z.array(settingPayloadSchema).default([]),
});

interface BackupFile {
  version: 1;
  exportedAt: string;
  cards: CardPayload[];
  reviews: ReviewPayload[];
  settings: SettingPayload[];
}

/**
 * Insurance against IndexedDB eviction, which on iOS can happen without
 * warning and is not recoverable from the server if a push never landed.
 */
export async function exportBackup(): Promise<Blob> {
  const [cards, reviews, settings] = await Promise.all([
    db.cards.toArray(),
    db.reviews.toArray(),
    db.settings.toArray(),
  ]);

  const backup: BackupFile = {
    version: 1,
    exportedAt: new Date().toISOString(),
    cards: cards.map(fromStoredCard),
    reviews: reviews.map((r) => ({
      id: r.id,
      cardId: r.cardId,
      rating: r.rating,
      reviewedAt: r.reviewedAt.toISOString(),
      durationMs: r.durationMs,
      state: r.state,
      deviceId: r.deviceId,
    })),
    settings: settings.map((s) => ({
      key: s.key,
      value: s.value,
      updatedAt: s.updatedAt.toISOString(),
    })),
  };

  return new Blob([JSON.stringify(backup)], { type: 'application/json' });
}

/**
 * Merges a backup into the local store. Idempotent: cards merge last-write-wins
 * on `updatedAt`, reviews are keyed by their client-generated UUID so
 * re-importing the same file adds nothing. Returns the counts actually applied.
 */
export async function importBackup(file: Blob): Promise<{ cards: number; reviews: number }> {
  const shape = backupFileSchema.parse(JSON.parse(await file.text()));

  let cardsApplied = 0;
  let reviewsApplied = 0;

  await db.transaction('rw', db.cards, db.reviews, db.settings, async () => {
    for (const payload of shape.cards) {
      const incoming = toStoredCard(payload);
      const existing = await db.cards.get(incoming.id);
      // Last-write-wins, so restoring a stale backup cannot clobber newer state.
      if (!existing || incoming.updatedAt > existing.updatedAt) {
        await db.cards.put(incoming);
        cardsApplied += 1;
      }
    }

    for (const payload of shape.reviews) {
      const existing = await db.reviews.get(payload.id);
      if (existing) continue;
      await db.reviews.put({
        id: payload.id,
        cardId: payload.cardId,
        rating: payload.rating,
        reviewedAt: new Date(payload.reviewedAt),
        durationMs: payload.durationMs,
        state: payload.state,
        deviceId: payload.deviceId,
      });
      reviewsApplied += 1;
    }

    for (const payload of shape.settings) {
      const incoming = new Date(payload.updatedAt);
      const existing = await db.settings.get(payload.key);
      if (!existing || incoming > existing.updatedAt) {
        await db.settings.put({ key: payload.key, value: payload.value, updatedAt: incoming });
      }
    }
  });

  return { cards: cardsApplied, reviews: reviewsApplied };
}
