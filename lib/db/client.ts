import 'server-only';

import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

import * as schema from './schema';

/**
 * Next's dev server re-evaluates modules on every hot reload. Without a cache
 * each reload opens a fresh pool and the old one lingers, which exhausts
 * Postgres connections after a handful of edits, so the client is stashed on
 * globalThis and reused.
 */
const globalForDb = globalThis as unknown as {
  chineseSql?: postgres.Sql;
};

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  return url;
}

const sql = globalForDb.chineseSql ?? postgres(connectionString(), { max: 5 });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.chineseSql = sql;
}

export const db = drizzle(sql, { schema });
export { sql, schema };
