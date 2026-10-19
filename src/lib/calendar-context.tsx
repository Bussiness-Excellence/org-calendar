import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';
import { Platform } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { callAdmin, supabase } from './supabase';
import { APP_NAME } from './supabase-config';
import { t } from '@/lib/i18n';

export type Role = 'super_admin' | 'group_admin' | 'user';

export interface CalendarGroup {
  id: string;
  name: string;
  color: string;
  sort_order: number;
}

export interface CalendarPerson {
  id: string;
  org_id: string;
  full_name: string;
  email: string;
  initials?: string | null;
  title?: string | null;
  role: Role;
  group_id: string | null;
  is_active: boolean;
}

export interface CalendarProfile extends CalendarPerson {
  must_change_password: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  date: string;
  notes?: string | null;
  group_id: string;
  created_by: string;
  assigned_to?: string | null;
  visibility: 'private' | 'group' | 'company';
  status: 'pending' | 'approved' | 'rejected';
  rejection_note?: string | null;
  color?: string | null;
  time_start?: string | null;
  time_end?: string | null;
  created_at?: string | null;
}

export interface OrgSummary {
  id: string;
  name: string;
  logo_url: string | null;
  plan: 'free' | 'pro';
  pro_active: boolean;
  plan_expires_at: string | null;
  user_limit: number;
  active_users: number;
  is_platform_admin: boolean;
}

export interface EventDraft {
  title: string;
  date: string;
  notes: string;
  group_id: string;
  visibility: 'private' | 'group' | 'company';
  color: string;
  time_start: string;
  time_end: string;
  assigned_to: string;
}

export interface LogoUpload {
  base64: string;
  mime: string;
}

export interface RegisterInput {
  org_name: string;
  full_name: string;
  email: string;
  password: string;
  logo?: LogoUpload | null;
}

interface CalendarData {
  groups: CalendarGroup[];
  people: CalendarPerson[];
  events: CalendarEvent[];
}

interface CalendarContextValue {
  session: Session | null;
  userId: string | null;
  email: string | null;
  profile: CalendarProfile | null;
  org: OrgSummary | null;
  groups: CalendarGroup[];
  people: CalendarPerson[];
  events: CalendarEvent[];
  authLoading: boolean;
  profileLoading: boolean;
  dataLoading: boolean;
  profileError: Error | null;
  dataError: Error | null;
  approvalsOn: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  registerOrg: (input: RegisterInput) => Promise<{ logoFailed: boolean }>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
  saveEvent: (id: string | null, draft: EventDraft) => Promise<'approved' | 'pending'>;
  deleteEvent: (id: string) => Promise<void>;
  reviewEvent: (id: string, approved: boolean, reason?: string) => Promise<void>;
  changePassword: (password: string) => Promise<void>;
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

const dataKey = (userId: string) => ['calendar-data', userId] as const;
const profileKey = (userId: string) => ['calendar-profile', userId] as const;
const orgKey = (userId: string) => ['calendar-org', userId] as const;

export function isSuperAdmin(profile: CalendarProfile | null): boolean {
  return profile?.role === 'super_admin';
}

export function canManageGroup(profile: CalendarProfile | null, groupId: string): boolean {
  return (
    isSuperAdmin(profile) ||
    (profile?.role === 'group_admin' && !!profile.group_id && profile.group_id === groupId)
  );
}

export function canEditEvent(
  profile: CalendarProfile | null,
  userId: string | null,
  event: CalendarEvent,
): boolean {
  return event.created_by === userId || canManageGroup(profile, event.group_id);
}

export function roleLabel(role: Role | undefined): string {
  return role === 'super_admin' ? t('Super admin') : role === 'group_admin' ? t('Team manager') : t('Member');
}

export function initialsFor(name?: string | null, fallback = '?'): string {
  return (
    name
      ?.trim()
      .split(/\s+/)
      .map((part) => part[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || fallback
  );
}

function friendlyError(error: { message?: string; code?: string } | null): Error {
  const message = error?.message ?? '';
  if (/violates row-level security|permission denied|42501/i.test(message + (error?.code ?? ''))) {
    return new Error(t('You do not have permission to do that.'));
  }
  if (/foreign key/i.test(message)) {
    return new Error(t('That item is linked to something that no longer exists. Refresh and try again.'));
  }
  if (/fetch|network/i.test(message)) {
    return new Error(t('Could not reach the server. Check your connection and try again.'));
  }
  return new Error(message || t('Something went wrong. Try again.'));
}

export function CalendarProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    let mounted = true;
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setAuthLoading(false);
    });
    supabase.auth
      .getSession()
      .then(({ data: result }) => {
        if (!mounted) return;
        setSession(result.session);
        setAuthLoading(false);
      })
      .catch(() => {
        if (mounted) setAuthLoading(false);
      });
    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const profileQuery = useQuery<CalendarProfile | null>({
    queryKey: userId ? profileKey(userId) : ['calendar-profile', 'signed-out'],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('id', userId!)
        .maybeSingle();
      if (error) throw friendlyError(error);
      return (data as CalendarProfile | null) ?? null;
    },
    staleTime: 30_000,
  });
  const profile = profileQuery.data ?? null;
  const active = !!profile && profile.is_active;

  const orgQuery = useQuery<OrgSummary | null>({
    queryKey: userId ? orgKey(userId) : ['calendar-org', 'signed-out'],
    enabled: active,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_org_summary');
      if (error) throw friendlyError(error);
      return (data as OrgSummary | null) ?? null;
    },
    staleTime: 60_000,
  });
  const org = orgQuery.data ?? null;

  const dataQuery = useQuery<CalendarData>({
    queryKey: userId ? dataKey(userId) : ['calendar-data', 'signed-out'],
    enabled: active,
    queryFn: async () => {
      const [groups, people, events] = await Promise.all([
        supabase.from('groups').select('*').order('sort_order').order('name'),
        supabase.from('user_profiles').select('*').order('full_name'),
        supabase.from('assignments').select('*').order('date'),
      ]);
      if (groups.error) throw friendlyError(groups.error);
      if (people.error) throw friendlyError(people.error);
      if (events.error) throw friendlyError(events.error);
      return {
        groups: (groups.data ?? []) as CalendarGroup[],
        people: (people.data ?? []) as CalendarPerson[],
        events: (events.data ?? []) as CalendarEvent[],
      };
    },
    staleTime: 30_000,
  });

  // Live updates. The database only sends rows this person may see, and
  // the org filter keeps the subscription to their own company.
  const orgId = profile?.org_id ?? null;
  useEffect(() => {
    if (!userId || !orgId || !active) return;
    const refreshData = () => void queryClient.invalidateQueries({ queryKey: dataKey(userId) });
    const channel = supabase
      .channel(`org-${orgId}-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assignments', filter: `org_id=eq.${orgId}` }, refreshData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'groups', filter: `org_id=eq.${orgId}` }, refreshData)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_profiles', filter: `org_id=eq.${orgId}` }, () => {
        refreshData();
        void queryClient.invalidateQueries({ queryKey: profileKey(userId) });
        void queryClient.invalidateQueries({ queryKey: orgKey(userId) });
      })
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [active, orgId, queryClient, userId]);

  // Show the company's name in the browser tab.
  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.title = org?.name ? `${org.name} · ${t('Calendar')}` : APP_NAME;
    }
  }, [org?.name]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      if (/invalid login|invalid credentials/i.test(error.message)) {
        throw new Error(t('That email and password do not match.'));
      }
      if (/banned/i.test(error.message)) {
        throw new Error(t('This account has been deactivated. Contact your calendar admin.'));
      }
      throw friendlyError(error);
    }
  }, []);

  const registerOrg = useCallback(
    async (input: RegisterInput) => {
      const result = await callAdmin<{ ok: true; logo_failed?: boolean }>('register_org', {
        ...input,
        email: input.email.trim().toLowerCase(),
      });
      await signIn(input.email, input.password);
      return { logoFailed: !!result.logo_failed };
    },
    [signIn],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    queryClient.clear();
  }, [queryClient]);

  const refresh = useCallback(async () => {
    if (!userId) return;
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: profileKey(userId) }),
      queryClient.invalidateQueries({ queryKey: orgKey(userId) }),
      queryClient.invalidateQueries({ queryKey: dataKey(userId) }),
    ]);
  }, [queryClient, userId]);

  const approvalsOn = !!org?.pro_active;

  const saveEvent = useCallback(
    async (id: string | null, draft: EventDraft) => {
      if (!userId || !profile) throw new Error(t('Sign in again to continue.'));
      const payload = {
        title: draft.title.trim(),
        date: draft.date,
        notes: draft.notes.trim() || null,
        group_id: draft.group_id,
        visibility: draft.visibility,
        color: draft.color,
        time_start: draft.time_start.trim() || null,
        time_end: draft.time_end.trim() || null,
        assigned_to: draft.assigned_to || null,
      };
      const result = id
        ? await supabase.from('assignments').update(payload).eq('id', id).select('status').single()
        : await supabase
            .from('assignments')
            .insert({ ...payload, created_by: userId })
            .select('status')
            .single();
      if (result.error) throw friendlyError(result.error);
      await queryClient.invalidateQueries({ queryKey: dataKey(userId) });
      return (result.data?.status === 'pending' ? 'pending' : 'approved') as 'approved' | 'pending';
    },
    [profile, queryClient, userId],
  );

  const deleteEvent = useCallback(
    async (id: string) => {
      if (!userId) throw new Error(t('Sign in again to continue.'));
      const { error } = await supabase.from('assignments').delete().eq('id', id);
      if (error) throw friendlyError(error);
      await queryClient.invalidateQueries({ queryKey: dataKey(userId) });
    },
    [queryClient, userId],
  );

  const reviewEvent = useCallback(
    async (id: string, approved: boolean, reason = '') => {
      if (!userId) throw new Error(t('Sign in again to continue.'));
      const patch = approved
        ? { status: 'approved', rejection_note: null }
        : { status: 'rejected', rejection_note: reason.trim() };
      const { error } = await supabase.from('assignments').update(patch).eq('id', id);
      if (error) throw friendlyError(error);
      await queryClient.invalidateQueries({ queryKey: dataKey(userId) });
    },
    [queryClient, userId],
  );

  const changePassword = useCallback(
    async (password: string) => {
      if (!userId) throw new Error(t('Sign in again to continue.'));
      const { error: authError } = await supabase.auth.updateUser({ password });
      if (authError) throw friendlyError(authError);
      const { error: profileError } = await supabase
        .from('user_profiles')
        .update({ must_change_password: false })
        .eq('id', userId);
      if (profileError) {
        throw new Error(t('Your password changed, but your account could not be updated. Try again.'));
      }
      await queryClient.invalidateQueries({ queryKey: profileKey(userId) });
    },
    [queryClient, userId],
  );

  const value = useMemo<CalendarContextValue>(
    () => ({
      session,
      userId,
      email: session?.user.email ?? null,
      profile,
      org,
      groups: dataQuery.data?.groups ?? [],
      people: dataQuery.data?.people ?? [],
      events: dataQuery.data?.events ?? [],
      authLoading,
      profileLoading: !!userId && (profileQuery.isLoading || (active && orgQuery.isLoading)),
      dataLoading: active && dataQuery.isLoading,
      profileError: (profileQuery.error as Error | null) ?? (orgQuery.error as Error | null) ?? null,
      dataError: (dataQuery.error as Error | null) ?? null,
      approvalsOn,
      signIn,
      registerOrg,
      signOut,
      refresh,
      saveEvent,
      deleteEvent,
      reviewEvent,
      changePassword,
    }),
    [
      active,
      approvalsOn,
      authLoading,
      changePassword,
      dataQuery.data,
      dataQuery.error,
      dataQuery.isLoading,
      deleteEvent,
      org,
      orgQuery.error,
      orgQuery.isLoading,
      profile,
      profileQuery.error,
      profileQuery.isLoading,
      refresh,
      registerOrg,
      reviewEvent,
      saveEvent,
      session,
      signIn,
      signOut,
      userId,
    ],
  );

  return <CalendarContext.Provider value={value}>{children}</CalendarContext.Provider>;
}

export function useCalendar(): CalendarContextValue {
  const context = useContext(CalendarContext);
  if (!context) throw new Error('useCalendar must be used inside CalendarProvider.');
  return context;
}

const REMEMBER_KEY = 'org-calendar.remembered-email';

export async function getRememberedEmail(): Promise<string> {
  return (await AsyncStorage.getItem(REMEMBER_KEY)) ?? '';
}

export async function rememberEmail(email: string | null): Promise<void> {
  if (email) await AsyncStorage.setItem(REMEMBER_KEY, email);
  else await AsyncStorage.removeItem(REMEMBER_KEY);
}
