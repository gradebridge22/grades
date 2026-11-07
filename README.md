# OnTrack Grades: schoolwork tracking for families (MVP)

A secure, mobile-friendly web app. Parents and students use it to track grades and assignments, catch retake opportunities, answer quick one-tap check-ins, and follow up with teachers. It's built to **support** students. It doesn't secretly monitor or shame them.

> **All demo data is synthetic.** No real child, school or grade appears anywhere in this repo.

## Quick start (demo mode, no accounts needed)

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # 50 tests, including tenant isolation against real Postgres RLS
```

When the Supabase variables are unset, the app runs **in-process Postgres (PGlite)**. It uses the *same* migrations and row-level-security policies as production, plus synthetic seed data. Sign in as any demo user:

| Demo user | What to try |
|---|---|
| Demo Parent Alex | Dashboard, grades table, retakes, teacher follow-up, dismiss an assignment, CSV import |
| Ava (synthetic student) | One-tap replies, encouragement, in-app nudges |
| Demo Guardian Sam | Second guardian in the same family (has not consented to email, so gets none) |
| Demo Parent Blake | A **different family**. Try opening Ava's URLs: you get a 404 |

Trigger the notification job manually: `curl -X POST localhost:3000/api/cron/notifications`. Mock emails, with their one-tap links, print to the server log.

## Feature status

| Area | Status |
|---|---|
| Auth (Supabase magic link), family + roles, guardian/student invites | ✅ Implemented |
| Row-level security, tenant isolation, audit log | ✅ Implemented + tested |
| Manual entry and CSV import (grades, assignments) | ✅ Implemented |
| Grades table (every course, official vs platform, period types, source + refresh time, trends) | ✅ Implemented |
| Assignment buckets, previous-period exclusion, permanent dismissals with reason | ✅ Implemented + tested |
| Retake classification (confirmed / teacher-approved / unused-unknown / unknown / closed) | ✅ Implemented + tested |
| One-tap student replies (8 options + typed), full history | ✅ Implemented |
| Follow-up rule (hours or school days, timezone-aware), "Needs teacher follow-up" | ✅ Implemented + tested |
| Notification planner, idempotent queue, retries with backoff, delivery log, quiet hours, consent | ✅ Implemented + tested |
| Email delivery | ✅ Resend if `RESEND_API_KEY` is set, otherwise 🟦 **Mocked** (logged) |
| Secure expiring reply links, preview/scanner-safe (explicit POST) | ✅ Implemented + tested |
| Export (JSON), family deletion, configurable retention | ✅ Implemented |
| Canvas sync (read-only, observer token, encrypted at rest) | 🟧 **Waiting for integration**: coded against the documented API, not yet tested against a live district |
| Skyward | 🟧 **Waiting for district API**. Use the browser extension or a CSV export from Family Access |
| Browser extension (parent signs in; extension reads the page) | ✅ Pairing, ingest API, Canvas reader · 🟧 Skyward reader is a prototype to tune on real pages. See `extension/README.md` |
| Explore interests (outside courses, affiliate slots) | 🟦 **Mocked** catalog, parent-only, links off by default |
| Push notifications | ⏳ Later phase |

See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** for scope, architecture, schema, integration limits and privacy notes.

## Production setup (Supabase + Vercel)

1. **Create a Supabase project.** Under Auth → URL configuration, add `https://YOUR_DOMAIN/auth/callback`.
2. **Run the migrations** in order: `supabase/migrations/0001_schema.sql`, `0002_rls.sql`, `0003_functions.sql`. Use the SQL editor or `supabase db push`. **Do not** run `supabase/shim.sql` or `seed.sql` against production.
3. **Set the environment variables** from `.env.example` in Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `DATABASE_URL` (the transaction pooler connection string).
   - `SESSION_SECRET`, `REPLY_LINK_SECRET`, `TOKEN_ENCRYPTION_KEY` and `CRON_SECRET`. Generate each with `openssl rand -base64 32`.
   - `RESEND_API_KEY` and `EMAIL_FROM` (verify your sending domain in Resend).
   - `APP_URL=https://YOUR_DOMAIN`.
4. **Deploy:** `vercel deploy --prod`. `vercel.json` schedules the notification job every 15 minutes. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
5. **Sign in**, create your family, add children, then import a CSV from **Connections**.

Other hosts work too. Run `npm run build && npm start` and call `POST /api/cron/notifications` with the bearer secret every 15 minutes.

## How data access is secured

- Every user query runs inside `db.asUser(userId, …)`. That switches to the Postgres `authenticated` role and sets the JWT subject, so **RLS decides visibility**, exactly as Supabase enforces it. No user-facing code path bypasses RLS.
- `db.asService` (bypasses RLS) is used only by server jobs: the notification sender, sync and retention.
- Integration tokens are stored AES-256-GCM-encrypted in `integration_secrets`. That table has RLS on and **no policies**, so no signed-in user can read it.
- Reply-link tokens are HMAC-signed, expire after 72h, are single-family/single-assignment, and can be revoked via a nonce table.

## Project layout

```
supabase/migrations/   schema, RLS policies, functions (audit, export, delete, retention)
supabase/seed.sql      synthetic demo data      supabase/shim.sql  auth stub for tests/demo only
src/lib/domain/        pure business rules (assignments, retakes, follow-up, notifications, sync, csv, reply tokens)
src/lib/data/          DB engine (PGlite | postgres.js) and RLS-scoped queries
src/lib/notifications/ queue, sender, email providers
src/lib/integrations/  Canvas (read-only allowlist), Skyward placeholder, sync service
src/app/               screens, server actions, API routes
tests/                 vitest suites
```
