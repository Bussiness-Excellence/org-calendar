-- =====================================================================
--  Organizational Calendar - production database (many companies)
--
--  Every company ("organization") lives in the same database, walled off
--  from every other company by four independent layers:
--
--   1. Every row carries org_id. The database stamps it from the signed-in
--      person's own profile; the app can never choose or change it.
--   2. Row level security: every rule starts with org_id = my_org(), so a
--      query can only ever see or touch the caller's own company.
--   3. Composite foreign keys (org_id, id): a person, team or event can
--      only reference records of the same company, even if code has a bug.
--   4. People are only created server-side (calendar-admin function),
--      always inside the creating admin's own company.
--
--  Safe to run on an empty Supabase project. Run once.
-- =====================================================================

-- ---------- Tables ----------------------------------------------------

create table public.organizations (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (length(btrim(name)) between 1 and 120),
  logo_url         text,
  plan             text not null default 'free' check (plan in ('free', 'pro')),
  plan_expires_at  date,
  user_limit       integer not null default 10 check (user_limit > 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  color       text not null default '#0B4D89',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (org_id, id),
  unique (org_id, name)
);
create index groups_org_idx on public.groups (org_id, sort_order);

create table public.user_profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  org_id                uuid not null references public.organizations (id) on delete cascade,
  email                 text not null unique,
  full_name             text not null check (length(btrim(full_name)) between 1 and 120),
  initials              text,
  title                 text,
  group_id              uuid,
  role                  text not null default 'user'
                          check (role in ('super_admin', 'group_admin', 'user')),
  is_active             boolean not null default true,
  must_change_password  boolean not null default true,
  created_by            uuid,
  created_at            timestamptz not null default now(),
  unique (org_id, id),
  foreign key (org_id, group_id) references public.groups (org_id, id)
    on delete set null (group_id)
);
create index user_profiles_org_idx on public.user_profiles (org_id);

create table public.assignments (
  id              uuid primary key default gen_random_uuid(),
  org_id          uuid not null references public.organizations (id) on delete cascade,
  title           text not null check (length(btrim(title)) between 1 and 200),
  date            date not null,
  time_start      text check (time_start ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  time_end        text check (time_end ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  notes           text check (length(notes) <= 4000),
  group_id        uuid not null,
  visibility      text not null default 'private'
                    check (visibility in ('private', 'group', 'company')),
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected')),
  rejection_note  text check (length(rejection_note) <= 1000),
  color           text,
  created_by      uuid not null,
  assigned_to     uuid,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  foreign key (org_id, group_id)    references public.groups (org_id, id),
  foreign key (org_id, created_by)  references public.user_profiles (org_id, id) on delete cascade,
  foreign key (org_id, assigned_to) references public.user_profiles (org_id, id)
    on delete set null (assigned_to),
  check (time_start is null or time_end is null or time_end > time_start)
);
create index assignments_org_date_idx   on public.assignments (org_id, date);
create index assignments_org_group_idx  on public.assignments (org_id, group_id, date);
create index assignments_created_by_idx on public.assignments (created_by);
create index assignments_assigned_idx   on public.assignments (assigned_to);

-- The app owner (you). Can list companies and change their plan, nothing else.
create table public.platform_admins (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- ---------- Who is calling? ------------------------------------------

create function public.my_org()
returns uuid language sql stable security definer set search_path = public as $$
  select org_id from public.user_profiles where id = auth.uid() and is_active
$$;

create function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.user_profiles where id = auth.uid() and is_active
$$;

create function public.my_group()
returns uuid language sql stable security definer set search_path = public as $$
  select group_id from public.user_profiles where id = auth.uid() and is_active
$$;

create function public.is_super()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'super_admin' from public.user_profiles
                   where id = auth.uid() and is_active), false)
$$;

create function public.is_platform_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;

-- Pro features (approvals, more than 10 people) while the plan is current.
create function public.org_is_pro(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select plan = 'pro' and (plan_expires_at is null or plan_expires_at >= current_date)
                   from public.organizations where id = p_org), false)
$$;

-- Everything the app shows about the caller's own company.
create function public.my_org_summary()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', o.id, 'name', o.name, 'logo_url', o.logo_url,
    'plan', o.plan, 'pro_active', public.org_is_pro(o.id),
    'plan_expires_at', o.plan_expires_at, 'user_limit', o.user_limit,
    'active_users', (select count(*) from public.user_profiles p
                      where p.org_id = o.id and p.is_active),
    'is_platform_admin', public.is_platform_admin())
  from public.organizations o
  where o.id = public.my_org()
$$;

-- ---------- Guards ----------------------------------------------------

create function public.touch_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;

-- Layer 1: the company is always taken from the caller, never from input,
-- and can never be changed afterwards.
create function public.stamp_org()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    new.org_id := old.org_id;
    return new;
  end if;
  if auth.uid() is not null then
    new.org_id := public.my_org();
    if new.org_id is null then
      raise exception 'Your account is not part of an organization.' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

-- People cannot promote themselves, move teams or change company.
create function public.guard_profile()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.org_id := old.org_id;
  if auth.uid() is not null then
    new.id         := old.id;
    new.role       := old.role;
    new.group_id   := old.group_id;
    new.is_active  := old.is_active;
    new.email      := old.email;
    new.created_by := old.created_by;
  end if;
  return new;
end $$;

-- Free plan: at most user_limit active people per company.
create function public.enforce_user_limit()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_limit integer; v_active integer;
begin
  if not new.is_active then return new; end if;
  if tg_op = 'UPDATE' and old.is_active then return new; end if;
  if public.org_is_pro(new.org_id) then return new; end if;
  -- serialize concurrent additions for the same company
  perform 1 from public.organizations where id = new.org_id for update;
  select user_limit into v_limit from public.organizations where id = new.org_id;
  select count(*) into v_active from public.user_profiles
   where org_id = new.org_id and is_active and id <> new.id;
  if v_active >= coalesce(v_limit, 10) then
    raise exception 'USER_LIMIT: The free plan includes up to % people.', coalesce(v_limit, 10)
      using errcode = 'P0001';
  end if;
  return new;
end $$;

-- Approvals. Free plan: every event is published straight away.
-- Pro: a member's new or edited event waits for the team manager.
-- Nobody but a manager can approve, and never their own team's events
-- from another team.
create function public.guard_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_manager boolean;
begin
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if auth.uid() is null then return new; end if;

  if not public.org_is_pro(new.org_id) then
    new.status := 'approved';
    new.rejection_note := null;
    return new;
  end if;

  v_manager := public.is_super()
    or (public.my_role() = 'group_admin' and new.group_id = public.my_group()
        and (tg_op = 'INSERT' or old.group_id = public.my_group()));

  if not v_manager then
    new.status := 'pending';
    new.rejection_note := null;
  elsif tg_op = 'INSERT' then
    new.status := 'approved';
    new.rejection_note := null;
  elsif new.status = 'approved' then
    new.rejection_note := null;
  end if;
  return new;
end $$;

-- Postgres fires triggers in name order: the numbers keep the company
-- stamp first, so every later check sees the right org_id.
create trigger t10_stamp_org before insert or update on public.groups
  for each row execute function public.stamp_org();

create trigger t10_stamp_org before insert or update on public.assignments
  for each row execute function public.stamp_org();
create trigger t20_guard_assignment before insert or update on public.assignments
  for each row execute function public.guard_assignment();
create trigger t30_touch before update on public.assignments
  for each row execute function public.touch_updated_at();

create trigger t10_guard_profile before update on public.user_profiles
  for each row execute function public.guard_profile();
create trigger t20_user_limit before insert or update of is_active on public.user_profiles
  for each row execute function public.enforce_user_limit();

create trigger organizations_touch before update on public.organizations
  for each row execute function public.touch_updated_at();

-- ---------- Row level security (layer 2) -----------------------------

alter table public.organizations   enable row level security;
alter table public.groups          enable row level security;
alter table public.user_profiles   enable row level security;
alter table public.assignments     enable row level security;
alter table public.platform_admins enable row level security;

-- organizations: read your own; all changes go through the server function.
create policy org_select on public.organizations for select to authenticated
  using (id = (select public.my_org()));

-- teams
create policy groups_select on public.groups for select to authenticated
  using (org_id = (select public.my_org()));
create policy groups_insert on public.groups for insert to authenticated
  with check (org_id = (select public.my_org()) and (select public.is_super()));
create policy groups_update on public.groups for update to authenticated
  using (org_id = (select public.my_org()) and (select public.is_super()))
  with check (org_id = (select public.my_org()));
create policy groups_delete on public.groups for delete to authenticated
  using (org_id = (select public.my_org()) and (select public.is_super()));

-- people: everyone sees colleagues in their own company and can edit their
-- own name/title. Creating, roles, teams and access go through the server.
create policy profiles_select on public.user_profiles for select to authenticated
  using (org_id = (select public.my_org()));
create policy profiles_update_own on public.user_profiles for update to authenticated
  using (id = auth.uid() and org_id = (select public.my_org()))
  with check (id = auth.uid());

-- events
create policy assignments_select on public.assignments for select to authenticated
  using (
    org_id = (select public.my_org())
    and (
      (select public.is_super())
      or created_by = auth.uid()
      or assigned_to = auth.uid()
      or ((select public.my_role()) = 'group_admin' and group_id = (select public.my_group()))
      or (status = 'approved' and visibility = 'company')
      or (status = 'approved' and visibility = 'group' and group_id = (select public.my_group()))
    )
  );
create policy assignments_insert on public.assignments for insert to authenticated
  with check (
    org_id = (select public.my_org())
    and created_by = auth.uid()
    and ((select public.is_super()) or group_id = (select public.my_group()))
  );
create policy assignments_update on public.assignments for update to authenticated
  using (
    org_id = (select public.my_org())
    and (created_by = auth.uid()
         or (select public.is_super())
         or ((select public.my_role()) = 'group_admin' and group_id = (select public.my_group())))
  )
  with check (
    org_id = (select public.my_org())
    and ((select public.is_super()) or group_id = (select public.my_group()))
  );
create policy assignments_delete on public.assignments for delete to authenticated
  using (
    org_id = (select public.my_org())
    and (created_by = auth.uid()
         or (select public.is_super())
         or ((select public.my_role()) = 'group_admin' and group_id = (select public.my_group())))
  );

-- platform_admins: no policies -> not readable through the API at all.

-- ---------- Permissions ----------------------------------------------

revoke all on all tables in schema public from anon;
revoke all on public.platform_admins from authenticated;
revoke insert, delete on public.user_profiles from authenticated;
revoke insert, update, delete on public.organizations from authenticated;

revoke execute on all functions in schema public from public, anon;
revoke execute on function public.touch_updated_at(), public.stamp_org(), public.guard_profile(),
  public.enforce_user_limit(), public.guard_assignment() from authenticated;
-- These are needed by the security rules and only ever describe the caller.
grant execute on function public.my_org(), public.my_role(), public.my_group(), public.is_super(),
  public.is_platform_admin(), public.my_org_summary() to authenticated;
revoke execute on function public.org_is_pro(uuid) from authenticated;

-- ---------- Logos ----------------------------------------------------
-- Public read; written only by the server function, at <org_id>/logo-*.ext

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('branding', 'branding', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- ---------- Live updates (delivered through the same rules) -----------

alter publication supabase_realtime add table public.assignments;
alter publication supabase_realtime add table public.user_profiles;
alter publication supabase_realtime add table public.groups;
