# OnTrack Grades: scope, architecture and limits

## 1. MVP scope in plain English

**In:** one family workspace with parents/guardians and students. Parents see every child. A student sees only their own work. Grades and assignments come from manual entry or CSV import (works with no school connection), and later from Canvas through an authorized token. The app sorts work into upcoming / overdue / missing / submitted-awaiting-grade / low score. It flags retake chances honestly, asks students one-tap questions, nudges them on the next school day, and gathers "done but no grade yet" items into a **Needs teacher follow-up** list. Parents get email and in-app summaries and recaps, with quiet hours, school days, timezone and explicit consent respected.

**Out (for now):** push notifications, scraping any school site, storing school passwords, a universal Skyward integration, SMS, and AI features.

## 2. Architecture

```
Browser (Next.js App Router, server components + server actions, Tailwind)
   │  session cookie (Supabase Auth JWT; signed demo cookie in demo mode)
   ▼
Next.js server ── db.asUser(uid) ──► Postgres role "authenticated" + JWT claims ──► RLS policies
      │                                         (Supabase Postgres, or PGlite in demo/tests)
      ├─ /api/cron/notifications ── db.asService ─► plan → enqueue (unique idempotency key) → send → delivery_log
      ├─ /r/[token]  (GET = render buttons only)   /r/[token]/confirm (POST = record reply)
      └─ sync service ─► provider adapter (Canvas read-only GET allowlist) ─► upsert by (child, source, external_id)
```

Why one SQL layer instead of the Supabase JS client: the same SQL and RLS run in tests, demo and production. The tenant-isolation tests then exercise the **real** policies, not mocks.

## 3. Database schema (plain English)

| Table | What it holds |
|---|---|
| `families` | Name, timezone, school days, quiet hours, retention settings, what to do when data is stale |
| `family_members` | Who belongs (parent / guardian / student) and, for students, which child record is theirs |
| `family_invites` | Pending invites (only a hash of the token is stored; it expires in 7 days) |
| `children` | First name or nickname, optional grade level, optional link to the student's login |
| `school_holidays` | Days that don't count as school days |
| `grading_periods` | Quarters, semesters and years with dates; drives "current period" and exclusions |
| `courses` | Every course, even without a grade; source and external id for de-duplication |
| `grade_records` | One latest value per course × source × period × kind (quarter / semester / report card), official vs platform, provisional vs final |
| `grade_history` | Append-only observed values for trends (written by trigger; never interpolated) |
| `assignments` | Due/close dates, score, **source** submission status, a separate planner checkbox, attempts (null = unknown), retake status |
| `assignment_exclusions` | Permanent parent dismissals with a reason (survive every sync; no delete policy) |
| `assignment_inclusions` | Deliberate "include this previous-period item in reminders" |
| `student_replies` | Append-only reply history (8 statuses + note, channel, author, timestamp) |
| `notification_prefs` / `notification_consents` | Per-person channels, types, summary time, recap mode, follow-up delay; versioned consent records |
| `notifications` / `delivery_log` | Queue with a unique idempotency key, attempts, backoff and every delivery attempt |
| `reply_links` | Nonces for signed one-tap links (expiry, revocation, use count) |
| `integration_connections` / `integration_secrets` / `sync_runs` | Connection health (last attempt vs last **success**, what wasn't refreshed); encrypted tokens; run history |
| `audit_log` | Who did what: replies, dismissals, membership, connections, exports |

## 4. Integration limitations (honest version)

- **Canvas.** Canvas has a documented REST API. The supported family route is a **parent observer account** paired with the student. That account's token (if the district allows personal tokens) or a district-issued OAuth developer key gives read-only access. The adapter can only issue GETs to an allowlist of metadata endpoints and blocks anything touching quiz submissions or sessions, so it **cannot start, open or submit** a quiz. If Canvas doesn't expose `allowed_attempts`, attempts stay **unknown**.
- **Skyward.** There is no universal parent API. A direct connection depends on the district enabling an approved interface (e.g. OneRoster). Until then, export from Family Access and import the CSV. We don't promise a Skyward connection.
- **Not done, by design:** storing school passwords, using a student's credentials for automation, bypassing MFA or captchas, and scraping.
- **When auth fails:** the connection is marked **Reconnect needed**, the last good data and its timestamp are kept, and the UI and summaries spell out what wasn't refreshed. Parents choose between a labeled partial summary and waiting.

## 5. Privacy and legal notes (not legal advice; get a review before launch)

- **COPPA** (US, children under 13). If a child under 13 uses the student login, the operator generally needs verifiable parental consent and must limit what's collected. The design is parent-initiated: parents create the student account, and data is minimal (no birthdates or student IDs). Confirm the consent mechanism with counsel.
- **FERPA** governs schools, not parents. When data comes through a school agreement or an LMS integration approved by a district, the district's contract terms (often a data privacy agreement, DPA) and FERPA's "school official" rules can bind you. Parent-entered data is generally outside FERPA, but treat it to the same standard.
- **State student-privacy laws** (e.g. California SOPIPA and similar laws in many states, including Florida). These often bar targeted advertising based on student data and the sale of it. They can apply to operators of K-12 services even without a school contract.
- **Affiliate / "Explore interests".** Keep it parent-only. Base it on interests chosen by the family, never on grades or school records. Disclose paid links (FTC). Never send family data to partners. Under-13 users raise extra COPPA advertising limits.
- **Built-in defaults:** no ads, no sale of data, no AI training on family data, export + delete, configurable retention, audit log, encryption in transit (HTTPS) and for tokens at rest. Supabase encrypts databases at rest.

## 6. Phases

1. ✅ Auth, families, RLS, manual/CSV data, dashboards, replies
2. ✅ Follow-up rules, notification queue, email + in-app, reply links
3. 🟧 Canvas live pilot with one district/observer account; Skyward via a district API if one becomes available
4. ⏳ Push notifications (web push), SMS (with its own consent), richer teacher-message drafting
