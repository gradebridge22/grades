-- Row-level security. Default deny; every table is family-scoped.

create or replace function app.is_member(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.family_members m where m.family_id = fid and m.user_id = auth.uid());
$$;

create or replace function app.is_parent(fid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.family_members m
                 where m.family_id = fid and m.user_id = auth.uid() and m.role in ('parent','guardian'));
$$;

-- Parents see all children in their family; a student sees only their own child record.
create or replace function app.can_view_child(cid uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.children c
    where c.id = cid and (c.user_id = auth.uid() or app.is_parent(c.family_id))
  );
$$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
end $$;

grant usage on schema public, app to authenticated;
grant execute on all functions in schema app to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
revoke all on public.integration_secrets from authenticated, anon;
revoke all on all tables in schema public from anon;

alter table public.families enable row level security;
alter table public.children enable row level security;
alter table public.family_members enable row level security;
alter table public.family_invites enable row level security;
alter table public.school_holidays enable row level security;
alter table public.grading_periods enable row level security;
alter table public.courses enable row level security;
alter table public.grade_records enable row level security;
alter table public.grade_history enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_exclusions enable row level security;
alter table public.assignment_inclusions enable row level security;
alter table public.student_replies enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.notification_consents enable row level security;
alter table public.notifications enable row level security;
alter table public.delivery_log enable row level security;
alter table public.reply_links enable row level security;
alter table public.integration_connections enable row level security;
alter table public.integration_secrets enable row level security; -- no policies: server-only
alter table public.sync_runs enable row level security;
alter table public.audit_log enable row level security;

-- families: created via app.create_family(); members read, parents update.
create policy fam_select on public.families for select to authenticated using (app.is_member(id));
create policy fam_update on public.families for update to authenticated using (app.is_parent(id)) with check (app.is_parent(id));

create policy mem_select on public.family_members for select to authenticated using (app.is_member(family_id));
create policy mem_write on public.family_members for all to authenticated
  using (app.is_parent(family_id)) with check (app.is_parent(family_id));

create policy inv_all on public.family_invites for all to authenticated
  using (app.is_parent(family_id)) with check (app.is_parent(family_id) and created_by = auth.uid());

create policy child_select on public.children for select to authenticated using (app.can_view_child(id));
create policy child_write on public.children for all to authenticated
  using (app.is_parent(family_id)) with check (app.is_parent(family_id));

create policy hol_select on public.school_holidays for select to authenticated using (app.is_member(family_id));
create policy hol_write on public.school_holidays for all to authenticated
  using (app.is_parent(family_id)) with check (app.is_parent(family_id));

-- Child-scoped academic tables: read if you can view the child, write only as parent.
do $$
declare t text;
begin
  foreach t in array array['grading_periods','courses','grade_records','grade_history','assignments'] loop
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (app.can_view_child(child_id))', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (app.is_parent(family_id) and app.can_view_child(child_id))', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (app.is_parent(family_id)) with check (app.is_parent(family_id))', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (app.is_parent(family_id))', t);
  end loop;
end $$;

create policy excl_select on public.assignment_exclusions for select to authenticated using (app.is_member(family_id));
create policy excl_insert on public.assignment_exclusions for insert to authenticated
  with check (app.is_parent(family_id) and created_by = auth.uid()
              and exists (select 1 from public.assignments a where a.id = assignment_id and a.family_id = assignment_exclusions.family_id));
-- No update/delete policy: exclusions are permanent unless a parent uses app.restore_assignment().

create policy incl_select on public.assignment_inclusions for select to authenticated using (app.is_member(family_id));
create policy incl_insert on public.assignment_inclusions for insert to authenticated
  with check (app.is_parent(family_id) and created_by = auth.uid()
              and exists (select 1 from public.assignments a where a.id = assignment_id and a.family_id = assignment_inclusions.family_id));
create policy incl_delete on public.assignment_inclusions for delete to authenticated using (app.is_parent(family_id));

-- Replies are append-only history.
create policy reply_select on public.student_replies for select to authenticated using (app.can_view_child(child_id));
create policy reply_insert on public.student_replies for insert to authenticated
  with check (author_user_id = auth.uid() and app.can_view_child(child_id)
              and exists (select 1 from public.assignments a
                          where a.id = assignment_id and a.child_id = student_replies.child_id
                            and a.family_id = student_replies.family_id));

create policy prefs_select on public.notification_prefs for select to authenticated
  using (user_id = auth.uid() or app.is_parent(family_id));
create policy prefs_write on public.notification_prefs for all to authenticated
  using (user_id = auth.uid() and app.is_member(family_id)) with check (user_id = auth.uid() and app.is_member(family_id));

create policy consent_select on public.notification_consents for select to authenticated
  using (user_id = auth.uid() or app.is_parent(family_id));
create policy consent_write on public.notification_consents for all to authenticated
  using (user_id = auth.uid() and app.is_member(family_id)) with check (user_id = auth.uid() and app.is_member(family_id));

create policy notif_select on public.notifications for select to authenticated
  using (recipient_user_id = auth.uid() or app.is_parent(family_id));
create policy notif_mark_read on public.notifications for update to authenticated
  using (recipient_user_id = auth.uid()) with check (recipient_user_id = auth.uid());

create policy dlog_select on public.delivery_log for select to authenticated using (app.is_parent(family_id));
create policy links_select on public.reply_links for select to authenticated using (app.is_parent(family_id));
create policy links_revoke on public.reply_links for update to authenticated using (app.is_parent(family_id)) with check (app.is_parent(family_id));

create policy conn_select on public.integration_connections for select to authenticated using (app.is_parent(family_id));
create policy conn_write on public.integration_connections for all to authenticated
  using (app.is_parent(family_id)) with check (app.is_parent(family_id));
create policy sync_select on public.sync_runs for select to authenticated using (app.is_parent(family_id));
create policy audit_select on public.audit_log for select to authenticated using (app.is_parent(family_id));
-- audit_log has no insert policy: rows are written by security-definer triggers only.
