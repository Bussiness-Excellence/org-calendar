// My reminders: private reminders each person sets for themselves.
// The database fires them (pg_cron, every minute) as 'reminder'
// notifications: bell, web push and, on phones, an on-device alert at the
// exact time (scheduled in notifications.tsx).
// See supabase/migrations/007_reminders.sql.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCalendar } from './calendar-context';
import { t } from './i18n';
import { supabase } from './supabase';

export interface Reminder {
  id: string;
  title: string;
  notes: string | null;
  remind_at: string;
  done_at: string | null;
  notified_at: string | null;
  created_at: string;
}

export interface ReminderDraft {
  title: string;
  notes: string;
  /** local date YYYY-MM-DD */
  date: string;
  /** local time HH:MM */
  time: string;
}

export const remindersKey = (userId: string | null) => ['reminders', userId ?? 'signed-out'] as const;

/** Local date + time -> ISO instant. */
export function toInstant(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const tm = /^(\d{2}):(\d{2})$/.exec(time);
  if (!d || !tm) return null;
  const at = new Date(Number(d[1]), Number(d[2]) - 1, Number(d[3]), Number(tm[1]), Number(tm[2]));
  return Number.isNaN(at.getTime()) ? null : at.toISOString();
}

export function useReminders() {
  const { userId, profile } = useCalendar();
  const queryClient = useQueryClient();
  const key = remindersKey(userId);
  const enabled = !!userId && !!profile?.is_active;

  const query = useQuery<Reminder[]>({
    queryKey: key,
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('reminders')
        .select('id,title,notes,remind_at,done_at,notified_at,created_at')
        .order('remind_at', { ascending: true })
        .limit(500);
      if (error) throw new Error(error.message);
      return (data ?? []) as Reminder[];
    },
    staleTime: 30_000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: key });

  const save = useMutation({
    mutationFn: async ({ id, draft }: { id: string | null; draft: ReminderDraft }) => {
      const title = draft.title.trim();
      if (!title) throw new Error(t('Write what to remind you about.'));
      const remindAt = toInstant(draft.date, draft.time);
      if (!remindAt) throw new Error(t('Choose a date and time.'));
      const payload = { title: title.slice(0, 200), notes: draft.notes.trim().slice(0, 2000) || null, remind_at: remindAt };
      const { error } = id
        ? await supabase.from('reminders').update({ ...payload, done_at: null }).eq('id', id)
        : await supabase.from('reminders').insert(payload);
      if (error) throw new Error(error.message);
    },
    onSettled: invalidate,
  });

  const setDone = useMutation({
    mutationFn: async ({ id, done }: { id: string; done: boolean }) => {
      const { error } = await supabase
        .from('reminders')
        .update({ done_at: done ? new Date().toISOString() : null })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },
    onMutate: ({ id, done }) => {
      queryClient.setQueryData<Reminder[]>(key, (old) =>
        (old ?? []).map((r) => (r.id === id ? { ...r, done_at: done ? new Date().toISOString() : null } : r)),
      );
    },
    onSettled: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('reminders').delete().eq('id', id);
      if (error) throw new Error(error.message);
    },
    onMutate: (id) => {
      queryClient.setQueryData<Reminder[]>(key, (old) => (old ?? []).filter((r) => r.id !== id));
    },
    onSettled: invalidate,
  });

  return { reminders: query.data ?? [], loading: query.isLoading, error: query.error as Error | null, save, setDone, remove };
}
