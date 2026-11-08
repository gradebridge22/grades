-- The teacher's gradebook category (Canvas "assignment group") and its weight, when the course weights categories.
alter table public.assignments add column if not exists group_name text;
alter table public.assignments add column if not exists group_weight numeric(5,2);
