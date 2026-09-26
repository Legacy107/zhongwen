/**
 * Checks a live deploy for the things a broken one gets wrong.
 *
 *   yarn smoke https://<production domain> [commit]
 *
 * Run by CI after every production deploy. The sign-in check sends a wrong
 * passphrase: 401 is healthy, and a 500 means APP_PASSPHRASE or AUTH_SECRET is
 * missing on Vercel.
 *
 * With a commit, it first waits until the domain serves that build: the domain
 * moves to a new deploy a few seconds after `vercel deploy` returns, and
 * checking straight away tests the previous one.
 */
import { randomUUID } from "node:crypto";

interface Check {
  name: string;
  path: string;
  init?: RequestInit;
  status: number;
  /** Part of the expected content-type. */
  type?: string;
}

const CHECKS: Check[] = [
  { name: "home page", path: "/", status: 200, type: "text/html" },
  { name: "service worker", path: "/serwist/sw.js", status: 200, type: "javascript" },
  { name: "manifest", path: "/manifest.webmanifest", status: 200 },
  { name: "sync refuses a signed-out request", path: "/api/sync", status: 401 },
  {
    name: "sign-in refuses a wrong passphrase",
    path: "/api/auth",
    // Random so it can never be the real one. It counts as one failed sign-in
    // for the CI runner's IP, not the learner's.
    init: {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ passphrase: `smoke-${randomUUID()}` }),
    },
    status: 401,
  },
];

const WAIT_MS = 120_000;

/** The service worker's precache is stamped with the commit it was built from (app/serwist/[path]/route.ts). */
async function waitForCommit(base: string, commit: string) {
  const started = Date.now();
  for (;;) {
    const worker = await fetch(`${base}/serwist/sw.js`)
      .then((response) => response.text())
      .catch(() => "");
    if (worker.includes(commit)) {
      console.log(`serving ${commit.slice(0, 7)} after ${Math.round((Date.now() - started) / 1000)}s`);
      return;
    }
    if (Date.now() - started > WAIT_MS) throw new Error(`${base} is still serving an older deploy than ${commit.slice(0, 7)}`);
    await new Promise((resolve) => setTimeout(resolve, 5000));
  }
}

async function main() {
  const base = process.argv[2]?.replace(/\/+$/, "");
  const commit = process.argv[3];
  if (!base) {
    console.error("usage: yarn smoke <url> [commit]");
    process.exit(2);
  }
  if (commit) await waitForCommit(base, commit);

  let failed = 0;
  for (const check of CHECKS) {
    const response = await fetch(base + check.path, { redirect: "manual", ...check.init });
    const type = response.headers.get("content-type") ?? "";
    const ok = response.status === check.status && (!check.type || type.includes(check.type));
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"} ${check.name}: ${response.status} ${type}`);
  }
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
