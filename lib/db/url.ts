/**
 * `DATABASE_URL`, adjusted for postgres.js. Shared by the app and
 * drizzle.config.ts, so it cannot import `server-only`.
 *
 * Neon's connection strings end in `channel_binding=require`, a libpq-only
 * option. postgres.js hands any URL parameter it doesn't know to the server as
 * a session setting, and Postgres then refuses the connection, so it is
 * dropped. Channel binding is what guards Neon's `sslmode=require` against a
 * man in the middle (`require` encrypts but never checks the certificate), so
 * the certificate is checked instead.
 */
export function databaseUrl(): string {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not set');

  const url = new URL(raw);
  url.searchParams.delete('channel_binding');
  if (url.searchParams.get('sslmode') === 'require') url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}
