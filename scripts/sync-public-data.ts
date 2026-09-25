/**
 * Mirrors data/*.json (and data/reader/*.json) into public/data so the client
 * can fetch it and the service worker can precache it for offline use.
 *
 * data/ stays the source of truth and is committed; public/data is generated
 * and gitignored, so the two cannot drift.
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { join } from "node:path";

const SRC = "data";
const DEST = join("public", "data");

let n = 0;
for (const dir of ["", "reader"]) {
  const from = join(SRC, dir);
  if (!existsSync(from)) continue;
  const to = join(DEST, dir);
  mkdirSync(to, { recursive: true });
  for (const file of readdirSync(from)) {
    if (!file.endsWith(".json")) continue;
    copyFileSync(join(from, file), join(to, file));
    n++;
  }
}

console.log(`synced ${n} data file(s) -> ${DEST}`);
