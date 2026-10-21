-- Performance at scale: evaluate auth.uid() once per query (not per row)
-- and index the composite foreign keys used by every tenant-scoped join.

alter policy profiles_update_own on public.user_profiles
  using (id = (select auth.uid()) and org_id = (select public.my_org()))
  with check (id = (select auth.uid()));

alter policy assignments_select on public.assignments
  using (org_id = (select public.my_org()) and (
    (select public.is_super())
    or created_by = (select auth.uid())
    or assigned_to = (select auth.uid())
    or ((select public.my_role()) = 'group_admin' and group_id = (select public.my_group()))
    or (status = 'approved' and visibility = 'company')
    or (status = 'approved' and visibility = 'group' and group_id = (select public.my_group()))));

alter policy assignments_insert on public.assignments
  with check (org_id = (select public.my_org()) and created_by = (select auth.uid())
    and ((select public.is_super()) or group_id = (select public.my_group())));

alter policy assignments_update on public.assignments
  using (org_id = (select public.my_org()) and (created_by = (select auth.uid()) or (select public.is_super())
    or ((select public.my_role()) = 'group_admin' and group_id = (select public.my_group()))))
  with check (org_id = (select public.my_org()) and ((select public.is_super()) or group_id = (select public.my_group())));

alter policy assignments_delete on public.assignments
  using (org_id = (select public.my_org()) and (created_by = (select auth.uid()) or (select public.is_super())
    or ((select public.my_role()) = 'group_admin' and group_id = (select public.my_group()))));

alter policy notifications_select on public.notifications
  using (user_id = (select auth.uid()) and org_id = (select public.my_org()));
alter policy notifications_update on public.notifications
  using (user_id = (select auth.uid()) and org_id = (select public.my_org()))
  with check (user_id = (select auth.uid()));
alter policy notifications_delete on public.notifications
  using (user_id = (select auth.uid()) and org_id = (select public.my_org()));

create index if not exists assignments_org_assigned_idx on public.assignments (org_id, assigned_to);
create index if not exists assignments_org_created_idx on public.assignments (org_id, created_by);
create index if not exists notifications_org_user_idx on public.notifications (org_id, user_id, created_at desc);
create index if not exists user_profiles_org_group_idx on public.user_profiles (org_id, group_id);
drop index if exists public.assignments_created_by_idx;
drop index if exists public.assignments_assigned_idx;
