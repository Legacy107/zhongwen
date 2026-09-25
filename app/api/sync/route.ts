import { gt, sql as sqlOp } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import { AUTH_COOKIE, verifyCookieValue } from '@/lib/auth';
import { db } from '@/lib/db/client';
import { cards, reviews, settings, type NewCardRow } from '@/lib/db/schema';
import {
  syncPushSchema,
  type CardPayload,
  type ReviewPayload,
  type SettingPayload,
  type SyncPullResponse,
} from '@/lib/db/wire';

export const runtime = 'nodejs';
/** Always hits the database; caching a sync response would serve stale state. */
export const dynamic = 'force-dynamic';

/**
 * The passphrase gate has no sign-in screen yet, so development runs open for
 * the laptop and a phone on the LAN. Production stays closed until it does:
 * the endpoint writes to the only copy of the review history that survives an
 * iOS storage wipe.
 */
async function isAuthorised(): Promise<boolean> {
  if (process.env.NODE_ENV !== 'production') return true;
  const store = await cookies();
  return verifyCookieValue(store.get(AUTH_COOKIE)?.value);
}

const unauthorised = () => NextResponse.json({ error: 'unauthorized' }, { status: 401 });

function toCardRow(payload: CardPayload): NewCardRow {
  return {
    id: payload.id,
    wordId: payload.wordId,
    cardType: payload.cardType,
    due: new Date(payload.due),
    stability: payload.stability,
    difficulty: payload.difficulty,
    elapsedDays: payload.elapsedDays,
    scheduledDays: payload.scheduledDays,
    reps: payload.reps,
    lapses: payload.lapses,
    state: payload.state,
    lastReview: payload.lastReview === null ? null : new Date(payload.lastReview),
    learningSteps: payload.learningSteps,
    suspended: payload.suspended,
    updatedAt: new Date(payload.updatedAt),
    deviceId: payload.deviceId,
  };
}

/**
 * POST /api/sync -- accepts a batch of queued client mutations.
 *
 * Cards upsert last-write-wins on `updatedAt`; reviews are append-only and
 * ignore duplicate ids, which makes retrying a push whose response was lost
 * safe rather than duplicating the log.
 */
export async function POST(request: Request): Promise<NextResponse> {
  if (!(await isAuthorised())) return unauthorised();

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: 'invalid json' }, { status: 400 });
  }

  const parsed = syncPushSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid body', issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { cards: cardPayloads, reviews: reviewPayloads, settings: settingPayloads } = parsed.data;

  await db.transaction(async (tx) => {
    if (cardPayloads.length > 0) {
      await tx
        .insert(cards)
        .values(cardPayloads.map(toCardRow))
        .onConflictDoUpdate({
          target: cards.id,
          set: {
            wordId: sqlOp`excluded.word_id`,
            cardType: sqlOp`excluded.card_type`,
            due: sqlOp`excluded.due`,
            stability: sqlOp`excluded.stability`,
            difficulty: sqlOp`excluded.difficulty`,
            elapsedDays: sqlOp`excluded.elapsed_days`,
            scheduledDays: sqlOp`excluded.scheduled_days`,
            reps: sqlOp`excluded.reps`,
            lapses: sqlOp`excluded.lapses`,
            state: sqlOp`excluded.state`,
            lastReview: sqlOp`excluded.last_review`,
            learningSteps: sqlOp`excluded.learning_steps`,
            suspended: sqlOp`excluded.suspended`,
            updatedAt: sqlOp`excluded.updated_at`,
            deviceId: sqlOp`excluded.device_id`,
            syncedAt: sqlOp`now()`,
          },
          // The LWW guard lives in SQL so two devices pushing at once cannot
          // interleave a read-then-write and let the older row win.
          setWhere: sqlOp`excluded.updated_at > ${cards.updatedAt}`,
        });
    }

    if (reviewPayloads.length > 0) {
      await tx
        .insert(reviews)
        .values(
          reviewPayloads.map((payload) => ({
            id: payload.id,
            cardId: payload.cardId,
            rating: payload.rating,
            reviewedAt: new Date(payload.reviewedAt),
            durationMs: payload.durationMs,
            state: payload.state,
            deviceId: payload.deviceId,
          })),
        )
        .onConflictDoNothing({ target: reviews.id });
    }

    if (settingPayloads.length > 0) {
      await tx
        .insert(settings)
        .values(
          settingPayloads.map((payload) => ({
            key: payload.key,
            value: payload.value,
            updatedAt: new Date(payload.updatedAt),
          })),
        )
        .onConflictDoUpdate({
          target: settings.key,
          set: {
            value: sqlOp`excluded.value`,
            updatedAt: sqlOp`excluded.updated_at`,
            syncedAt: sqlOp`now()`,
          },
          setWhere: sqlOp`excluded.updated_at > ${settings.updatedAt}`,
        });
    }
  });

  return NextResponse.json({
    ok: true,
    accepted: {
      cards: cardPayloads.length,
      reviews: reviewPayloads.length,
      settings: settingPayloads.length,
    },
    serverTime: new Date().toISOString(),
  });
}

/**
 * Pulls re-read this far behind the client's watermark. A row stamped by a
 * transaction that commits just after a pull began would otherwise fall behind
 * it; re-sending a few rows is harmless because every merge is idempotent.
 */
const PULL_OVERLAP_MS = 60_000;

/**
 * GET /api/sync?since=<iso> -- rows changed since the client's watermark.
 *
 * Filters on the server-stamped `syncedAt`, not the client's `updatedAt` or
 * `reviewedAt`: a grade made offline and pushed later is old by its own clock
 * but new to every other device.
 */
export async function GET(request: Request): Promise<NextResponse> {
  if (!(await isAuthorised())) return unauthorised();

  const sinceParam = new URL(request.url).searchParams.get('since');
  const watermark = sinceParam ? new Date(sinceParam) : new Date(0);
  if (Number.isNaN(watermark.getTime())) {
    return NextResponse.json({ error: 'invalid since' }, { status: 400 });
  }
  const since = new Date(Math.max(0, watermark.getTime() - PULL_OVERLAP_MS));

  // Taken before the reads, so nothing written during them is skipped next time.
  const serverTime = new Date().toISOString();

  const [cardRows, reviewRows, settingRows] = await Promise.all([
    db.select().from(cards).where(gt(cards.syncedAt, since)),
    db.select().from(reviews).where(gt(reviews.syncedAt, since)),
    db.select().from(settings).where(gt(settings.syncedAt, since)),
  ]);

  const body: SyncPullResponse = {
    cards: cardRows.map(
      (row): CardPayload => ({
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
      }),
    ),
    reviews: reviewRows.map(
      (row): ReviewPayload => ({
        id: row.id,
        cardId: row.cardId,
        rating: row.rating,
        reviewedAt: row.reviewedAt.toISOString(),
        durationMs: row.durationMs,
        state: row.state,
        deviceId: row.deviceId,
      }),
    ),
    settings: settingRows.map(
      (row): SettingPayload => ({
        key: row.key,
        value: row.value,
        updatedAt: row.updatedAt.toISOString(),
      }),
    ),
    serverTime,
  };

  return NextResponse.json(body);
}
