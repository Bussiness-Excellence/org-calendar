-- =====================================================================
--  Isolation and plan tests. Run against a scratch database that has
--  schema.sql loaded. Every block raises an error if a rule is broken;
--  the script ends with "ALL TESTS PASSED".
-- =====================================================================
\set ON_ERROR_STOP 1
set client_min_messages = warning;

-- ---------- Fixtures (as the server, like the calendar-admin function) --
insert into auth.users (id, email) values
  ('a0000000-0000-0000-0000-000000000001', 'super@a.com'),
  ('a0000000-0000-0000-0000-000000000002', 'mgr@a.com'),
  ('a0000000-0000-0000-0000-000000000003', 'member@a.com'),
  ('b0000000-0000-0000-0000-000000000001', 'super@b.com'),
  ('b0000000-0000-0000-0000-000000000002', 'mgr@b.com'),
  ('b0000000-0000-0000-0000-000000000003', 'member@b.com');

insert into public.organizations (id, name) values
  ('aaaaaaaa-0000-0000-0000-000000000000', 'Company A');
insert into public.organizations (id, name, plan, plan_expires_at) values
  ('bbbbbbbb-0000-0000-0000-000000000000', 'Company B', 'pro', current_date + 365);

insert into public.groups (id, org_id, name) values
  ('a1000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'A Sales'),
  ('a2000000-0000-0000-0000-000000000000', 'aaaaaaaa-0000-0000-0000-000000000000', 'A Marketing'),
  ('b1000000-0000-0000-0000-000000000000', 'bbbbbbbb-0000-0000-0000-000000000000', 'B Sales');

insert into public.user_profiles (id, org_id, email, full_name, role, group_id) values
  ('a0000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'super@a.com',  'A Super',  'super_admin', null),
  ('a0000000-0000-0000-0000-000000000002', 'aaaaaaaa-0000-0000-0000-000000000000', 'mgr@a.com',    'A Mgr',    'group_admin', 'a1000000-0000-0000-0000-000000000000'),
  ('a0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000000', 'member@a.com', 'A Member', 'user',        'a1000000-0000-0000-0000-000000000000'),
  ('b0000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'super@b.com',  'B Super',  'super_admin', null),
  ('b0000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000000', 'mgr@b.com',    'B Mgr',    'group_admin', 'b1000000-0000-0000-0000-000000000000'),
  ('b0000000-0000-0000-0000-000000000003', 'bbbbbbbb-0000-0000-0000-000000000000', 'member@b.com', 'B Member', 'user',        'b1000000-0000-0000-0000-000000000000');

insert into public.assignments (id, org_id, title, date, group_id, visibility, status, created_by) values
  ('e0a00000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000000', 'A company event', current_date, 'a1000000-0000-0000-0000-000000000000', 'company', 'approved', 'a0000000-0000-0000-0000-000000000001'),
  ('e0b00000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'B company event', current_date, 'b1000000-0000-0000-0000-000000000000', 'company', 'approved', 'b0000000-0000-0000-0000-000000000001'),
  ('e0b00000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000000', 'B private event', current_date, 'b1000000-0000-0000-0000-000000000000', 'private', 'approved', 'b0000000-0000-0000-0000-000000000001');

-- Helper: act as a signed-in person for the rest of the transaction.
create function pg_temp.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid::text, true);
  execute 'set local role authenticated';
end $$;

create function pg_temp.expect(ok boolean, what text) returns void language plpgsql as $$
begin
  if not ok then raise exception 'FAILED: %', what; end if;
  raise notice 'ok - %', what;
end $$;
set client_min_messages = notice;

-- ---------- 1. Reading: a company only ever sees itself -------------------
begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');  -- A super admin sees the most
select pg_temp.expect((select count(*) from public.organizations) = 1, 'A sees exactly one organization');
select pg_temp.expect((select bool_and(name = 'Company A') from public.organizations), 'that organization is A');
select pg_temp.expect((select count(*) from public.groups where org_id <> 'aaaaaaaa-0000-0000-0000-000000000000') = 0, 'A sees no B teams');
select pg_temp.expect((select count(*) from public.user_profiles where org_id <> 'aaaaaaaa-0000-0000-0000-000000000000') = 0, 'A sees no B people');
select pg_temp.expect((select count(*) from public.assignments where org_id <> 'aaaaaaaa-0000-0000-0000-000000000000') = 0, 'A sees no B events, even company-wide ones');
select pg_temp.expect((select count(*) from public.assignments where title like 'B %') = 0, 'B events invisible by title too');
select pg_temp.expect((select (public.my_org_summary()->>'name') = 'Company A'), 'summary returns A');
rollback;

-- ---------- 2. Writing into another company is impossible ---------------
begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
do $$ begin
  insert into public.assignments (org_id, title, date, group_id, created_by)
  values ('bbbbbbbb-0000-0000-0000-000000000000', 'smuggled', current_date,
          'b1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001');
  raise exception 'FAILED: event inserted into a B team';
exception when foreign_key_violation then raise notice 'ok - cannot add an event to a B team';
end $$;
rollback;

begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
insert into public.assignments (org_id, title, date, group_id, created_by)
values ('bbbbbbbb-0000-0000-0000-000000000000', 'stamped', current_date,
        'a1000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-000000000001');
reset role;
select pg_temp.expect((select org_id from public.assignments where title = 'stamped') = 'aaaaaaaa-0000-0000-0000-000000000000',
  'a forged org_id on insert is replaced with the caller''s own company');
rollback;

begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
insert into public.groups (org_id, name) values ('bbbbbbbb-0000-0000-0000-000000000000', 'Forged team');
reset role;
select pg_temp.expect((select org_id from public.groups where name = 'Forged team') = 'aaaaaaaa-0000-0000-0000-000000000000',
  'a forged org_id on a new team lands in the caller''s company');
rollback;

begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
do $$ begin
  insert into public.assignments (title, date, group_id, created_by, assigned_to)
  values ('cross-assign', current_date, 'a1000000-0000-0000-0000-000000000000',
          'a0000000-0000-0000-0000-000000000001', 'b0000000-0000-0000-0000-000000000003');
  raise exception 'FAILED: assigned an A event to a B person';
exception when foreign_key_violation then raise notice 'ok - cannot assign an event to a person in another company';
end $$;
rollback;

begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
update public.assignments set title = 'hacked' where org_id = 'bbbbbbbb-0000-0000-0000-000000000000';
delete from public.assignments where org_id = 'bbbbbbbb-0000-0000-0000-000000000000';
update public.groups set name = 'hacked' where org_id = 'bbbbbbbb-0000-0000-0000-000000000000';
delete from public.groups where org_id = 'bbbbbbbb-0000-0000-0000-000000000000';
update public.user_profiles set full_name = 'hacked' where org_id = 'bbbbbbbb-0000-0000-0000-000000000000';
reset role;
select pg_temp.expect((select count(*) from public.assignments where org_id = 'bbbbbbbb-0000-0000-0000-000000000000' and title <> 'hacked') = 2, 'B events untouched by A');
select pg_temp.expect((select count(*) from public.groups where org_id = 'bbbbbbbb-0000-0000-0000-000000000000' and name = 'B Sales') = 1, 'B teams untouched by A');
select pg_temp.expect((select count(*) from public.user_profiles where full_name = 'hacked') = 0, 'B people untouched by A');
rollback;

begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
update public.assignments set org_id = 'bbbbbbbb-0000-0000-0000-000000000000' where id = 'e0a00000-0000-0000-0000-000000000001';
update public.groups set org_id = 'bbbbbbbb-0000-0000-0000-000000000000' where id = 'a2000000-0000-0000-0000-000000000000';
reset role;
select pg_temp.expect((select org_id from public.assignments where id = 'e0a00000-0000-0000-0000-000000000001') = 'aaaaaaaa-0000-0000-0000-000000000000', 'an event cannot be moved to another company');
select pg_temp.expect((select org_id from public.groups where id = 'a2000000-0000-0000-0000-000000000000') = 'aaaaaaaa-0000-0000-0000-000000000000', 'a team cannot be moved to another company');
rollback;

begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
update public.user_profiles
   set org_id = 'bbbbbbbb-0000-0000-0000-000000000000', role = 'super_admin',
       group_id = 'a2000000-0000-0000-0000-000000000000', is_active = true, full_name = 'Renamed Me'
 where id = auth.uid();
reset role;
select pg_temp.expect((select org_id = 'aaaaaaaa-0000-0000-0000-000000000000' and role = 'user'
                         and group_id = 'a1000000-0000-0000-0000-000000000000' and full_name = 'Renamed Me'
                       from public.user_profiles where id = 'a0000000-0000-0000-0000-000000000003'),
  'a member can rename themselves but cannot change company, role or team');
rollback;

begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000001');
do $$ begin
  insert into public.user_profiles (id, org_id, email, full_name)
  values ('b0000000-0000-0000-0000-000000000003', 'aaaaaaaa-0000-0000-0000-000000000000', 'x@x.com', 'Kidnapped');
  raise exception 'FAILED: app could create a profile directly';
exception when insufficient_privilege then raise notice 'ok - people can only be created by the server function';
end $$;
do $$ begin
  delete from public.user_profiles where id = 'b0000000-0000-0000-0000-000000000003';
  raise exception 'FAILED: app could delete a profile directly';
exception when insufficient_privilege then raise notice 'ok - people cannot be deleted from the app directly';
end $$;
do $$ begin
  update public.organizations set plan = 'pro';
  raise exception 'FAILED: a company could upgrade itself';
exception when insufficient_privilege then raise notice 'ok - a company cannot give itself Pro';
end $$;
do $$ begin
  perform * from public.platform_admins;
  raise exception 'FAILED: platform_admins readable';
exception when insufficient_privilege then raise notice 'ok - the owner list is not readable from the app';
end $$;
rollback;

-- ---------- 3. Signed-out visitors see nothing ----------------------
begin;
set local role anon;
do $$ begin
  perform * from public.assignments;
  raise exception 'FAILED: anon read events';
exception when insufficient_privilege then raise notice 'ok - signed-out visitors cannot read events';
end $$;
do $$ begin
  perform * from public.user_profiles;
  raise exception 'FAILED: anon read people';
exception when insufficient_privilege then raise notice 'ok - signed-out visitors cannot read people';
end $$;
do $$ begin
  perform public.my_org_summary();
  raise exception 'FAILED: anon ran a helper';
exception when insufficient_privilege then raise notice 'ok - signed-out visitors cannot call helper functions';
end $$;
rollback;

-- ---------- 4. A deactivated person loses access at once -------------
begin;
update public.user_profiles set is_active = false where id = 'a0000000-0000-0000-0000-000000000003';
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
select pg_temp.expect((select count(*) from public.assignments) = 0 and (select count(*) from public.user_profiles) = 0,
  'a deactivated person can no longer read anything');
rollback;

-- ---------- 5. Within a company: privacy between members ------------
begin;
select pg_temp.act_as('b0000000-0000-0000-0000-000000000003');
select pg_temp.expect((select count(*) from public.assignments where title = 'B private event') = 0, 'a member cannot see someone else''s private event');
select pg_temp.expect((select count(*) from public.assignments where title = 'B company event') = 1, 'a member sees company-wide events of their own company');
rollback;

begin;
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
do $$ begin
  insert into public.assignments (title, date, group_id, created_by)
  values ('other team', current_date, 'a2000000-0000-0000-0000-000000000000', auth.uid());
  raise exception 'FAILED: member added an event to another team';
exception when insufficient_privilege then raise notice 'ok - a member can only add events to their own team';
end $$;
rollback;

begin;
insert into public.assignments (id, org_id, title, date, group_id, visibility, status, created_by) values
  ('e0b00000-0000-0000-0000-000000000009', 'bbbbbbbb-0000-0000-0000-000000000000', 'B pending', current_date,
   'b1000000-0000-0000-0000-000000000000', 'group', 'pending', 'b0000000-0000-0000-0000-000000000003');
select pg_temp.act_as('a0000000-0000-0000-0000-000000000002');  -- a manager, but of company A
update public.assignments set status = 'approved' where id = 'e0b00000-0000-0000-0000-000000000009';
reset role;
select pg_temp.expect((select status from public.assignments where id = 'e0b00000-0000-0000-0000-000000000009') = 'pending',
  'a manager in one company cannot approve another company''s events');
rollback;

-- ---------- 6. Plans: approvals --------------------------------------
begin;  -- free plan (A): a member's event is published immediately
select pg_temp.act_as('a0000000-0000-0000-0000-000000000003');
insert into public.assignments (title, date, group_id, created_by, status)
values ('A member event', current_date, 'a1000000-0000-0000-0000-000000000000', auth.uid(), 'pending');
select pg_temp.expect((select status from public.assignments where title = 'A member event') = 'approved', 'free plan: events are published with no approval');
rollback;

begin;  -- pro plan (B): a member's event waits, and they cannot approve it
select pg_temp.act_as('b0000000-0000-0000-0000-000000000003');
insert into public.assignments (title, date, group_id, created_by, status)
values ('B member event', current_date, 'b1000000-0000-0000-0000-000000000000', auth.uid(), 'approved');
select pg_temp.expect((select status from public.assignments where title = 'B member event') = 'pending', 'pro plan: a member''s event waits for approval');
update public.assignments set status = 'approved' where title = 'B member event';
select pg_temp.expect((select status from public.assignments where title = 'B member event') = 'pending', 'pro plan: a member cannot approve their own event');
select pg_temp.act_as('b0000000-0000-0000-0000-000000000002');
update public.assignments set status = 'approved' where title = 'B member event';
select pg_temp.expect((select status from public.assignments where title = 'B member event') = 'approved', 'pro plan: the team manager can approve it');
select pg_temp.act_as('b0000000-0000-0000-0000-000000000003');
update public.assignments set title = 'B member event edited' where title = 'B member event';
select pg_temp.expect((select status from public.assignments where title = 'B member event edited') = 'pending', 'pro plan: editing a published event sends it back for approval');
rollback;

begin;  -- expired pro behaves like free
update public.organizations set plan_expires_at = current_date - 1 where id = 'bbbbbbbb-0000-0000-0000-000000000000';
select pg_temp.act_as('b0000000-0000-0000-0000-000000000003');
insert into public.assignments (title, date, group_id, created_by)
values ('after expiry', current_date, 'b1000000-0000-0000-0000-000000000000', auth.uid());
select pg_temp.expect((select status from public.assignments where title = 'after expiry') = 'approved', 'expired pro falls back to free behaviour');
rollback;

-- ---------- 7. Plans: the 10-person limit is per company -------------
begin;
insert into auth.users (id, email)
select ('c0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'extra' || g || '@a.com'
from generate_series(1, 7) g;
insert into public.user_profiles (id, org_id, email, full_name, group_id)
select ('c0000000-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'aaaaaaaa-0000-0000-0000-000000000000',
       'extra' || g || '@a.com', 'Extra ' || g, 'a1000000-0000-0000-0000-000000000000'
from generate_series(1, 7) g;
select pg_temp.expect((select count(*) from public.user_profiles where org_id = 'aaaaaaaa-0000-0000-0000-000000000000') = 10, 'free company can have 10 people');
insert into auth.users (id, email) values ('c0000000-0000-0000-0000-000000000099', 'eleventh@a.com');
do $$ begin
  insert into public.user_profiles (id, org_id, email, full_name, group_id)
  values ('c0000000-0000-0000-0000-000000000099', 'aaaaaaaa-0000-0000-0000-000000000000', 'eleventh@a.com', 'Eleventh', 'a1000000-0000-0000-0000-000000000000');
  raise exception 'FAILED: 11th person added on free plan';
exception when raise_exception then
  if sqlerrm like 'USER_LIMIT%' then raise notice 'ok - free plan blocks the 11th person'; else raise; end if;
end $$;
update public.user_profiles set is_active = false where email = 'extra7@a.com';
insert into public.user_profiles (id, org_id, email, full_name, group_id)
values ('c0000000-0000-0000-0000-000000000099', 'aaaaaaaa-0000-0000-0000-000000000000', 'eleventh@a.com', 'Eleventh', 'a1000000-0000-0000-0000-000000000000');
select pg_temp.expect(true, 'deactivating someone frees a seat');
do $$ begin
  update public.user_profiles set is_active = true where email = 'extra7@a.com';
  raise exception 'FAILED: reactivation over the limit';
exception when raise_exception then
  if sqlerrm like 'USER_LIMIT%' then raise notice 'ok - reactivating someone over the limit is blocked'; else raise; end if;
end $$;
-- B (pro) is unaffected by A's count
insert into auth.users (id, email) values ('d0000000-0000-0000-0000-000000000001', 'more@b.com');
insert into public.user_profiles (id, org_id, email, full_name, group_id)
values ('d0000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000000', 'more@b.com', 'More B', 'b1000000-0000-0000-0000-000000000000');
select pg_temp.expect(true, 'another company''s limit is counted separately');
rollback;

-- ---------- 8. Deleting a company removes only that company ---------
begin;
delete from public.organizations where id = 'aaaaaaaa-0000-0000-0000-000000000000';
select pg_temp.expect((select count(*) from public.assignments where org_id = 'bbbbbbbb-0000-0000-0000-000000000000') = 2
                      and (select count(*) from public.user_profiles where org_id = 'bbbbbbbb-0000-0000-0000-000000000000') = 3,
  'deleting company A leaves company B intact');
select pg_temp.expect((select count(*) from public.assignments where org_id = 'aaaaaaaa-0000-0000-0000-000000000000') = 0, 'and removes all of A''s events');
rollback;

select 'ALL TESTS PASSED' as result;
