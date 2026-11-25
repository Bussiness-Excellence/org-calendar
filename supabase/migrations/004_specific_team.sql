-- =====================================================================
--  "Specific team" visibility.
--
--  An event keeps its owner team in group_id (who manages and approves
--  it). With visibility = 'team' it is also shown to the members of one
--  chosen team, stored in shared_group_id.
--
--  Visibility options in the app:
--    private  Only me
--    group    My team          (the event's own team)
--    team     Specific team    (shared_group_id)
--    company  Everyone
-- =====================================================================

alter table public.assignments add column shared_group_id uuid;

-- The chosen team must belong to the same company.
alter table public.assignments
  add constraint assignments_shared_group_fkey
  foreign key (org_id, shared_group_id) references public.groups (org_id, id)
  on delete set null (shared_group_id);

alter table public.assignments drop constraint assignments_visibility_check;
alter table public.assignments add constraint assignments_visibility_check
  check (visibility in ('private', 'group', 'team', 'company'));

create index if not exists assignments_org_shared_group_idx
  on public.assignments (org_id, shared_group_id, date);

-- Keep shared_group_id consistent with the visibility choice.
-- When the chosen team is deleted, the database clears shared_group_id;
-- the event then falls back to "Only me" instead of blocking the delete.
create function public.normalize_shared_team()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.visibility = 'team' then
    if new.shared_group_id is null then
      if tg_op = 'UPDATE' and old.shared_group_id is not null then
        new.visibility := 'private';
      else
        raise exception 'SHARED_TEAM: Choose the team to share this event with.'
          using errcode = 'P0001';
      end if;
    end if;
  else
    new.shared_group_id := null;
  end if;
  return new;
end $$;
revoke execute on function public.normalize_shared_team() from public, anon, authenticated;

-- runs after t10_stamp_org (so org_id is set) and before the approval guard
create trigger t15_shared_team before insert or update on public.assignments
  for each row execute function public.normalize_shared_team();

-- Who can see an event: as before, plus members of the chosen team.
alter policy assignments_select on public.assignments
  using (org_id = (select public.my_org()) and (
    (select public.is_super())
    or created_by = (select auth.uid())
    or assigned_to = (select auth.uid())
    or ((select public.my_role()) = 'group_admin' and group_id = (select public.my_group()))
    or (status = 'approved' and visibility = 'company')
    or (status = 'approved' and visibility = 'group' and group_id = (select public.my_group()))
    or (status = 'approved' and visibility = 'team' and shared_group_id = (select public.my_group()))));

-- Notifications: a newly published "specific team" event notifies that team.
create or replace function public.notify_on_assignment()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_actor uuid := coalesce(auth.uid(), new.created_by);
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

  -- waiting for approval: the team's manager and the super admins
  if v_became_pending then
    insert into public.notifications (org_id, user_id, kind, event_id, event_title, event_date, actor_id)
    select new.org_id, p.id, 'review_needed', new.id, new.title, new.date, v_actor
      from public.user_profiles p
     where p.org_id = new.org_id and p.is_active and p.id <> v_actor
       and (p.role = 'super_admin' or (p.role = 'group_admin' and p.group_id = new.group_id));
  end if;

  -- the creator hears the decision
  if tg_op = 'UPDATE' and new.created_by <> v_actor and (v_became_approved or v_became_rejected)
     and old.status = 'pending' then
    insert into public.notifications (org_id, user_id, kind, event_id, event_title, event_date, actor_id, note)
    values (new.org_id, new.created_by, case when v_became_approved then 'approved' else 'sent_back' end,
            new.id, new.title, new.date, v_actor, case when v_became_rejected then new.rejection_note end);
  end if;

  -- newly published shared events: the own team, a chosen team, or the whole company
  if v_became_approved and new.visibility in ('group', 'team', 'company') then
    insert into public.notifications (org_id, user_id, kind, event_id, event_title, event_date, actor_id)
    select new.org_id, p.id, 'shared', new.id, new.title, new.date, v_actor
      from public.user_profiles p
     where p.org_id = new.org_id and p.is_active
       and p.id <> v_actor and p.id <> new.created_by
       and p.id is distinct from new.assigned_to
       and (new.visibility = 'company'
            or (new.visibility = 'group' and p.group_id = new.group_id)
            or (new.visibility = 'team' and p.group_id = new.shared_group_id));
  end if;
  return null;
end $$;
