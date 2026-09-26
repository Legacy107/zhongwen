import { z } from 'zod';

import { CARD_TYPES, type CardType, type ReviewCard } from '@/lib/srs';

/**
 * The over-the-wire shapes for /api/sync, shared by the client sync loop and
 * the route handler so a drift in one is a type error in the other.
 *
 * Dates travel as ISO strings. `lastReview` is the one awkward field: `SrsState`
 * models "never reviewed" as `undefined`, while Postgres and structured-clone
 * both hand back `null`. Rather than cast one into the other we accept both on
 * the wire and normalise at each boundary (see `toReviewCard`/`fromReviewCard`).
 */

const isoDate = z.iso.datetime({ offset: true });

const cardTypeSchema = z.enum(CARD_TYPES as readonly [CardType, ...CardType[]]);

export const cardPayloadSchema = z.object({
  id: z.string().min(1),
  wordId: z.string().min(1),
  cardType: cardTypeSchema,
  due: isoDate,
  stability: z.number().finite(),
  difficulty: z.number().finite(),
  elapsedDays: z.number().int(),
  scheduledDays: z.number().int(),
  reps: z.number().int().nonnegative(),
  lapses: z.number().int().nonnegative(),
  state: z.number().int().min(0).max(3),
  lastReview: isoDate.nullable(),
  learningSteps: z.number().int().nonnegative(),
  suspended: z.boolean(),
  updatedAt: isoDate,
  deviceId: z.string().min(1),
});

export const reviewPayloadSchema = z.object({
  id: z.string().min(1),
  cardId: z.string().min(1),
  rating: z.number().int().min(1).max(4),
  reviewedAt: isoDate,
  durationMs: z.number().int().nonnegative().nullable(),
  state: z.number().int().min(0).max(3),
  deviceId: z.string().min(1),
});

export const settingPayloadSchema = z.object({
  key: z.string().min(1),
  value: z.unknown(),
  updatedAt: isoDate,
});

export type CardPayload = z.infer<typeof cardPayloadSchema>;
export type ReviewPayload = z.infer<typeof reviewPayloadSchema>;
export type SettingPayload = z.infer<typeof settingPayloadSchema>;

export const syncPushSchema = z.object({
  cards: z.array(cardPayloadSchema).default([]),
  reviews: z.array(reviewPayloadSchema).default([]),
  settings: z.array(settingPayloadSchema).default([]),
});

export type SyncPush = z.infer<typeof syncPushSchema>;

export interface SyncPullResponse {
  cards: CardPayload[];
  reviews: ReviewPayload[];
  settings: SettingPayload[];
  serverTime: string;
  /** Set while rows remain: pass it back as `?cursor=` for the next page. */
  next?: string;
}

/**
 * A locally-stored card: the canonical SRS state plus the sync bookkeeping the
 * scheduler has no opinion about.
 */
export type StoredCard = ReviewCard & {
  updatedAt: Date;
  deviceId: string;
};

/** Wire -> domain. Normalises `null` back into the optional field `SrsState` uses. */
export function toStoredCard(payload: CardPayload): StoredCard {
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
    ...(payload.lastReview === null ? {} : { lastReview: new Date(payload.lastReview) }),
    learningSteps: payload.learningSteps,
    suspended: payload.suspended,
    updatedAt: new Date(payload.updatedAt),
    deviceId: payload.deviceId,
  };
}

/** Domain -> wire. */
export function fromStoredCard(card: StoredCard): CardPayload {
  return {
    id: card.id,
    wordId: card.wordId,
    cardType: card.cardType,
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsedDays,
    scheduledDays: card.scheduledDays,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.lastReview ? card.lastReview.toISOString() : null,
    learningSteps: card.learningSteps,
    suspended: card.suspended,
    updatedAt: card.updatedAt.toISOString(),
    deviceId: card.deviceId,
  };
}
