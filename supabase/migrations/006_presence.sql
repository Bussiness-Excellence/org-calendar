-- =====================================================================
--  Presence: "Online now" / "Last seen …" for each person.
--
--  Kept in its own table so the frequent heartbeats do not touch
--  user_profiles (whose changes drive the app's live updates).
--  The app calls touch_presence() about once a minute while it is open;
--  someone seen in the last ~2.5 minutes counts as online.
--  The table is not part of the realtime publication.
-- =====================================================================

create table if not exists public.user_presence (
  user_id uuid primary key,
  org_id uuid not null,
  last_seen_at timestamptz not null default now(),
  constraint user_presence_profile_fkey foreign key (org_id, user_id)
    references public.user_profiles (org_id, id) on delete cascade on update cascade
);

create index if not exists user_presence_org_idx on public.user_presence (org_id);

alter table public.user_presence enable row level security;

-- Everyone sees the presence of people in their own organization.
create policy user_presence_select on public.user_presence
  for select to authenticated
  using (org_id = (select public.my_org()));

-- Writes only through touch_presence().
revoke insert, update, delete, truncate on public.user_presence from anon, authenticated;
revoke all on public.user_presence from anon;
grant select on public.user_presence to authenticated;

create or replace function public.touch_presence()
returns timestamptz language sql volatile security definer set search_path = public as $$
  insert into public.user_presence (user_id, org_id, last_seen_at)
  select p.id, p.org_id, now() from public.user_profiles p
   where p.id = auth.uid() and p.is_active
  on conflict (user_id) do update
    set last_seen_at = excluded.last_seen_at, org_id = excluded.org_id
  returning last_seen_at
$$;
revoke execute on function public.touch_presence() from public, anon;
grant execute on function public.touch_presence() to authenticated;

-- Start from each person's last sign-in.
insert into public.user_presence (user_id, org_id, last_seen_at)
select p.id, p.org_id, u.last_sign_in_at
  from public.user_profiles p join auth.users u on u.id = p.id
 where u.last_sign_in_at is not null
on conflict (user_id) do nothing;
