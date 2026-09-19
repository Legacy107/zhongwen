import {
  db,
  getLastSyncedAt,
  setLastSyncedAt,
  type OutboxEntry,
  type StoredReview,
} from './db/local';
import {
  cardPayloadSchema,
  reviewPayloadSchema,
  settingPayloadSchema,
  toStoredCard,
  type CardPayload,
  type ReviewPayload,
  type SettingPayload,
  type SyncPullResponse,
} from './db/wire';

/**
 * Background reconciliation between Dexie and Postgres.
 *
 * Nothing here is on the critical path of grading a card: the UI writes to
 * Dexie and returns, and this module drains the outbox later. Every entry
 * point swallows network failure, because being offline is an ordinary state
 * for this app rather than an error worth surfacing.
 */

const SYNC_ENDPOINT = '/api/sync';
const PUSH_BATCH_SIZE = 200;
const PERIODIC_INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 1_000;

export type SyncStatus = 'idle' | 'syncing' | 'offline' | 'unauthorized' | 'error';

export interface SyncResult {
  status: SyncStatus;
  pushed: number;
  pulled: { cards: number; reviews: number; settings: number };
}

type SyncListener = (status: SyncStatus) => void;

const listeners = new Set<SyncListener>();

export function onSyncStatus(listener: SyncListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(status: SyncStatus): void {
  for (const listener of listeners) listener(status);
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

/** Distinguishes "the server said no" from "there is no server right now". */
class OfflineError extends Error {}
class UnauthorizedError extends Error {}

async function request(input: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, { ...init, credentials: 'same-origin' });
  } catch (cause) {
    throw new OfflineError('sync request failed', { cause });
  }
  if (response.status === 401) throw new UnauthorizedError('sync unauthorized');
  if (!response.ok) throw new Error(`sync failed with ${response.status}`);
  return response;
}

/* ------------------------------------------------------------------- push */

interface GroupedOutbox {
  cards: CardPayload[];
  reviews: ReviewPayload[];
  settings: SettingPayload[];
}

/**
 * Re-validates on the way out. An outbox row may have been written by an older
 * version of the app, and a malformed entry would otherwise wedge the queue
 * forever by failing every subsequent push.
 */
function group(entries: OutboxEntry[]): { grouped: GroupedOutbox; invalid: string[] } {
  const grouped: GroupedOutbox = { cards: [], reviews: [], settings: [] };
  const invalid: string[] = [];

  for (const entry of entries) {
    switch (entry.kind) {
      case 'card': {
        const parsed = cardPayloadSchema.safeParse(entry.payload);
        if (parsed.success) grouped.cards.push(parsed.data);
        else invalid.push(entry.id);
        break;
      }
      case 'review': {
        const parsed = reviewPayloadSchema.safeParse(entry.payload);
        if (parsed.success) grouped.reviews.push(parsed.data);
        else invalid.push(entry.id);
        break;
      }
      case 'setting': {
        const parsed = settingPayloadSchema.safeParse(entry.payload);
        if (parsed.success) grouped.settings.push(parsed.data);
        else invalid.push(entry.id);
        break;
      }
    }
  }

  return { grouped, invalid };
}

/**
 * Drains the outbox in batches. Entries are deleted only after the server
 * confirms them, so a failed push leaves the queue intact for the next attempt.
 *
 * Card and setting entries are keyed by entity, so re-grading a card while its
 * push is in flight overwrites the queued row in place rather than adding one.
 * Deleting purely by id would then throw away that newer state, so each row
 * carries a `seq` and is removed only if it has not been touched since it was
 * sent. Anything bumped mid-flight survives for the next round.
 */
export async function pushOutbox(): Promise<number> {
  let pushed = 0;

  for (;;) {
    const entries = await db.outbox.orderBy('seq').limit(PUSH_BATCH_SIZE).toArray();
    if (entries.length === 0) break;

    const { grouped, invalid } = group(entries);
    if (invalid.length > 0) await db.outbox.bulkDelete(invalid);

    const invalidIds = new Set(invalid);
    const sending = entries.filter((entry) => !invalidIds.has(entry.id));
    if (sending.length === 0) continue;

    await request(SYNC_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(grouped),
    });

    const sentSeq = new Map(sending.map((entry) => [entry.id, entry.seq]));
    await db.transaction('rw', db.outbox, async () => {
      for (const [id, seq] of sentSeq) {
        const current = await db.outbox.get(id);
        // Re-enqueued while in flight: keep it for the next push.
        if (current && current.seq === seq) await db.outbox.delete(id);
      }
    });

    pushed += sending.length;

    if (entries.length < PUSH_BATCH_SIZE) break;
  }

  return pushed;
}

/* ------------------------------------------------------------------- pull */

/**
 * Fetches rows changed since the watermark and merges them into Dexie.
 *
 * Cards are last-write-wins on `updatedAt`: remote wins only if it is strictly
 * newer, so a local edit made while offline survives a pull that carries an
 * older server copy. Reviews union on their UUID and never conflict.
 */
export async function pull(since?: Date | null): Promise<SyncResult['pulled']> {
  const watermark = since ?? (await getLastSyncedAt());
  const url = watermark
    ? `${SYNC_ENDPOINT}?since=${encodeURIComponent(watermark.toISOString())}`
    : SYNC_ENDPOINT;

  const response = await request(url);
  const body = (await response.json()) as SyncPullResponse;

  const applied = { cards: 0, reviews: 0, settings: 0 };

  await db.transaction('rw', db.cards, db.reviews, db.settings, db.outbox, async () => {
    for (const payload of body.cards) {
      const parsed = cardPayloadSchema.safeParse(payload);
      if (!parsed.success) continue;

      const incoming = toStoredCard(parsed.data);
      const existing = await db.cards.get(incoming.id);

      // A card still queued locally has unsynced state; leave it alone so the
      // next push can resolve it server-side rather than dropping the grade.
      const queued = await db.outbox.get(`card:${incoming.id}`);
      if (queued) continue;

      if (!existing || incoming.updatedAt > existing.updatedAt) {
        await db.cards.put(incoming);
        applied.cards += 1;
      }
    }

    for (const payload of body.reviews) {
      const parsed = reviewPayloadSchema.safeParse(payload);
      if (!parsed.success) continue;
      if (await db.reviews.get(parsed.data.id)) continue;

      const review: StoredReview = {
        id: parsed.data.id,
        cardId: parsed.data.cardId,
        rating: parsed.data.rating,
        reviewedAt: new Date(parsed.data.reviewedAt),
        durationMs: parsed.data.durationMs,
        state: parsed.data.state,
        deviceId: parsed.data.deviceId,
      };
      await db.reviews.put(review);
      applied.reviews += 1;
    }

    for (const payload of body.settings) {
      const parsed = settingPayloadSchema.safeParse(payload);
      if (!parsed.success) continue;
      if (await db.outbox.get(`setting:${parsed.data.key}`)) continue;

      const updatedAt = new Date(parsed.data.updatedAt);
      const existing = await db.settings.get(parsed.data.key);
      if (!existing || updatedAt > existing.updatedAt) {
        await db.settings.put({ key: parsed.data.key, value: parsed.data.value, updatedAt });
        applied.settings += 1;
      }
    }
  });

  // Watermark comes from the server clock, so client skew cannot skip rows.
  await setLastSyncedAt(new Date(body.serverTime));

  return applied;
}

/* --------------------------------------------------------------- scheduling */

let inFlight: Promise<SyncResult> | null = null;

/**
 * Push then pull. Concurrent callers share one run rather than stacking, so a
 * focus event landing during the periodic timer does not double-sync.
 */
export function sync(): Promise<SyncResult> {
  if (inFlight) return inFlight;

  inFlight = (async (): Promise<SyncResult> => {
    if (!isOnline()) {
      emit('offline');
      return { status: 'offline', pushed: 0, pulled: { cards: 0, reviews: 0, settings: 0 } };
    }

    emit('syncing');
    try {
      const pushed = await pushOutbox();
      const pulled = await pull();
      emit('idle');
      return { status: 'idle', pushed, pulled };
    } catch (error) {
      const status: SyncStatus =
        error instanceof OfflineError
          ? 'offline'
          : error instanceof UnauthorizedError
            ? 'unauthorized'
            : 'error';
      emit(status);
      // Never rethrow: the outbox still holds everything, and a failed
      // background sync is not something the review UI should have to catch.
      return { status, pushed: 0, pulled: { cards: 0, reviews: 0, settings: 0 } };
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

/** Coalesces bursty triggers (focus + online firing together) into one sync. */
export function requestSync(): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void sync();
  }, DEBOUNCE_MS);
}

/**
 * Wires the triggers: app focus, regaining connectivity, and a slow timer.
 * Deliberately not called on each card grade -- that would reintroduce the
 * per-grade round-trip this whole design exists to avoid.
 *
 * Returns a teardown function.
 */
export function startSync(): () => void {
  if (typeof window === 'undefined') return () => {};

  const onFocus = () => requestSync();
  const onOnline = () => requestSync();
  const onVisibility = () => {
    if (document.visibilityState === 'visible') requestSync();
  };

  window.addEventListener('focus', onFocus);
  window.addEventListener('online', onOnline);
  document.addEventListener('visibilitychange', onVisibility);

  const interval = setInterval(() => {
    if (isOnline()) void sync();
  }, PERIODIC_INTERVAL_MS);

  requestSync();

  return () => {
    window.removeEventListener('focus', onFocus);
    window.removeEventListener('online', onOnline);
    document.removeEventListener('visibilitychange', onVisibility);
    clearInterval(interval);
    if (debounceTimer) clearTimeout(debounceTimer);
  };
}
