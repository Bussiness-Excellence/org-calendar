-- =====================================================================
--  Departments and sub-groups (additive change: nothing is dropped).
--
--  groups.parent_id is null   -> a department
--  groups.parent_id is set    -> a sub-group of that department
--  Only two levels: a sub-group sits directly under a department.
--
--  People belong to a department or to one of its sub-groups
--  (user_profiles.group_id). A 'group_admin' whose group is a department
--  is that department's manager and manages all its sub-groups; a
--  'group_admin' of a sub-group manages that sub-group only.
--
--  Team visibility ('group') reaches coalesce(shared_group_id, group_id):
--    a sub-group  -> its members (and the managers above it)
--    a department -> everyone in the department, sub-groups included
--  so the app offers: Only me / My sub-group / My department /
--  Specific department or sub-group / Everyone.
-- =====================================================================

alter table public.groups add column if not exists parent_id uuid;

alter table public.groups
  add constraint groups_parent_fkey
  foreign key (org_id, parent_id) references public.groups (org_id, id)
  on delete cascade;

create index if not exists groups_org_parent_idx on public.groups (org_id, parent_id);

-- Two levels only.
create or replace function public.guard_group_parent()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.parent_id is not null then
    if new.parent_id = new.id then
      raise exception 'GROUP_PARENT: A department cannot sit inside itself.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.groups where id = new.parent_id and parent_id is not null) then
      raise exception 'GROUP_PARENT: A sub-group can only sit directly under a department.' using errcode = 'P0001';
    end if;
    if exists (select 1 from public.groups where parent_id = new.id) then
      raise exception 'GROUP_PARENT: A department that has sub-groups cannot become a sub-group.' using errcode = 'P0001';
    end if;
  end if;
  return new;
end $$;
revoke execute on function public.guard_group_parent() from public, anon, authenticated;

-- runs after t10_stamp_org
create trigger t20_group_parent before insert or update of parent_id on public.groups
  for each row execute function public.guard_group_parent();

-- The department a team belongs to (itself for a department).
create or replace function public.dept_of(gid uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(parent_id, id) from public.groups where id = gid
$$;

-- The signed-in person's department.
create or replace function public.my_dept()
returns uuid language sql stable security definer set search_path = public as $$
  select public.dept_of(public.my_group())
$$;

-- Does the signed-in manager manage this team? (its own team, or a
-- sub-group of the department they manage)
create or replace function public.manages_group(gid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.my_role() = 'group_admin' and gid is not null
    and (gid = public.my_group()
         or (select parent_id from public.groups where id = gid) = public.my_group()),
    false)
$$;

revoke execute on function public.dept_of(uuid), public.my_dept(), public.manages_group(uuid) from public, anon;
grant execute on function public.dept_of(uuid), public.my_dept(), public.manages_group(uuid) to authenticated;

-- ---------- who sees and changes events -------------------------------
alter policy assignments_select on public.assignments
  using (org_id = (select public.my_org()) and (
    (select public.is_super())
    or created_by = (select auth.uid())
    or assigned_to = (select auth.uid())
    or public.manages_group(group_id)
    or (status = 'approved' and visibility = 'company')
    or (status = 'approved' and visibility = 'group' and (
          coalesce(shared_group_id, group_id) = (select public.my_group())
          or coalesce(shared_group_id, group_id) = (select public.my_dept())
          or public.manages_group(coalesce(shared_group_id, group_id))))));

alter policy assignments_insert on public.assignments
  with check (org_id = (select public.my_org()) and created_by = (select auth.uid())
    and ((select public.is_super()) or group_id = (select public.my_group()) or public.manages_group(group_id)));

alter policy assignments_update on public.assignments
  using (org_id = (select public.my_org()) and (
    created_by = (select auth.uid()) or (select public.is_super()) or public.manages_group(group_id)))
  with check (org_id = (select public.my_org())
    and ((select public.is_super()) or group_id = (select public.my_group()) or public.manages_group(group_id)));

alter policy assignments_delete on public.assignments
  using (org_id = (select public.my_org()) and (
    created_by = (select auth.uid()) or (select public.is_super()) or public.manages_group(group_id)));

-- ---------- approvals (Pro): department managers approve their sub-groups
create or replace function public.guard_assignment()
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
    or (public.manages_group(new.group_id)
        and (tg_op = 'INSERT' or public.manages_group(old.group_id)));

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

-- ---------- notifications: department-aware ---------------------------
create or replace function public.notify_on_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.created_by);
  v_target uuid := coalesce(new.shared_group_id, new.group_id);
  v_became_pending  boolean := new.status = 'pending'  and (tg_op = 'INSERT' or old.status is distinct from 'pending');
  v_became_approved boolean := new.status = 'approved' and (tg_op = 'INSERT' or old.status is distinct from 'approved');
  v_became_rejected boolean := new.status = 'rejected' and tg_op = 'UPDATE' and old.status is distinct from 'rejected';
begin
  -- assigned to someone new
  if new.assigned_to is not null and new.assigned_to <> v_actor
     and (tg_op = 'INSERT' or old.assigned_to is distinct from new.assigned_to) then
    insert into public.notifications (org_id, user_id, kind, event_id, event_title, event_date, actor_id)
    values (new.org_id, new.assigned_to, 'assigned', new.id, new.title, new.date, v_actor);
  end if;

  -- waiting for approval: the team's manager, its department's manager, the super admins
  if v_became_pending then
    insert into public.notifications (org_id, user_id, kind, event_id, event_title, event_date, actor_id)
    select new.org_id, p.id, 'review_needed', new.id, new.title, new.date, v_actor
      from public.user_profiles p
     where p.org_id = new.org_id and p.is_active and p.id <> v_actor
       and (p.role = 'super_admin'
            or (p.role = 'group_admin'
                and (p.group_id = new.group_id or p.group_id = public.dept_of(new.group_id))));
  end if;

  -- the creator hears the decision
  if tg_op = 'UPDATE' and new.created_by <> v_actor and (v_became_approved or v_became_rejected)
     and old.status = 'pending' then
    insert into public.notifications (org_id, user_id, kind, event_id, event_title, event_date, actor_id, note)
    values (new.org_id, new.created_by, case when v_became_approved then 'approved' else 'sent_back' end,
            new.id, new.title, new.date, v_actor, case when v_became_rejected then new.rejection_note end);
  end if;

  -- newly published shared events: a sub-group, a whole department, or everyone
  if v_became_approved and new.visibility in ('group', 'company') then
    insert into public.notifications (org_id, user_id, kind, event_id, event_title, event_date, actor_id)
    select new.org_id, p.id, 'shared', new.id, new.title, new.date, v_actor
      from public.user_profiles p
     where p.org_id = new.org_id and p.is_active
       and p.id <> v_actor and p.id <> new.created_by
       and p.id is distinct from new.assigned_to
       and (new.visibility = 'company' or p.group_id = v_target or public.dept_of(p.group_id) = v_target);
  end if;
  return null;
end $$;
