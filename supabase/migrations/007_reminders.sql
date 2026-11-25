-- =====================================================================
--  My reminders: private reminders each person sets for themselves
--  ("Monday 10:00 – unsubscribe from the Google Play service").
--
--  * Only the owner can see or change their reminders.
--  * Every minute a pg_cron job turns due reminders into a 'reminder'
--    notification (bell, live update, web push, phone).
--  * Changing the time of a reminder makes it notify again.
-- =====================================================================

create extension if not exists pg_cron;

-- Nobody signed in may TRUNCATE (it would skip the row rules).
revoke truncate on all tables in schema public from anon, authenticated;

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null default auth.uid(),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  notes text check (notes is null or char_length(notes) <= 2000),
  remind_at timestamptz not null,
  done_at timestamptz,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint reminders_owner_fkey foreign key (org_id, user_id)
    references public.user_profiles (org_id, id) on delete cascade
);
create index if not exists reminders_due_idx on public.reminders (remind_at)
  where notified_at is null and done_at is null;
create index if not exists reminders_user_idx on public.reminders (user_id, remind_at);

-- Owner and org come from the signed-in person; the notification state is the server's.
create or replace function public.guard_reminder()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.user_id := auth.uid();
      new.org_id := public.my_org();
      new.notified_at := null;
      new.created_at := now();
    end if;
  else
    new.id := old.id;
    new.user_id := old.user_id;
    new.org_id := old.org_id;
    new.created_at := old.created_at;
    if new.remind_at is distinct from old.remind_at then
      new.notified_at := null;
    elsif auth.uid() is not null then
      new.notified_at := old.notified_at;
    end if;
  end if;
  if new.org_id is null then
    raise exception 'Your account is not part of an organization.' using errcode = '42501';
  end if;
  return new;
end $$;
revoke execute on function public.guard_reminder() from public, anon, authenticated;

create trigger t10_guard_reminder before insert or update on public.reminders
  for each row execute function public.guard_reminder();

alter table public.reminders enable row level security;

create policy reminders_select on public.reminders for select to authenticated
  using (user_id = (select auth.uid()) and org_id = (select public.my_org()));
create policy reminders_insert on public.reminders for insert to authenticated
  with check (user_id = (select auth.uid()) and org_id = (select public.my_org()));
create policy reminders_update on public.reminders for update to authenticated
  using (user_id = (select auth.uid()) and org_id = (select public.my_org()))
  with check (user_id = (select auth.uid()));
create policy reminders_delete on public.reminders for delete to authenticated
  using (user_id = (select auth.uid()) and org_id = (select public.my_org()));

revoke all on public.reminders from anon;
grant select, insert, update, delete on public.reminders to authenticated;
revoke truncate on public.reminders from authenticated;

-- Phones pick up reminders added on the web straight away.
alter publication supabase_realtime add table public.reminders;

-- ---------- 'reminder' notifications ------------------------------------
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check
  check (kind in ('assigned', 'review_needed', 'approved', 'sent_back', 'shared', 'reminder'));
alter table public.notifications add column if not exists reminder_id uuid
  references public.reminders (id) on delete cascade;

-- Due reminders become notifications (run every minute by pg_cron).
create or replace function public.fire_due_reminders()
returns integer language plpgsql security definer set search_path = public as $$
declare v_count integer;
begin
  with due as (
    update public.reminders r
       set notified_at = now()
     where r.notified_at is null and r.done_at is null and r.remind_at <= now() + interval '20 seconds'
       and exists (select 1 from public.user_profiles p where p.id = r.user_id and p.is_active)
    returning r.id, r.org_id, r.user_id, r.title, r.notes, r.remind_at
  )
  insert into public.notifications (org_id, user_id, kind, event_title, note, reminder_id)
  select org_id, user_id, 'reminder', title, notes, id from due;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.fire_due_reminders() from public, anon, authenticated;

select cron.schedule('fire-due-reminders', '* * * * *', 'select public.fire_due_reminders()');
