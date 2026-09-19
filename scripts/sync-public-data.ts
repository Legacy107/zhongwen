/**
 * Mirrors data/*.json into public/data so the client can fetch it and the
 * service worker can precache it for offline review.
 *
 * data/ stays the source of truth and is committed; public/data is generated
 * and gitignored, so the two cannot drift.
 */
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = "data";
const DEST = join("public", "data");

mkdirSync(DEST, { recursive: true });

let n = 0;
for (const file of readdirSync(SRC)) {
  if (!file.endsWith(".json")) continue;
  copyFileSync(join(SRC, file), join(DEST, file));
  n++;
}

console.log(`synced ${n} data file(s) -> ${DEST}`);
