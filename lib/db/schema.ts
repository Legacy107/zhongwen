import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core';

import type { CardType } from '@/lib/srs';

/**
 * Per-item SRS state. One row per (word, card type).
 *
 * `id` is derived from `wordId` + `cardType` (see `cardId()` in lib/srs.ts)
 * rather than random, so an offline phone and an offline laptop that both
 * create the card for the same word produce the same primary key and converge
 * on upsert instead of inserting duplicates.
 *
 * The FSRS columns mirror `SrsState` exactly. Anything missing here silently
 * corrupts scheduling rather than failing loudly, so the two must stay in step.
 */
export const cards = pgTable(
  'cards',
  {
    id: text('id').primaryKey(),
    wordId: text('word_id').notNull(),
    cardType: text('card_type').$type<CardType>().notNull(),

    // stability/difficulty are genuine floats -- storing them as numeric would
    // hand back strings and force a parse on every schedule computation.
    due: timestamp('due', { withTimezone: true, mode: 'date' }).notNull(),
    stability: real('stability').notNull(),
    difficulty: real('difficulty').notNull(),
    elapsedDays: integer('elapsed_days').notNull(),
    scheduledDays: integer('scheduled_days').notNull(),
    reps: integer('reps').notNull(),
    lapses: integer('lapses').notNull(),
    state: smallint('state').notNull(),
    lastReview: timestamp('last_review', { withTimezone: true, mode: 'date' }),
    /**
     * Completed learning steps. If this does not round-trip, a card loops on
     * step one forever: stability stays pinned and it never graduates out of
     * the learning phase.
     */
    learningSteps: integer('learning_steps').notNull().default(0),

    suspended: boolean('suspended').notNull().default(false),

    /** Last-write-wins clock, set by the client that made the edit. */
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    deviceId: text('device_id').notNull(),
    /**
     * Server clock at the moment the row last landed here, and the column
     * `pull(since)` filters on. Client timestamps cannot serve: a grade made
     * offline carries its grading time, so once pushed it would sit behind the
     * other device's watermark and never be pulled.
     */
    syncedAt: timestamp('synced_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('cards_due_idx').on(table.due),
    index('cards_updated_at_idx').on(table.updatedAt),
    index('cards_synced_at_idx').on(table.syncedAt),
  ],
);

/**
 * Append-only review log. Rows are never updated or deleted, so two devices
 * syncing merge by union and can never conflict.
 */
export const reviews = pgTable(
  'reviews',
  {
    /** Client-generated UUID, which makes replaying a failed push idempotent. */
    id: text('id').primaryKey(),
    cardId: text('card_id').notNull(),
    /** ts-fsrs `Rating`: 1 Again, 2 Hard, 3 Good, 4 Easy. */
    rating: smallint('rating').notNull(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true, mode: 'date' }).notNull(),
    durationMs: integer('duration_ms'),
    /** Card state at the moment of grading. */
    state: smallint('state').notNull(),
    deviceId: text('device_id').notNull(),
    /** See `cards.syncedAt`. */
    syncedAt: timestamp('synced_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('reviews_card_id_idx').on(table.cardId),
    index('reviews_reviewed_at_idx').on(table.reviewedAt),
    index('reviews_synced_at_idx').on(table.syncedAt),
  ],
);

/** Key/value user preferences (daily goal, desired retention, ...). */
export const settings = pgTable(
  'settings',
  {
    key: text('key').primaryKey(),
    value: jsonb('value').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
    /** See `cards.syncedAt`. */
    syncedAt: timestamp('synced_at', { withTimezone: true, mode: 'date' })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index('settings_updated_at_idx').on(table.updatedAt),
    index('settings_synced_at_idx').on(table.syncedAt),
  ],
);

export type CardRow = typeof cards.$inferSelect;
export type NewCardRow = typeof cards.$inferInsert;
export type ReviewRow = typeof reviews.$inferSelect;
export type NewReviewRow = typeof reviews.$inferInsert;
export type SettingRow = typeof settings.$inferSelect;
export type NewSettingRow = typeof settings.$inferInsert;
