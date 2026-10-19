-- Notification fan-out and privacy tests. Uses the same fixtures as isolation.sql
-- (run that file's fixture block first; runtests loads both in one session).
\set ON_ERROR_STOP 1
set client_min_messages = notice;

-- 1. Free plan (A): assigning an event to a member notifies only them.
begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002');   -- A manager
insert into public.assignments (title, date, group_id, created_by, assigned_to, visibility)
values ('Assigned task', current_date, 'a1000000-0000-0000-0000-000000000000', auth.uid(),
        'a0000000-0000-0000-0000-000000000003', 'private');
reset role;
select pg_temp.expect((select count(*) from public.notifications where kind = 'assigned'
                        and user_id = 'a0000000-0000-0000-0000-000000000003' and event_title = 'Assigned task') = 1,
  'assignee is notified');
select pg_temp.expect((select count(*) from public.notifications where event_title = 'Assigned task') = 1,
  'nobody else is notified about a private assigned event');
rollback;

-- 2. Company-wide event notifies everyone active in THAT company only.
begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');   -- A super admin
insert into public.assignments (title, date, group_id, created_by, visibility)
values ('All hands', current_date, 'a1000000-0000-0000-0000-000000000000', auth.uid(), 'company');
reset role;
select pg_temp.expect((select count(*) from public.notifications where event_title = 'All hands') = 2,
  'company event notifies the other two people in A');
select pg_temp.expect((select count(*) from public.notifications n join public.user_profiles p on p.id = n.user_id
                        where n.event_title = 'All hands' and p.org_id <> 'aaaaaaaa-0000-0000-0000-000000000000') = 0,
  'nobody in company B hears about A''s event');
rollback;

-- 3. Pro plan (B): review flow.
begin;
select pg_temp.act_as('b0000000-0000-0000-0000-000000000003');   -- B member
insert into public.assignments (title, date, group_id, created_by, visibility)
values ('Needs approval', current_date, 'b1000000-0000-0000-0000-000000000000', auth.uid(), 'group');
reset role;
select pg_temp.expect((select count(*) from public.notifications where kind = 'review_needed' and event_title = 'Needs approval') = 2,
  'pro: the team manager and the super admin are asked to review');
select pg_temp.act_as('b0000000-0000-0000-0000-000000000002');   -- B manager approves
update public.assignments set status = 'approved' where title = 'Needs approval';
reset role;
select pg_temp.expect((select count(*) from public.notifications where kind = 'approved'
                        and user_id = 'b0000000-0000-0000-0000-000000000003') = 1,
  'pro: the creator hears it was approved');
rollback;

begin;
select pg_temp.act_as('b0000000-0000-0000-0000-000000000003');
insert into public.assignments (title, date, group_id, created_by) values ('Will be sent back', current_date, 'b1000000-0000-0000-0000-000000000000', auth.uid());
select pg_temp.act_as('b0000000-0000-0000-0000-000000000002');
update public.assignments set status = 'rejected', rejection_note = 'Fix the date' where title = 'Will be sent back';
reset role;
select pg_temp.expect((select note from public.notifications where kind = 'sent_back') = 'Fix the date',
  'pro: the creator hears it was sent back, with the note');
rollback;

-- 4. Privacy: people only see their own notifications, and cannot forge any.
begin;
insert into public.notifications (org_id, user_id, kind, event_title) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000003', 'shared', 'For A member'),
  ('bbbbbbbb-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000003', 'shared', 'For B member');
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');   -- even a super admin
select pg_temp.expect((select count(*) from public.notifications where event_title like 'For %') = 0, 'a super admin cannot read other people''s notifications');
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
select pg_temp.expect((select count(*) from public.notifications where user_id <> auth.uid()) = 0
                      and (select count(*) from public.notifications where event_title like 'For %') = 1,
  'a member sees only their own notification');
update public.notifications set event_title = 'changed', user_id = 'b0000000-0000-0000-0000-000000000003', read_at = now() where event_title = 'For A member';
reset role;
select pg_temp.expect((select event_title = 'For A member' and read_at is not null from public.notifications where event_title in ('For A member','changed')),
  'marking read works, but nothing else can be changed');
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
do $$ begin
  insert into public.notifications (org_id, user_id, kind, event_title)
  values ('bbbbbbbb-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-000000000003', 'shared', 'spam');
  raise exception 'FAILED: forged a notification';
exception when insufficient_privilege then raise notice 'ok - nobody can create notifications from the app';
end $$;
rollback;

select 'NOTIFICATION TESTS PASSED' as result;
