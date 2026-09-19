/**
 * End-to-end check of the sync API against a running dev server.
 *
 *   yarn db:up && yarn dev        # in one shell
 *   yarn tsx scripts/smoke-sync.ts
 *
 * Exercises the real HTTP path rather than the database directly: auth gate,
 * push, pull, last-write-wins, and review de-duplication.
 */

import { randomUUID } from 'node:crypto';

import { cardId, State } from '../lib/srs';
import type { CardPayload, ReviewPayload, SyncPullResponse } from '../lib/db/wire';

const BASE = process.env.SMOKE_BASE_URL ?? 'http://localhost:3000';
const PASSPHRASE = process.env.APP_PASSPHRASE;

if (!PASSPHRASE) throw new Error('APP_PASSPHRASE is not set (source .env first)');

let failures = 0;

function check(label: string, condition: boolean, detail?: unknown): void {
  if (condition) {
    console.log(`  ok   ${label}`);
  } else {
    failures += 1;
    console.log(`  FAIL ${label}${detail === undefined ? '' : ` -- ${JSON.stringify(detail)}`}`);
  }
}

async function main(): Promise<void> {
  const deviceId = `smoke-${randomUUID().slice(0, 8)}`;
  const wordId = `smoke-word-${randomUUID().slice(0, 8)}`;
  const id = cardId(wordId, 'recognition');

  console.log(`\nsync smoke test against ${BASE}`);
  console.log(`card id: ${id}\n`);

  // --- auth gate -----------------------------------------------------------
  console.log('auth');
  const noCookie = await fetch(`${BASE}/api/sync`);
  check('GET /api/sync without cookie is 401', noCookie.status === 401, noCookie.status);

  const badPass = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passphrase: 'definitely-not-the-passphrase' }),
  });
  check('POST /api/auth with wrong passphrase is 401', badPass.status === 401, badPass.status);

  const login = await fetch(`${BASE}/api/auth`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ passphrase: PASSPHRASE }),
  });
  check('POST /api/auth with correct passphrase is 200', login.status === 200, login.status);

  const setCookie = login.headers.get('set-cookie');
  check('auth response sets a cookie', Boolean(setCookie));
  check('cookie is httpOnly', Boolean(setCookie?.toLowerCase().includes('httponly')));
  check('cookie is sameSite=lax', Boolean(setCookie?.toLowerCase().includes('samesite=lax')));

  const cookie = setCookie?.split(';')[0] ?? '';
  const authed = { cookie, 'content-type': 'application/json' };

  // --- push ----------------------------------------------------------------
  console.log('\npush');
  const t0 = new Date();
  const card: CardPayload = {
    id,
    wordId,
    cardType: 'recognition',
    due: new Date(t0.getTime() + 600_000).toISOString(),
    stability: 3.2035,
    difficulty: 5.1234,
    elapsedDays: 0,
    scheduledDays: 0,
    reps: 1,
    lapses: 0,
    state: State.Learning,
    lastReview: t0.toISOString(),
    learningSteps: 1,
    suspended: false,
    updatedAt: t0.toISOString(),
    deviceId,
  };

  const review: ReviewPayload = {
    id: randomUUID(),
    cardId: id,
    rating: 3,
    reviewedAt: t0.toISOString(),
    durationMs: 1500,
    state: State.New,
    deviceId,
  };

  const push = await fetch(`${BASE}/api/sync`, {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({ cards: [card], reviews: [review], settings: [] }),
  });
  check('POST /api/sync is 200', push.status === 200, push.status);
  const pushBody: unknown = await push.json();
  console.log(`  -> ${JSON.stringify(pushBody)}`);

  // --- pull ----------------------------------------------------------------
  console.log('\npull');
  const since = new Date(t0.getTime() - 60_000).toISOString();
  const pull = await fetch(`${BASE}/api/sync?since=${encodeURIComponent(since)}`, {
    headers: { cookie },
  });
  check('GET /api/sync is 200', pull.status === 200, pull.status);

  const pulled = (await pull.json()) as SyncPullResponse;
  const gotCard = pulled.cards.find((c) => c.id === id);
  const gotReview = pulled.reviews.find((r) => r.id === review.id);

  check('card round-tripped', Boolean(gotCard));
  check('review round-tripped', Boolean(gotReview));
  check('learningSteps survived', gotCard?.learningSteps === 1, gotCard?.learningSteps);
  check('state survived', gotCard?.state === State.Learning, gotCard?.state);
  check('lastReview survived', gotCard?.lastReview === t0.toISOString(), gotCard?.lastReview);

  // real(4-byte float) loses precision past ~7 significant digits, which is far
  // finer than scheduling needs -- assert it round-trips within that tolerance.
  const stabilityDelta = Math.abs((gotCard?.stability ?? 0) - card.stability);
  check(`stability is a float (delta ${stabilityDelta.toExponential(2)})`, stabilityDelta < 1e-4, {
    sent: card.stability,
    got: gotCard?.stability,
  });
  check('difficulty is a float', typeof gotCard?.difficulty === 'number', gotCard?.difficulty);

  // --- idempotency: re-push the same review --------------------------------
  console.log('\nidempotency');
  const rePush = await fetch(`${BASE}/api/sync`, {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({ cards: [], reviews: [review], settings: [] }),
  });
  check('re-pushing the same review is 200', rePush.status === 200, rePush.status);

  const afterRePush = (await (
    await fetch(`${BASE}/api/sync?since=${encodeURIComponent(since)}`, { headers: { cookie } })
  ).json()) as SyncPullResponse;
  const dupes = afterRePush.reviews.filter((r) => r.id === review.id).length;
  check('review was not duplicated', dupes === 1, dupes);

  // --- last-write-wins -----------------------------------------------------
  console.log('\nlast-write-wins');
  const stale: CardPayload = {
    ...card,
    stability: 999,
    updatedAt: new Date(t0.getTime() - 60_000).toISOString(),
    deviceId: 'stale-device',
  };
  await fetch(`${BASE}/api/sync`, {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({ cards: [stale], reviews: [], settings: [] }),
  });

  const afterStale = (await (
    await fetch(`${BASE}/api/sync?since=${encodeURIComponent(since)}`, { headers: { cookie } })
  ).json()) as SyncPullResponse;
  const stillFresh = afterStale.cards.find((c) => c.id === id);
  check('older updatedAt did NOT overwrite', stillFresh?.stability !== 999, stillFresh?.stability);

  const newer: CardPayload = {
    ...card,
    stability: 12.5,
    learningSteps: 2,
    state: State.Review,
    updatedAt: new Date(t0.getTime() + 60_000).toISOString(),
    deviceId: 'newer-device',
  };
  await fetch(`${BASE}/api/sync`, {
    method: 'POST',
    headers: authed,
    body: JSON.stringify({ cards: [newer], reviews: [], settings: [] }),
  });

  const afterNewer = (await (
    await fetch(`${BASE}/api/sync?since=${encodeURIComponent(since)}`, { headers: { cookie } })
  ).json()) as SyncPullResponse;
  const updated = afterNewer.cards.find((c) => c.id === id);
  check('newer updatedAt DID overwrite', updated?.stability === 12.5, updated?.stability);
  check('learningSteps advanced to 2', updated?.learningSteps === 2, updated?.learningSteps);

  // --- since filtering -----------------------------------------------------
  console.log('\nwatermark');
  const future = new Date(Date.now() + 3_600_000).toISOString();
  const empty = (await (
    await fetch(`${BASE}/api/sync?since=${encodeURIComponent(future)}`, { headers: { cookie } })
  ).json()) as SyncPullResponse;
  check('future watermark returns no cards', empty.cards.length === 0, empty.cards.length);
  check('serverTime is present', Boolean(empty.serverTime), empty.serverTime);

  console.log(
    failures === 0 ? '\nall checks passed\n' : `\n${failures} check(s) FAILED\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

void main();
