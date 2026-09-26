import { defineConfig } from 'drizzle-kit';

import { databaseUrl } from './lib/db/url';

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: { url: databaseUrl() },
  strict: true,
  verbose: true,
});
