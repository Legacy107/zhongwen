import {
  createEmptyCard,
  fsrs,
  generatorParameters,
  Rating,
  State,
  type Card as FsrsCard,
  type Grade,
  type RecordLogItem,
} from 'ts-fsrs';

/**
 * The ways an item is drilled. Each gets its own independent schedule.
 *
 * The first three drill a word. `sentence` drills a whole sentence through the
 * tile-ordering exercise, and its `wordId` holds a sentence id instead — the
 * column is plain text with no foreign key, so the two coexist without a
 * schema change. WORD_CARD_TYPES is what the vocabulary review queue uses.
 */
export type CardType = 'recognition' | 'typing' | 'hanviet' | 'sentence';

export const CARD_TYPES: readonly CardType[] = ['recognition', 'typing', 'hanviet', 'sentence'];

/** Card types that drill a single word; excludes `sentence`. */
export const WORD_CARD_TYPES: readonly CardType[] = ['recognition', 'typing', 'hanviet'];

/** Serialisable SRS state. Dates are Date objects in memory, ISO strings on the wire. */
export interface SrsState {
  due: Date;
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: State;
  lastReview?: Date;
  /** How many learning steps the card has completed. Must survive storage or
   *  the card never graduates out of the learning phase. */
  learningSteps: number;
}

export interface ReviewCard extends SrsState {
  id: string;
  wordId: string;
  cardType: CardType;
  suspended: boolean;
}

/**
 * Higher retention means more reviews for the same material. 0.9 is the FSRS
 * default and a sane starting point; exposed so it can become a user setting.
 */
export const DEFAULT_RETENTION = 0.9;

const scheduler = fsrs(
  generatorParameters({
    request_retention: DEFAULT_RETENTION,
    enable_fuzz: true,
    enable_short_term: true,
  }),
);

/** Stable across devices so two clients independently derive the same id. */
export function cardId(wordId: string, cardType: CardType): string {
  return `${wordId}:${cardType}`;
}

export function newCard(wordId: string, cardType: CardType, now = new Date()): ReviewCard {
  return { id: cardId(wordId, cardType), wordId, cardType, suspended: false, ...toSrsState(createEmptyCard(now)) };
}

/**
 * Seeds a card as already-known, for vocabulary learned before the app existed.
 * `stability` is in days: how long until recall probability decays to the
 * retention target. A wrongly-seeded card simply resurfaces early, which is
 * harmless, so a rough estimate is fine.
 */
export function seedKnownCard(
  wordId: string,
  cardType: CardType,
  stabilityDays: number,
  now = new Date(),
): ReviewCard {
  const card = newCard(wordId, cardType, now);
  const due = new Date(now.getTime() + stabilityDays * 86_400_000);
  return {
    ...card,
    state: State.Review,
    stability: stabilityDays,
    difficulty: 5,
    scheduledDays: stabilityDays,
    reps: 1,
    lastReview: now,
    learningSteps: 0,
    due,
  };
}

function toSrsState(card: FsrsCard): SrsState {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review,
    learningSteps: card.learning_steps,
  };
}

function toFsrsCard(state: SrsState): FsrsCard {
  return {
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    last_review: state.lastReview,
    learning_steps: state.learningSteps,
  };
}

export { Rating, State };

export interface GradeResult {
  card: ReviewCard;
  /** Append-only log entry; never conflicts between devices. */
  review: { cardId: string; rating: Grade; reviewedAt: Date; state: State };
}

export function grade(card: ReviewCard, rating: Grade, now = new Date()): GradeResult {
  const next = scheduler.next(toFsrsCard(card), now, rating) as RecordLogItem;
  return {
    card: { ...card, ...toSrsState(next.card) },
    review: { cardId: card.id, rating, reviewedAt: now, state: card.state },
  };
}

/** Interval previews for the four rating buttons, so the UI can show "2d / 5d / 12d". */
export function previewIntervals(card: ReviewCard, now = new Date()): Record<Grade, Date> {
  const log = scheduler.repeat(toFsrsCard(card), now) as Record<Grade, RecordLogItem>;
  return {
    [Rating.Again]: log[Rating.Again].card.due,
    [Rating.Hard]: log[Rating.Hard].card.due,
    [Rating.Good]: log[Rating.Good].card.due,
    [Rating.Easy]: log[Rating.Easy].card.due,
  };
}

export function isDue(card: ReviewCard, now = new Date()): boolean {
  return !card.suspended && card.due.getTime() <= now.getTime();
}

/** Cards per session. Everything in the deck is technically "new", so without a
 *  cap the queue would be 16k long and the daily count meaningless. */
export const SESSION_SIZE = 40;

/** New cards admitted per session, counted inside SESSION_SIZE. Keeping intake
 *  bounded is what stops a big deck turning into an unclearable backlog. */
export const NEW_PER_SESSION = 10;

/** Due cards first (most overdue leads), then new cards. */
export function sortForReview(cards: ReviewCard[], now = new Date()): ReviewCard[] {
  return cards
    .filter((c) => !c.suspended)
    .filter((c) => c.state === State.New || isDue(c, now))
    .sort((a, b) => {
      if (a.state === State.New && b.state !== State.New) return 1;
      if (b.state === State.New && a.state !== State.New) return -1;
      return a.due.getTime() - b.due.getTime();
    });
}

export interface QueueOptions<T> {
  sessionSize?: number;
  newPerSession?: number;
  /**
   * Order for new cards, lower first. Without one they come in creation
   * order, which for the deck is HSK list order: alphabetical by pinyin.
   */
  rankNew?: (card: T) => number;
}

/**
 * The actual session queue: every due review, plus a bounded number of new cards.
 *
 * `sortForReview` alone admits the whole unstarted deck, which makes "due"
 * counts read as tens of thousands. Callers should use this instead so the
 * number on the home screen is the number of cards a session will contain.
 */
export function buildQueue<T extends ReviewCard>(
  cards: T[],
  now = new Date(),
  { sessionSize = SESSION_SIZE, newPerSession = NEW_PER_SESSION, rankNew }: QueueOptions<T> = {},
): T[] {
  const sorted = sortForReview(cards, now) as T[];
  const due = sorted.filter((c) => c.state !== State.New);
  const fresh = sorted.filter((c) => c.state === State.New);
  if (rankNew) {
    const rank = new Map(fresh.map((c) => [c.id, rankNew(c)]));
    fresh.sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  }
  return [...due, ...fresh.slice(0, newPerSession)].slice(0, sessionSize);
}
