-- Running course grade as reported by the learning platform (e.g. Canvas "current score"), refreshed on every sync.
alter table public.courses add column if not exists current_score numeric(6,2);
alter table public.courses add column if not exists current_score_at timestamptz;
