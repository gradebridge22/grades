-- Browser-extension sync: the parent signs in to Canvas / Skyward in THEIR OWN browser;
-- the extension reads pages they can already see and posts the data here.
-- No school password ever reaches GradeBridge.

create table public.extension_pairing_codes (
  code_hash text primary key,                 -- sha256 of an 8-char one-time code
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  provider text not null check (provider in ('canvas','skyward')),
  created_by uuid not null references auth.users(id),
  expires_at timestamptz not null,
  used_at timestamptz
);

create table public.extension_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,            -- sha256 of the bearer token kept in the extension
  family_id uuid not null references public.families(id) on delete cascade,
  child_id uuid not null references public.children(id) on delete cascade,
  connection_id uuid not null references public.integration_connections(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  label text not null default 'Browser extension',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table public.extension_pairing_codes enable row level security;
alter table public.extension_tokens enable row level security;
grant select, insert, update, delete on public.extension_pairing_codes, public.extension_tokens to authenticated;

create policy pair_parent on public.extension_pairing_codes for all to authenticated
  using (app.is_parent(family_id)) with check (app.is_parent(family_id) and created_by = auth.uid() and app.can_view_child(child_id));
-- Parents can see and revoke tokens; they never see the token itself (only a hash is stored).
create policy ext_select on public.extension_tokens for select to authenticated using (app.is_parent(family_id));
create policy ext_revoke on public.extension_tokens for update to authenticated using (app.is_parent(family_id)) with check (app.is_parent(family_id));

create trigger audit_ext_tokens after insert or update on public.extension_tokens for each row execute function app.audit();
