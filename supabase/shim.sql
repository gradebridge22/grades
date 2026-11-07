-- Minimal stand-in for Supabase's auth schema. Used ONLY by tests and local demo mode (PGlite).
-- Never run this against a real Supabase project: Supabase already provides these objects.
create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  email text unique,
  created_at timestamptz not null default now()
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;
