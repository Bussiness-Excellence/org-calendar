-- =====================================================================
--  Web push: notifications reach the browser even when the calendar
--  tab is closed (Chrome, Edge, Firefox; Safari on iPhone only when the
--  site is added to the Home Screen).
--
--  * The browser registers a push subscription (save_push_subscription).
--  * Every new row in notifications calls the send-push Edge Function
--    through pg_net (after the transaction commits, never blocking it).
--  * The VAPID keys and the hook secret live in Supabase Vault, set up
--    once outside this file:
--      vault.create_secret('<public key>',  'vapid_public_key')
--      vault.create_secret('<private key>', 'vapid_private_key')
--      vault.create_secret('<random>',      'push_hook_secret')
--      vault.create_secret('https://<ref>.supabase.co/functions/v1/send-push', 'push_function_url')
-- =====================================================================

create extension if not exists pg_net;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  user_id uuid not null,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) between 20 and 200),
  auth text not null check (char_length(auth) between 8 and 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 400),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  constraint push_subscriptions_owner_fkey foreign key (org_id, user_id)
    references public.user_profiles (org_id, id) on delete cascade
);
create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));
revoke all on public.push_subscriptions from anon;
revoke insert, update, truncate on public.push_subscriptions from authenticated;
grant select, delete on public.push_subscriptions to authenticated;

-- Save (or take over) this browser's subscription for the signed-in person.
create or replace function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_org uuid := public.my_org();
begin
  if auth.uid() is null or v_org is null then
    raise exception 'Sign in first.' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (org_id, user_id, endpoint, p256dh, auth, user_agent)
  values (v_org, auth.uid(), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 400))
  on conflict (endpoint) do update
    set org_id = excluded.org_id, user_id = excluded.user_id, p256dh = excluded.p256dh,
        auth = excluded.auth, user_agent = excluded.user_agent, created_at = now();
end $$;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- Keys and secret for the send-push function (server only).
create or replace function public.push_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_object_agg(name, decrypted_secret)
    from vault.decrypted_secrets
   where name in ('vapid_public_key', 'vapid_private_key', 'push_hook_secret')
$$;
revoke execute on function public.push_config() from public, anon, authenticated;
grant execute on function public.push_config() to service_role;

-- New notification -> push to the person's browsers (if they have any).
create or replace function public.push_notification()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_url text; v_secret text;
begin
  if not exists (select 1 from public.push_subscriptions where user_id = new.user_id) then
    return null;
  end if;
  select max(decrypted_secret) filter (where name = 'push_function_url'),
         max(decrypted_secret) filter (where name = 'push_hook_secret')
    into v_url, v_secret
    from vault.decrypted_secrets where name in ('push_function_url', 'push_hook_secret');
  if v_url is null or v_secret is null then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('notification_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', v_secret),
    timeout_milliseconds := 8000);
  return null;
exception when others then
  return null; -- a push problem must never stop the notification itself
end $$;
revoke execute on function public.push_notification() from public, anon, authenticated;

create trigger t50_push_notification after insert on public.notifications
  for each row execute function public.push_notification();
