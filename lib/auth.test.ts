import assert from "node:assert/strict";
import { test } from "node:test";
import { AUTH_MAX_AGE_SECONDS, issueCookieValue, verifyCookieValue, verifyPassphrase } from "./auth";

// Read at call time, not import time, so setting them here is early enough.
process.env.AUTH_SECRET = "test-secret";
process.env.APP_PASSPHRASE = "correct horse";

const DAY = 24 * 60 * 60 * 1000;

test("a sign-in lasts 30 days, enforced server-side even for a session cookie", () => {
  const issued = new Date("2026-09-01T00:00:00Z");
  const cookie = issueCookieValue(issued);
  assert.equal(AUTH_MAX_AGE_SECONDS, 30 * 24 * 60 * 60);
  assert.ok(verifyCookieValue(cookie, new Date(issued.getTime() + 29 * DAY)));
  assert.ok(!verifyCookieValue(cookie, new Date(issued.getTime() + 30 * DAY)));
});

test("rejects forged, truncated and future-dated cookies", () => {
  const cookie = issueCookieValue(new Date("2026-09-01T00:00:00Z"));
  const [issuedAt] = cookie.split(".");
  assert.ok(!verifyCookieValue(`${issuedAt}.forged`));
  assert.ok(!verifyCookieValue(`${Number(issuedAt) + 1}.${cookie.split(".")[1]}`));
  assert.ok(!verifyCookieValue(issuedAt));
  assert.ok(!verifyCookieValue(undefined));
  const future = issueCookieValue(new Date("2030-01-01T00:00:00Z"));
  assert.ok(!verifyCookieValue(future, new Date("2026-09-02T00:00:00Z")));
});

test("checks the passphrase exactly", () => {
  assert.ok(verifyPassphrase("correct horse"));
  assert.ok(!verifyPassphrase("correct horse "));
  assert.ok(!verifyPassphrase(""));
});
