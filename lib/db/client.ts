import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';
import { databaseUrl } from './url';

function connect() {
  const sql = postgres(databaseUrl(), {
    max: 5,
    // Neon's pooled URL goes through PgBouncer in transaction mode, where a
    // statement prepared on one server connection can be missing on the next.
    prepare: false,
    // Closes connections after 20 idle seconds rather than holding them
    // between syncs, so Neon's compute can scale to zero.
    idle_timeout: 20,
  });
  return drizzle(sql, { schema });
}

type Db = ReturnType<typeof connect>;

/**
 * Next's dev server re-evaluates modules on every hot reload. Without a cache
 * each reload opens a fresh pool and the old one lingers, which exhausts
 * Postgres connections after a handful of edits, so the client is stashed on
 * globalThis and reused.
 */
const globalForDb = globalThis as unknown as {
  chineseDb?: Db;
};

/**
 * Connects on first use rather than on import: `next build` loads every route
 * to read its config, and CI builds with no database.
 */
export function getDb(): Db {
  globalForDb.chineseDb ??= connect();
  return globalForDb.chineseDb;
}

export { schema };
