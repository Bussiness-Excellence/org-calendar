// =====================================================================
//  send-push - delivers one notification as a browser push message
//
//  Called by the database (trigger t50_push_notification, through pg_net)
//  right after a row is added to public.notifications. The caller must
//  send the shared secret in "x-push-secret"; the keys and the secret are
//  read from Supabase Vault through public.push_config().
//
//  Deploy with "Verify JWT" OFF: the database is the only caller and it
//  authenticates with the shared secret instead.
// =====================================================================

import { createClient } from 'npm:@supabase/supabase-js@2.49.1';
import webpush from 'npm:web-push@3.6.7';

const URL_ = Deno.env.get('SUPABASE_URL')!;
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(URL_, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });

type Config = { vapid_public_key?: string; vapid_private_key?: string; push_hook_secret?: string };
let config: Config | null = null;

async function loadConfig(): Promise<Config> {
  if (config) return config;
  const { data, error } = await admin.rpc('push_config');
  if (error) throw new Error(`push_config: ${error.message}`);
  config = (data ?? {}) as Config;
  if (config.vapid_public_key && config.vapid_private_key) {
    webpush.setVapidDetails('mailto:noreply@orgcalender.app', config.vapid_public_key, config.vapid_private_key);
  }
  return config;
}

interface NotificationRow {
  id: string;
  user_id: string;
  kind: 'assigned' | 'review_needed' | 'approved' | 'sent_back' | 'shared' | 'reminder';
  event_id: string | null;
  event_title: string;
  event_date: string | null;
  actor_id: string | null;
  note: string | null;
}

function when(date: string | null): string {
  if (!date) return '';
  const d = new Date(`${date}T12:00:00Z`);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

function message(n: NotificationRow, actor: string): { title: string; body: string; path: string } {
  const day = when(n.event_date);
  const at = day ? ` · ${day}` : '';
  switch (n.kind) {
    case 'reminder':
      return { title: `⏰ ${n.event_title}`, body: n.note ? n.note : 'Your reminder is due now.', path: 'reminders' };
    case 'assigned':
      return { title: 'New task for you', body: `${actor} assigned you “${n.event_title}”${at}`, path: 'calendar' };
    case 'review_needed':
      return { title: 'Waiting for your approval', body: `${actor} added “${n.event_title}”${at}`, path: 'calendar' };
    case 'approved':
      return { title: 'Event approved', body: `“${n.event_title}” was approved and is now on the calendar.`, path: 'calendar' };
    case 'sent_back':
      return {
        title: 'Event sent back',
        body: n.note ? `“${n.event_title}” needs changes: ${n.note}` : `“${n.event_title}” needs changes.`,
        path: 'calendar',
      };
    default:
      return { title: 'New event', body: `${actor} shared “${n.event_title}”${at}`, path: 'calendar' };
  }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json(405, { error: 'POST only' });
  let cfg: Config;
  try {
    cfg = await loadConfig();
  } catch (e) {
    return json(500, { error: (e as Error).message });
  }
  const given = req.headers.get('x-push-secret') ?? '';
  if (!cfg.push_hook_secret || given !== cfg.push_hook_secret) return json(401, { error: 'Not allowed' });
  if (!cfg.vapid_public_key || !cfg.vapid_private_key) return json(500, { error: 'Push keys are not set up' });

  let id = '';
  try {
    id = String((await req.json())?.notification_id ?? '');
  } catch {
    return json(400, { error: 'Bad body' });
  }
  if (!/^[0-9a-f-]{36}$/i.test(id)) return json(400, { error: 'Bad id' });

  const { data: n } = await admin.from('notifications').select('*').eq('id', id).maybeSingle<NotificationRow>();
  if (!n) return json(200, { sent: 0, reason: 'gone' });

  const [{ data: subs }, { data: actorRow }] = await Promise.all([
    admin.from('push_subscriptions').select('id, endpoint, p256dh, auth').eq('user_id', n.user_id),
    n.actor_id
      ? admin.from('user_profiles').select('full_name').eq('id', n.actor_id).maybeSingle<{ full_name: string }>()
      : Promise.resolve({ data: null }),
  ]);
  if (!subs?.length) return json(200, { sent: 0, reason: 'no subscriptions' });

  const m = message(n, actorRow?.full_name || 'Someone');
  const payload = JSON.stringify({ title: m.title, body: m.body, tag: n.id, path: m.path });

  let sent = 0;
  const failures: { status: number | null; message: string }[] = [];
  await Promise.all(
    subs.map(async (s: { id: string; endpoint: string; p256dh: string; auth: string }) => {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, {
          TTL: 12 * 3600,
          urgency: n.kind === 'reminder' || n.kind === 'assigned' ? 'high' : 'normal',
        });
        sent++;
        await admin.from('push_subscriptions').update({ last_used_at: new Date().toISOString() }).eq('id', s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode ?? null;
        failures.push({ status, message: String((e as Error).message ?? e).slice(0, 200) });
        // the browser unsubscribed or the subscription expired
        if (status === 404 || status === 410) await admin.from('push_subscriptions').delete().eq('id', s.id);
      }
    }),
  );
  return json(200, { sent, failures });
});
