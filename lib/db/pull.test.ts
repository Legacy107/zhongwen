import assert from "node:assert/strict";
import { test } from "node:test";

import { sql } from "drizzle-orm";

import { CARD_TYPES } from "../srs";
import { getDb } from "./client";
import { decodeCursor, readPage, startPull } from "./pull";
import { cards, reviews, settings } from "./schema";

// Paging lives in SQL, so this runs against a real Postgres: a migrated
// scratch database whose name ends in _test, because its tables get emptied.
// CI provides one; the README shows how to make one locally.
const url = process.env.TEST_DATABASE_URL;
if (url) {
  assert.match(new URL(url).pathname, /_test$/, "TEST_DATABASE_URL must name a scratch database ending in _test");
  process.env.DATABASE_URL = url;
}

test("a pull pages through every row once, even rows one push stamped at the same instant", { skip: !url }, async () => {
  const db = getDb();
  try {
    await db.delete(reviews);
    await db.delete(cards);
    await db.delete(settings);

    // One push's rows share its transaction's now(), microseconds included.
    const instant = sql`'2026-09-26 03:00:00.123456+00'::timestamptz`;
    await db.insert(reviews).values(
      Array.from({ length: 7 }, (_, i) => ({
        id: `r${i}`,
        cardId: "c0",
        rating: 3,
        reviewedAt: new Date(),
        durationMs: null,
        state: 2,
        deviceId: "test",
        syncedAt: instant,
      })),
    );
    await db.insert(cards).values(
      Array.from({ length: 3 }, (_, i) => ({
        id: `c${i}`,
        wordId: `w${i}`,
        cardType: CARD_TYPES[0],
        due: new Date(),
        stability: 1,
        difficulty: 5,
        elapsedDays: 0,
        scheduledDays: 1,
        reps: 1,
        lapses: 0,
        state: 2,
        deviceId: "test",
      })),
    );
    await db.insert(settings).values({ key: "dailyGoal", value: 20 });

    const seen = { cards: [] as string[], reviews: [] as string[], settings: [] as string[] };
    let cursor = startPull(new Date(0));
    for (let page = 1; ; page++) {
      assert.ok(page <= 10, "the pull never finished");
      const body = await readPage(cursor, 2);
      assert.equal(body.serverTime, cursor.serverTime);
      seen.cards.push(...body.cards.map((c) => c.id));
      seen.reviews.push(...body.reviews.map((r) => r.id));
      seen.settings.push(...body.settings.map((s) => s.key));
      if (!body.next) break;
      const next = decodeCursor(body.next);
      assert.ok(next);
      cursor = next;
    }

    assert.deepEqual(seen.reviews, ["r0", "r1", "r2", "r3", "r4", "r5", "r6"]);
    assert.deepEqual(seen.cards, ["c0", "c1", "c2"]);
    assert.deepEqual(seen.settings, ["dailyGoal"]);
  } finally {
    await db.$client.end();
  }
});

test("refuses a cursor it did not issue", () => {
  assert.equal(decodeCursor("not a cursor"), null);
  assert.equal(decodeCursor(Buffer.from(JSON.stringify({ since: "yesterday" })).toString("base64url")), null);
});
