import 'server-only';

import { and, getTableColumns, gt, sql, type SQL } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { z } from 'zod';

import { getDb } from './client';
import { cards, reviews, settings, type CardRow, type ReviewRow, type SettingRow } from './schema';
import type { CardPayload, ReviewPayload, SettingPayload, SyncPullResponse } from './wire';

/**
 * Pulls re-read this far behind the client's watermark. A row stamped by a
 * transaction that commits just after a pull began would otherwise fall behind
 * it; re-sending a few rows is harmless because every merge is idempotent.
 */
const PULL_OVERLAP_MS = 60_000;

/**
 * Rows per table in one response. A row is under 500 bytes, so a full page of
 * all three stays far inside the 4.5 MB a Vercel function may return; a device
 * pulling its whole history follows `next` instead.
 */
export const PULL_PAGE_SIZE = 1000;

/**
 * Where a table's next page starts: missing before its first page, then the
 * last row sent as `[syncedAt, key]`, then `null` once the table is done.
 * `syncedAt` is kept as Postgres's own text, not a JS Date, which has only
 * milliseconds: a resume point rounded down would re-send every row at that
 * instant, forever once more of them share it than fit on a page.
 */
const resumeSchema = z.tuple([z.string(), z.string()]).nullable().optional();

type Resume = z.infer<typeof resumeSchema>;

const cursorSchema = z.object({
  since: z.iso.datetime(),
  serverTime: z.iso.datetime(),
  cards: resumeSchema,
  reviews: resumeSchema,
  settings: resumeSchema,
});

export type PullCursor = z.infer<typeof cursorSchema>;

/** A pull's first page: everything since `watermark`, less the overlap. */
export function startPull(watermark: Date): PullCursor {
  return {
    since: new Date(Math.max(0, watermark.getTime() - PULL_OVERLAP_MS)).toISOString(),
    // Taken before the reads, so nothing written during them is skipped next
    // time. Every later page hands back this same time.
    serverTime: new Date().toISOString(),
  };
}

/** Cursors are opaque to the client: base64url JSON, validated on the way back in. */
export function decodeCursor(text: string): PullCursor | null {
  try {
    const parsed = cursorSchema.safeParse(JSON.parse(Buffer.from(text, 'base64url').toString('utf8')));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function encodeCursor(cursor: PullCursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

const asText = (column: PgColumn) => sql<string>`${column}::text`;

/** Rows stamped after `since`, and after the resume point when there is one. */
function changedSince(syncedAt: PgColumn, key: PgColumn, since: Date, resume: Resume): SQL | undefined {
  const newer = gt(syncedAt, since);
  if (!resume) return newer;
  return and(newer, sql`(${syncedAt}, ${key}) > (${resume[0]}::timestamptz, ${resume[1]})`);
}

/** Trims a table's rows (read one past the page) to a page, and says where the next one starts. */
function trim<Row extends { at: string }>(
  rows: Row[],
  size: number,
  keyOf: (row: Row) => string,
): { rows: Row[]; resume: Resume } {
  if (rows.length <= size) return { rows, resume: null };
  const sent = rows.slice(0, size);
  const last = sent[sent.length - 1];
  return { rows: sent, resume: [last.at, keyOf(last)] };
}

/**
 * One page of a pull. Each table pages on its own `(syncedAt, key)` order, so a
 * row that changes mid-pull moves later and is sent again rather than skipped.
 */
export async function readPage(cursor: PullCursor, size = PULL_PAGE_SIZE): Promise<SyncPullResponse> {
  const db = getDb();
  const since = new Date(cursor.since);

  const [cardRows, reviewRows, settingRows] = await Promise.all([
    cursor.cards === null
      ? []
      : db
          .select({ ...getTableColumns(cards), at: asText(cards.syncedAt) })
          .from(cards)
          .where(changedSince(cards.syncedAt, cards.id, since, cursor.cards))
          .orderBy(cards.syncedAt, cards.id)
          .limit(size + 1),
    cursor.reviews === null
      ? []
      : db
          .select({ ...getTableColumns(reviews), at: asText(reviews.syncedAt) })
          .from(reviews)
          .where(changedSince(reviews.syncedAt, reviews.id, since, cursor.reviews))
          .orderBy(reviews.syncedAt, reviews.id)
          .limit(size + 1),
    cursor.settings === null
      ? []
      : db
          .select({ ...getTableColumns(settings), at: asText(settings.syncedAt) })
          .from(settings)
          .where(changedSince(settings.syncedAt, settings.key, since, cursor.settings))
          .orderBy(settings.syncedAt, settings.key)
          .limit(size + 1),
  ]);

  const cardPage = trim(cardRows, size, (row) => row.id);
  const reviewPage = trim(reviewRows, size, (row) => row.id);
  const settingPage = trim(settingRows, size, (row) => row.key);

  const more = cardPage.resume || reviewPage.resume || settingPage.resume;
  return {
    cards: cardPage.rows.map(toCardPayload),
    reviews: reviewPage.rows.map(toReviewPayload),
    settings: settingPage.rows.map(toSettingPayload),
    serverTime: cursor.serverTime,
    ...(more
      ? {
          next: encodeCursor({
            ...cursor,
            cards: cardPage.resume,
            reviews: reviewPage.resume,
            settings: settingPage.resume,
          }),
        }
      : {}),
  };
}

function toCardPayload(row: CardRow): CardPayload {
  return {
    id: row.id,
    wordId: row.wordId,
    cardType: row.cardType,
    due: row.due.toISOString(),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsedDays,
    scheduledDays: row.scheduledDays,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state,
    lastReview: row.lastReview ? row.lastReview.toISOString() : null,
    learningSteps: row.learningSteps,
    suspended: row.suspended,
    updatedAt: row.updatedAt.toISOString(),
    deviceId: row.deviceId,
  };
}

function toReviewPayload(row: ReviewRow): ReviewPayload {
  return {
    id: row.id,
    cardId: row.cardId,
    rating: row.rating,
    reviewedAt: row.reviewedAt.toISOString(),
    durationMs: row.durationMs,
    state: row.state,
    deviceId: row.deviceId,
  };
}

function toSettingPayload(row: SettingRow): SettingPayload {
  return {
    key: row.key,
    value: row.value,
    updatedAt: row.updatedAt.toISOString(),
  };
}
