-- GradeBridge schema. Every family-owned row carries family_id for tenant isolation.
-- Supabase provides auth.users / auth.uid(); tests and demo mode install a shim first.

create schema if not exists app;

-- Families -----------------------------------------------------------------
create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(name) between 1 and 80),
  timezone text not null default 'America/New_York',
  school_days int[] not null default '{1,2,3,4,5}', -- ISO weekday 1=Mon..7=Sun
  quiet_start time not null default '21:00',
  quiet_end time not null default '07:00',
  retention_replies_days int not null default 730 check (retention_replies_days >= 30),
  retention_notifications_days int not null default 180 check (retention_notifications_days >= 7),
  stale_data_mode text not null default 'partial_labeled' check (stale_data_mode in ('partial_labeled','wait')),
  onboarded_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.children (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  display_name text not null check (length(display_name) between 1 and 60),
  grade_level text,
  user_id uuid unique references auth.users(id) on delete set null, -- the student's own login, optional
  created_at timestamptz not null default now()
);
create index on public.children(family_id);

create table public.family_members (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('parent','guardian','student')),
  display_name text not null default '',
  email text,
  child_id uuid references public.children(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (family_id, user_id),
  check ((role = 'student') = (child_id is not null))
);
create index on public.family_members(user_id);

create table public.family_invites (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  email text not null,
  role text not null check (role in ('parent','guardian','student')),
  child_id uuid references public.children(id) on delete cascade,
  token_hash text not null unique,          -- sha256 of the invite token; raw token is only emailed
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.school_holidays (
  family_id uuid not null references public.families(id) on delete cascade,
  day date not null,
  label text,
  primary key (family_id, day)
);

-- Academic data --------------------------------------------------------------
create table public.grading_periods (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('quarter','semester','year')),
  starts_on date not null,
  ends_on date not null check (ends_on >= starts_on)
);
create index on public.grading_periods(child_id);

create table public.courses (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  name text not null,
  teacher text,
  source text not null check (source in ('manual','csv','canvas','skyward')),
  external_id text,
  created_at timestamptz not null default now(),
  unique (child_id, source, external_id)
);

-- One row per course x source x period x kind. Latest value; history kept in grade_history.
create table public.grade_records (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  period_id uuid not null references public.grading_periods(id) on delete cascade,
  source text not null check (source in ('manual','csv','canvas','skyward')),
  -- official = school information system (report card); platform = learning platform gradebook
  source_type text not null check (source_type in ('official','platform')),
  kind text not null check (kind in ('quarter','semester','report_card')),
  status text not null check (status in ('provisional','final')),
  percent numeric(5,2) check (percent between 0 and 200),
  letter text,
  recorded_at timestamptz not null default now(),
  unique (course_id, source, period_id, kind)
);

create table public.grade_history (
  id bigserial primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  grade_record_id uuid not null references public.grade_records(id) on delete cascade,
  percent numeric(5,2),
  letter text,
  observed_at timestamptz not null default now()
);

create table public.assignments (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  period_id uuid references public.grading_periods(id) on delete set null,
  source text not null check (source in ('manual','csv','canvas','skyward')),
  external_id text,
  title text not null,
  kind text not null default 'assignment' check (kind in ('assignment','quiz','test')),
  teacher text,
  source_url text check (source_url is null or source_url ~ '^https://'),
  due_at timestamptz,
  closes_at timestamptz,
  points_possible numeric,
  score numeric,
  -- What the SOURCE says about submission. A planner/to-do checkbox is stored separately and never implies submission.
  submission_status text not null default 'unknown'
    check (submission_status in ('not_submitted','submitted','graded','missing','excused','unknown')),
  submitted_at timestamptz,
  graded_at timestamptz,
  planner_checked boolean not null default false,
  attempts_used int check (attempts_used >= 0),          -- null = unknown
  attempts_allowed int check (attempts_allowed >= 1),    -- null = unknown (or unlimited)
  attempts_unlimited boolean not null default false,
  retake_status text not null default 'none'
    check (retake_status in ('none','confirmed_open','teacher_approved','closed','unknown')),
  retake_closes_at timestamptz,
  retake_note text,
  retake_verified_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (child_id, source, external_id)
);
create index on public.assignments(child_id, due_at);

-- Parent decisions. Separate tables so a re-sync can never wipe them.
create table public.assignment_exclusions (
  assignment_id uuid primary key references public.assignments(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  reason text not null check (length(reason) between 3 and 500),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.assignment_inclusions ( -- deliberately include previous-period work in reminders
  assignment_id uuid primary key references public.assignments(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.student_replies (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  status text not null check (status in ('already_did','did_on_paper','did_at_school','need_at_school',
                                         'needs_code','working_on_it','need_help','other')),
  note text check (note is null or length(note) <= 1000),
  channel text not null check (channel in ('app','email_link')),
  author_user_id uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index on public.student_replies(assignment_id, created_at desc);

-- Notifications ---------------------------------------------------------------
create table public.notification_prefs (
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email_enabled boolean not null default true,
  in_app_enabled boolean not null default true,
  daily_summary boolean not null default true,
  summary_time time not null default '17:30',
  assignment_questions boolean not null default true,
  reminders boolean not null default true,
  reply_recaps boolean not null default true,
  recap_mode text not null default 'partial' check (recap_mode in ('wait_all','partial')),
  recap_max_wait_hours int not null default 24 check (recap_max_wait_hours between 1 and 168),
  followup_delay_value int not null default 48 check (followup_delay_value between 1 and 336),
  followup_delay_unit text not null default 'hours' check (followup_delay_unit in ('hours','school_days')),
  primary key (family_id, user_id)
);

create table public.notification_consents (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  channel text not null check (channel in ('email','in_app','push')),
  consent_text_version text not null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz
);
create index on public.notification_consents(family_id, user_id, channel);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('daily_summary','assignment_question','reminder','followup_nudge','reply_recap','cheer')),
  channel text not null check (channel in ('email','in_app')),
  idempotency_key text not null unique,   -- the core duplicate-send guard
  subject text not null,
  body text not null,
  payload jsonb not null default '{}',
  scheduled_for timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','sending','sent','failed','skipped')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.notifications(status, next_attempt_at);

create table public.delivery_log (
  id bigserial primary key,
  notification_id uuid not null references public.notifications(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  attempt int not null,
  outcome text not null check (outcome in ('sent','failed','skipped')),
  provider_message_id text,
  detail text,
  at timestamptz not null default now()
);

-- Reply links: the nonce in a signed token must exist here and be unrevoked.
create table public.reply_links (
  nonce text primary key,
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  assignment_id uuid not null references public.assignments(id) on delete cascade,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  uses int not null default 0,
  created_at timestamptz not null default now()
);

-- Integrations ---------------------------------------------------------------
create table public.integration_connections (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid references public.children(id) on delete cascade,
  provider text not null check (provider in ('manual','csv','canvas','skyward')),
  status text not null check (status in ('connected','reconnect_needed','error','pending_district','not_configured')),
  display_name text not null,
  base_url text,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  not_refreshed text,          -- plain-English description of what was NOT refreshed on the last failure
  created_at timestamptz not null default now()
);

-- Tokens live in their own table with RLS enabled and NO policies: only server (service role) code can read them.
create table public.integration_secrets (
  connection_id uuid primary key references public.integration_connections(id) on delete cascade,
  family_id uuid not null references public.families(id) on delete cascade,
  ciphertext text not null,   -- AES-256-GCM, key from TOKEN_ENCRYPTION_KEY env var
  expires_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.sync_runs (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  outcome text check (outcome in ('success','auth_failed','partial','error')),
  items_upserted int not null default 0,
  message text
);

create table public.audit_log (
  id bigserial primary key,
  family_id uuid references public.families(id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  entity text not null,
  entity_id text,
  detail jsonb not null default '{}',
  at timestamptz not null default now()
);
create index on public.audit_log(family_id, at desc);
