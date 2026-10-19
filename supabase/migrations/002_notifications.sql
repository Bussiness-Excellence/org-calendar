-- =====================================================================
--  Notifications: written by the database itself whenever something
--  happens to an event, delivered to one person, inside one company.
--
--  kinds:
--    assigned       an event was assigned to you
--    review_needed  a member's event waits for your approval (Pro)
--    approved       your event was approved (Pro)
--    sent_back      your event was sent back with a note (Pro)
--    shared         a new event was published for your team / everyone
--
--  The app renders the text in the reader's own language from `kind`,
--  so nothing language-specific is stored here.
-- =====================================================================

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizations (id) on delete cascade,
  user_id     uuid not null,
  kind        text not null check (kind in ('assigned', 'review_needed', 'approved', 'sent_back', 'shared')),
  event_id    uuid references public.assignments (id) on delete cascade,
  event_title text not null,
  event_date  date,
  actor_id    uuid,
  note        text,
  created_at  timestamptz not null default now(),
  read_at     timestamptz,
  -- a notification can only ever belong to a person of the same company
  foreign key (org_id, user_id) references public.user_profiles (org_id, id) on delete cascade
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_event_idx on public.notifications (event_id);

-- Fan-out: who hears about what.
create function public.notify_on_assignment()
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

  -- newly published shared events: the team, or the whole company
  if v_became_approved and new.visibility in ('group', 'company') then
    insert into public.notifications (org_id, user_id, kind, event_id, event_title, event_date, actor_id)
    select new.org_id, p.id, 'shared', new.id, new.title, new.date, v_actor
      from public.user_profiles p
     where p.org_id = new.org_id and p.is_active
       and p.id <> v_actor and p.id <> new.created_by
       and p.id is distinct from new.assigned_to
       and (new.visibility = 'company' or p.group_id = new.group_id);
  end if;
  return null;
end $$;

create trigger t90_notify after insert or update on public.assignments
  for each row execute function public.notify_on_assignment();

-- People can only mark their own notifications read; nothing else changes.
create function public.guard_notification()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new := old;
    new.read_at := coalesce(old.read_at, now());
  end if;
  return new;
end $$;
create trigger t10_guard_notification before update on public.notifications
  for each row execute function public.guard_notification();

alter table public.notifications enable row level security;

create policy notifications_select on public.notifications for select to authenticated
  using (user_id = auth.uid() and org_id = (select public.my_org()));
create policy notifications_update on public.notifications for update to authenticated
  using (user_id = auth.uid() and org_id = (select public.my_org()))
  with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete to authenticated
  using (user_id = auth.uid() and org_id = (select public.my_org()));

revoke all on public.notifications from anon;
revoke insert on public.notifications from authenticated;
revoke execute on function public.notify_on_assignment(), public.guard_notification() from public, anon, authenticated;

alter publication supabase_realtime add table public.notifications;
