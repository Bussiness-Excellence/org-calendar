import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as Notifications from 'expo-notifications';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type PropsWithChildren,
} from 'react';
import { Platform } from 'react-native';
import { useCalendar, type CalendarEvent } from './calendar-context';
import { dateTitle, displayTime, parseLocalDate } from './calendar-date';
import { t } from './i18n';
import { usePreferences } from './preferences';
import { supabase } from './supabase';

export type NotificationKind = 'assigned' | 'review_needed' | 'approved' | 'sent_back' | 'shared';

export interface AppNotification {
  id: string;
  kind: NotificationKind;
  event_id: string | null;
  event_title: string;
  event_date: string | null;
  actor_id: string | null;
  note: string | null;
  created_at: string;
  read_at: string | null;
}

interface NotificationsValue {
  items: AppNotification[];
  unread: number;
  loading: boolean;
  markAllRead: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  requestPermission: () => Promise<boolean>;
  permission: 'granted' | 'denied' | 'undetermined' | 'unsupported';
}

const NotificationsContext = createContext<NotificationsValue | null>(null);
const REMINDER_DAYS = 30;
const REMINDER_LIMIT = 60;
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';

if (isNative) {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
}

/** Title and body for a notification, in the reader's language. */
export function describeNotification(n: AppNotification, actorName?: string): { title: string; body: string } {
  const who = actorName || t('Someone');
  const when = n.event_date ? dateTitle(n.event_date) : '';
  switch (n.kind) {
    case 'assigned':
      return { title: t('New task for you'), body: t('{who} assigned you “{title}” · {when}', { who, title: n.event_title, when }) };
    case 'review_needed':
      return { title: t('Waiting for your approval'), body: t('{who} added “{title}” · {when}', { who, title: n.event_title, when }) };
    case 'approved':
      return { title: t('Event approved'), body: t('“{title}” was approved and is now on the calendar.', { title: n.event_title }) };
    case 'sent_back':
      return {
        title: t('Event sent back'),
        body: n.note
          ? t('“{title}” needs changes: {note}', { title: n.event_title, note: n.note })
          : t('“{title}” needs changes.', { title: n.event_title }),
      };
    default:
      return { title: t('New event'), body: t('{who} shared “{title}” · {when}', { who, title: n.event_title, when }) };
  }
}

function webPermission(): NotificationsValue['permission'] {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'unsupported';
  const p = window.Notification.permission;
  return p === 'default' ? 'undetermined' : p;
}

export function NotificationsProvider({ children }: PropsWithChildren) {
  const { userId, profile, events, people } = useCalendar();
  const { reminders } = usePreferences();
  const queryClient = useQueryClient();
  const active = !!userId && !!profile?.is_active;
  const key = useMemo(() => ['notifications', userId] as const, [userId]);
  const peopleRef = useRef(people);
  peopleRef.current = people;

  const query = useQuery<AppNotification[]>({
    queryKey: key,
    enabled: active,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(60);
      if (error) throw new Error(error.message);
      return (data ?? []) as AppNotification[];
    },
    staleTime: 30_000,
  });

  const permissionQuery = useQuery({
    queryKey: ['notification-permission', userId],
    enabled: active,
    queryFn: async (): Promise<NotificationsValue['permission']> => {
      if (!isNative) return webPermission();
      const { status } = await Notifications.getPermissionsAsync();
      return status as NotificationsValue['permission'];
    },
  });
  const permission = permissionQuery.data ?? 'undetermined';

  const requestPermission = useCallback(async () => {
    let result: NotificationsValue['permission'] = 'unsupported';
    if (isNative) {
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: t('Calendar notifications'),
          importance: Notifications.AndroidImportance.HIGH,
        });
      }
      result = (await Notifications.requestPermissionsAsync()).status as NotificationsValue['permission'];
    } else if (webPermission() !== 'unsupported') {
      const p = await window.Notification.requestPermission();
      result = p === 'default' ? 'undetermined' : p;
    }
    queryClient.setQueryData(['notification-permission', userId], result);
    return result === 'granted';
  }, [queryClient, userId]);

  // Live: new notifications arrive through the database's own row rules.
  useEffect(() => {
    if (!active || !userId) return;
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const n = payload.new as AppNotification;
          queryClient.setQueryData<AppNotification[]>(key, (old) => [n, ...(old ?? []).filter((x) => x.id !== n.id)]);
          const actor = peopleRef.current.find((p) => p.id === n.actor_id)?.full_name;
          const { title, body } = describeNotification(n, actor);
          if (isNative) {
            void Notifications.scheduleNotificationAsync({ content: { title, body, data: { eventId: n.event_id } }, trigger: null }).catch(() => undefined);
          } else if (webPermission() === 'granted' && typeof document !== 'undefined' && document.visibilityState !== 'visible') {
            try {
              new window.Notification(title, { body, tag: n.id });
            } catch {
              // some browsers only allow notifications from a service worker
            }
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [active, key, queryClient, userId]);

  // On-device reminders for my own and assigned events (phones only).
  useEffect(() => {
    if (!isNative || !active || !userId) return;
    let cancelled = false;
    void (async () => {
      try {
        const existing = await Notifications.getAllScheduledNotificationsAsync();
        await Promise.all(
          existing
            .filter((r) => (r.content.data as { kind?: string } | undefined)?.kind === 'reminder')
            .map((r) => Notifications.cancelScheduledNotificationAsync(r.identifier)),
        );
        if (cancelled || !reminders || permission !== 'granted') return;
        const now = Date.now();
        const horizon = now + REMINDER_DAYS * 86_400_000;
        const mine = events
          .filter((e: CalendarEvent) => e.status !== 'rejected' && (e.assigned_to === userId || e.created_by === userId))
          .map((e) => ({ e, at: reminderTime(e) }))
          .filter((x): x is { e: CalendarEvent; at: Date } => !!x.at && x.at.getTime() > now && x.at.getTime() < horizon)
          .sort((a, b) => a.at.getTime() - b.at.getTime())
          .slice(0, REMINDER_LIMIT);
        for (const { e, at } of mine) {
          if (cancelled) return;
          await Notifications.scheduleNotificationAsync({
            content: {
              title: e.time_start ? t('Starts in 30 minutes') : t('Today'),
              body: `${e.title} · ${displayTime(e.time_start)}`,
              data: { kind: 'reminder', eventId: e.id },
            },
            trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: at },
          });
        }
      } catch {
        // reminders are best-effort; the calendar itself never depends on them
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [active, events, permission, reminders, userId]);

  const markRead = useCallback(
    async (id: string) => {
      queryClient.setQueryData<AppNotification[]>(key, (old) =>
        (old ?? []).map((n) => (n.id === id ? { ...n, read_at: n.read_at ?? new Date().toISOString() } : n)),
      );
      await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id);
    },
    [key, queryClient],
  );

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    queryClient.setQueryData<AppNotification[]>(key, (old) => (old ?? []).map((n) => ({ ...n, read_at: n.read_at ?? now })));
    await supabase.from('notifications').update({ read_at: now }).is('read_at', null);
  }, [key, queryClient]);

  const remove = useCallback(
    async (id: string) => {
      queryClient.setQueryData<AppNotification[]>(key, (old) => (old ?? []).filter((n) => n.id !== id));
      await supabase.from('notifications').delete().eq('id', id);
    },
    [key, queryClient],
  );

  const items = query.data ?? [];
  const value = useMemo<NotificationsValue>(
    () => ({
      items,
      unread: items.filter((n) => !n.read_at).length,
      loading: query.isLoading,
      markAllRead,
      markRead,
      remove,
      requestPermission,
      permission,
    }),
    [items, markAllRead, markRead, permission, query.isLoading, remove, requestPermission],
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

/** 30 minutes before a timed event, or 08:00 on the day of an all-day event. */
function reminderTime(e: CalendarEvent): Date | null {
  const day = parseLocalDate(e.date);
  if (!day) return null;
  if (e.time_start) {
    const [h, m] = e.time_start.split(':').map(Number);
    const at = new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m);
    return new Date(at.getTime() - 30 * 60_000);
  }
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8, 0);
}

export function useNotifications(): NotificationsValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error('useNotifications must be used inside NotificationsProvider.');
  return ctx;
}
