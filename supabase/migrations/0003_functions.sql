-- Audit triggers, family lifecycle, export/delete, retention.

create or replace function app.audit() returns trigger
language plpgsql security definer set search_path = public as $$
declare j jsonb; fid uuid;
begin
  j := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  fid := case when tg_table_name = 'families' then (j->>'id')::uuid else (j->>'family_id')::uuid end;
  -- During a cascading family delete the family row is already gone; nothing left to audit.
  if tg_op = 'DELETE' and not exists (select 1 from public.families where id = fid) then return old; end if;
  insert into public.audit_log(family_id, actor_user_id, action, entity, entity_id, detail)
  values (fid, auth.uid(), lower(tg_op), tg_table_name,
          coalesce(j->>'assignment_id', case when tg_table_name = 'family_members' then j->>'user_id' end, j->>'id'),
          case when tg_table_name = 'assignment_exclusions' and tg_op = 'INSERT' then jsonb_build_object('reason', j->>'reason')
               when tg_table_name = 'student_replies' then jsonb_build_object('status', j->>'status', 'channel', j->>'channel')
               when tg_table_name = 'integration_connections' then jsonb_build_object('status', j->>'status')
               else '{}'::jsonb end);
  return coalesce(new, old);
end $$;

create trigger audit_children after insert or update or delete on public.children for each row execute function app.audit();
create trigger audit_members after insert or update or delete on public.family_members for each row execute function app.audit();
create trigger audit_excl after insert or delete on public.assignment_exclusions for each row execute function app.audit();
create trigger audit_incl after insert or delete on public.assignment_inclusions for each row execute function app.audit();
create trigger audit_replies after insert on public.student_replies for each row execute function app.audit();
create trigger audit_conn after insert or update or delete on public.integration_connections for each row execute function app.audit();
create trigger audit_families after update on public.families for each row execute function app.audit();

-- Grade history: append whenever a grade value changes (powers trends without inventing data).
create or replace function app.grade_history_trg() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.percent is distinct from old.percent or new.letter is distinct from old.letter then
    insert into public.grade_history(family_id, child_id, grade_record_id, percent, letter, observed_at)
    values (new.family_id, new.child_id, new.id, new.percent, new.letter, new.recorded_at);
  end if;
  return new;
end $$;
create trigger grade_history after insert or update on public.grade_records for each row execute function app.grade_history_trg();

-- Create a family and make the caller its first parent.
create or replace function app.create_family(p_name text, p_timezone text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from pg_timezone_names where name = p_timezone) then raise exception 'invalid timezone'; end if;
  insert into public.families(name, timezone) values (p_name, p_timezone) returning id into fid;
  insert into public.family_members(family_id, user_id, role, display_name)
    values (fid, auth.uid(), 'parent', p_display_name);
  insert into public.notification_prefs(family_id, user_id) values (fid, auth.uid());
  insert into public.audit_log(family_id, actor_user_id, action, entity, entity_id) values (fid, auth.uid(), 'insert', 'families', fid::text);
  return fid;
end $$;

-- Accept an invite: the raw token is hashed and matched; the invite email must match the caller.
create or replace function app.accept_invite(p_token text, p_display_name text)
returns uuid language plpgsql security definer set search_path = public as $$
declare inv public.family_invites; caller_email text;
begin
  select email into caller_email from auth.users where id = auth.uid();
  select * into inv from public.family_invites
   where token_hash = encode(sha256(convert_to(p_token, 'UTF8')), 'hex') and accepted_at is null and expires_at > now();
  if inv.id is null then raise exception 'invite invalid or expired'; end if;
  if lower(inv.email) <> lower(coalesce(caller_email, '')) then raise exception 'invite was sent to a different email'; end if;
  insert into public.family_members(family_id, user_id, role, display_name, email, child_id)
    values (inv.family_id, auth.uid(), inv.role, p_display_name, caller_email, inv.child_id);
  if inv.role = 'student' then update public.children set user_id = auth.uid() where id = inv.child_id; end if;
  insert into public.notification_prefs(family_id, user_id) values (inv.family_id, auth.uid()) on conflict do nothing;
  update public.family_invites set accepted_at = now() where id = inv.id;
  return inv.family_id;
end $$;

-- Undo a permanent dismissal (explicit, audited, parent-only).
create or replace function app.restore_assignment(p_assignment uuid)
returns void language plpgsql security definer set search_path = public as $$
declare fid uuid;
begin
  select family_id into fid from public.assignment_exclusions where assignment_id = p_assignment;
  if fid is null or not app.is_parent(fid) then raise exception 'not allowed'; end if;
  delete from public.assignment_exclusions where assignment_id = p_assignment;
end $$;

-- Full family export as JSON (parent-only). Secrets are never exported.
create or replace function app.export_family(p_family uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare result jsonb;
begin
  if not app.is_parent(p_family) then raise exception 'not allowed'; end if;
  select jsonb_build_object(
    'exported_at', now(),
    'family', (select to_jsonb(f) from public.families f where f.id = p_family),
    'members', (select coalesce(jsonb_agg(to_jsonb(m)), '[]') from public.family_members m where m.family_id = p_family),
    'children', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from public.children c where c.family_id = p_family),
    'grading_periods', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.grading_periods x where x.family_id = p_family),
    'courses', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.courses x where x.family_id = p_family),
    'grade_records', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.grade_records x where x.family_id = p_family),
    'grade_history', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.grade_history x where x.family_id = p_family),
    'assignments', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.assignments x where x.family_id = p_family),
    'exclusions', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.assignment_exclusions x where x.family_id = p_family),
    'replies', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.student_replies x where x.family_id = p_family),
    'notifications', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.notifications x where x.family_id = p_family),
    'connections', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.integration_connections x where x.family_id = p_family),
    'audit_log', (select coalesce(jsonb_agg(to_jsonb(x)), '[]') from public.audit_log x where x.family_id = p_family)
  ) into result;
  insert into public.audit_log(family_id, actor_user_id, action, entity, entity_id) values (p_family, auth.uid(), 'export', 'families', p_family::text);
  return result;
end $$;

-- Permanently delete a family and everything it owns (cascades), parent-only.
create or replace function app.delete_family(p_family uuid, p_confirm_name text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not app.is_parent(p_family) then raise exception 'not allowed'; end if;
  if not exists (select 1 from public.families where id = p_family and name = p_confirm_name) then
    raise exception 'confirmation name does not match';
  end if;
  delete from public.families where id = p_family;
end $$;

-- Retention job (run by cron with the service role).
create or replace function app.apply_retention() returns void language sql security definer set search_path = public as $$
  delete from public.student_replies r using public.families f
   where r.family_id = f.id and r.created_at < now() - make_interval(days => f.retention_replies_days);
  delete from public.notifications n using public.families f
   where n.family_id = f.id and n.created_at < now() - make_interval(days => f.retention_notifications_days);
  delete from public.reply_links where expires_at < now() - interval '30 days';
$$;

grant execute on all functions in schema app to authenticated;
revoke execute on function app.apply_retention() from public, authenticated;
