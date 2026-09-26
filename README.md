# zhongwen

A Chinese-learning PWA built for a Vietnamese speaker. It has:

- FSRS spaced repetition
- a bridge through Hán-Việt readings
- tone drills weighted to the mistakes Vietnamese speakers tend to make
- sentence building
- a graded reader

It works offline from IndexedDB and syncs to Postgres behind a passphrase.

Next.js 16, Dexie, Drizzle with Postgres, ts-fsrs, Serwist.

## Develop

```bash
yarn install
cp .env.example .env   # leave APP_PASSPHRASE unset to sync without signing in
yarn db:up             # Postgres 17 in Docker, on port 5433
DATABASE_URL=postgresql://chinese:chinese@localhost:5433/chinese yarn db:migrate
yarn dev
```

Run `yarn lint`, `yarn typecheck` and `yarn test` to check your changes. The sync paging test needs a scratch database and skips itself without one:

```bash
docker exec chinese-postgres createdb -U chinese chinese_test
DATABASE_URL=postgresql://chinese:chinese@localhost:5433/chinese_test yarn db:migrate
TEST_DATABASE_URL=postgresql://chinese:chinese@localhost:5433/chinese_test yarn test
```

To change the schema, edit `lib/db/schema.ts`, run `yarn db:generate`, and commit the new file in `drizzle/`. Keep migrations additive: add columns and tables, but don't rename or drop them. Production migrates just before new code goes live, so for a moment the old code runs against the new schema.

## Deploy

Production runs on Vercel (Hobby plan, functions in Sydney) with Neon Postgres in Sydney. GitHub Actions deploys it (`.github/workflows/ci.yml`); Vercel's own Git deployments are turned off in `vercel.json`.

- **Every push:** lint, then migrations and tests against a throwaway Postgres, then a production build with no secrets.
- **Push to `main`,** once that passes: `vercel build`, migrate Neon, `vercel deploy --prod`, then `yarn smoke` against the live site.

None of the secrets are in this repo:

| Name | Where | What |
| --- | --- | --- |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | Vercel, Production | Set by the Neon integration |
| `APP_PASSPHRASE`, `AUTH_SECRET` | Vercel, Production, Sensitive | Sign-in. Changing `AUTH_SECRET` signs every device out |
| `VERCEL_TOKEN` | GitHub environment `production` | Lets CI deploy. Limit it to the `zhongwen` project: CI skips `vercel pull`, the one step that needs team-wide access |
| `DATABASE_URL_UNPOOLED` | GitHub environment `production` | Neon's direct URL, for migrations |

A changed Vercel variable only applies from the next deploy. To redeploy without a new commit, go to Actions → CI → Run workflow on `main`.

`npx vercel rollback` switches back to the previous deploy instantly. It doesn't undo migrations, which is another reason to keep them additive.

## Data

Vocabulary from HSK 3.0 (ivankra/hsk30, MIT). Vietnamese glosses from CVDICT by Phong Phan and English from CC-CEDICT (both CC BY-SA 4.0). Readings from the Unicode Unihan database. Reading sentences from [Tatoeba](https://tatoeba.org) (CC BY 2.0 FR).
