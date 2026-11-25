// Web push for the browser version: lets notifications arrive while the
// calendar tab is closed. The phone app uses its own on-device alerts.
//
// Flow: notification permission granted -> register /sw.js -> subscribe
// with the VAPID public key -> save_push_subscription() in the database.
// The database then calls the send-push Edge Function for every new
// notification (supabase/migrations/008_web_push.sql).

import { Platform } from 'react-native';
import { supabase } from './supabase';

const VAPID_PUBLIC_KEY = process.env.EXPO_PUBLIC_VAPID_PUBLIC_KEY ?? '';

export function webPushSupported(): boolean {
  return (
    Platform.OS === 'web' &&
    !!VAPID_PUBLIC_KEY &&
    typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window &&
    window.isSecureContext !== false
  );
}

/** "/" on Vercel, "/org-calendar/" on GitHub Pages. */
function basePath(): string {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';
  return path === '/org-calendar' || path.startsWith('/org-calendar/') ? '/org-calendar/' : '/';
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

function sameKey(sub: PushSubscription): boolean {
  const current = sub.options?.applicationServerKey;
  if (!current) return true;
  const a = new Uint8Array(current);
  const b = keyBytes(VAPID_PUBLIC_KEY);
  return a.length === b.length && a.every((v, i) => v === b[i]);
}

async function registration(): Promise<ServiceWorkerRegistration> {
  const base = basePath();
  const reg = await navigator.serviceWorker.register(`${base}sw.js`, { scope: base });
  await navigator.serviceWorker.ready;
  return reg;
}

/**
 * Makes sure this browser is subscribed for the signed-in person.
 * Only call after notification permission is granted. Returns true when push is on.
 */
export async function enableWebPush(): Promise<boolean> {
  if (!webPushSupported() || window.Notification.permission !== 'granted') return false;
  try {
    const reg = await registration();
    let sub = await reg.pushManager.getSubscription();
    if (sub && !sameKey(sub)) {
      await sub.unsubscribe();
      sub = null;
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(VAPID_PUBLIC_KEY) });
    }
    const json = sub.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return false;
    const { error } = await supabase.rpc('save_push_subscription', {
      p_endpoint: json.endpoint,
      p_p256dh: json.keys.p256dh,
      p_auth: json.keys.auth,
      p_user_agent: navigator.userAgent.slice(0, 400),
    });
    return !error;
  } catch {
    return false;
  }
}

/** On sign-out: stop pushes to this browser for the person signing out. */
export async function disableWebPush(): Promise<void> {
  if (!webPushSupported()) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration(basePath());
    const sub = await reg?.pushManager.getSubscription();
    if (!sub) return;
    await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
    await sub.unsubscribe();
  } catch {
    // best effort
  }
}
