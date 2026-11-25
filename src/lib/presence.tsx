// Presence: who is online now and when others were last seen.
//
// While the app is open and in front, it calls touch_presence() once a
// minute (supabase/migrations/006_presence.sql) and reloads everyone's
// "last seen" time every 45 seconds. Someone seen within the last
// 2.5 minutes counts as online. Times are compared on the server's clock,
// so a phone whose clock is off still shows the right state.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { supabase } from './supabase';

export const ONLINE_WINDOW_MS = 150_000;
const HEARTBEAT_MS = 60_000;
const POLL_MS = 45_000;
const TICK_MS = 30_000;

export type LastSeenMap = Record<string, string>;

interface PresenceValue {
  /** Person id → ISO time they were last seen. Missing = never signed in. */
  lastSeen: LastSeenMap;
  /** "Now" on the server's clock, refreshed every 30 seconds. */
  now: number;
}

const PresenceContext = createContext<PresenceValue>({ lastSeen: {}, now: Date.now() });

const presenceKey = (userId: string | null) => ['presence', userId ?? 'signed-out'] as const;

function appInFront(): boolean {
  if (Platform.OS === 'web') return typeof document === 'undefined' || document.visibilityState === 'visible';
  return AppState.currentState === 'active';
}

export function PresenceProvider({
  userId,
  active,
  children,
}: {
  userId: string | null;
  active: boolean;
  children: React.ReactNode;
}) {
  const queryClient = useQueryClient();
  const enabled = !!userId && active;
  // server clock minus this device's clock
  const skew = useRef(0);

  const query = useQuery<LastSeenMap>({
    queryKey: presenceKey(userId),
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase.from('user_presence').select('user_id,last_seen_at');
      if (error) throw error;
      return Object.fromEntries(
        ((data ?? []) as { user_id: string; last_seen_at: string }[]).map((row) => [row.user_id, row.last_seen_at]),
      );
    },
    refetchInterval: POLL_MS,
    staleTime: 30_000,
  });

  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!enabled || !userId) return;
    let stopped = false;
    const beat = async () => {
      if (stopped || !appInFront()) return;
      const { data, error } = await supabase.rpc('touch_presence');
      if (stopped || error || typeof data !== 'string') return;
      skew.current = new Date(data).getTime() - Date.now();
      setNow(Date.now() + skew.current);
      queryClient.setQueryData<LastSeenMap>(presenceKey(userId), (old) => ({ ...(old ?? {}), [userId]: data }));
    };
    const wake = () => {
      if (!appInFront()) return;
      void beat();
      void queryClient.invalidateQueries({ queryKey: presenceKey(userId) });
    };
    void beat();
    const timer = setInterval(() => void beat(), HEARTBEAT_MS);
    let removeListener = () => {};
    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', wake);
        removeListener = () => document.removeEventListener('visibilitychange', wake);
      }
    } else {
      const sub = AppState.addEventListener('change', wake);
      removeListener = () => sub.remove();
    }
    return () => {
      stopped = true;
      clearInterval(timer);
      removeListener();
    };
  }, [enabled, queryClient, userId]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() + skew.current), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const lastSeen = query.data;
  const value = useMemo<PresenceValue>(() => ({ lastSeen: lastSeen ?? {}, now }), [lastSeen, now]);
  return <PresenceContext.Provider value={value}>{children}</PresenceContext.Provider>;
}

export function usePresence(): PresenceValue {
  return useContext(PresenceContext);
}

export function isOnline(iso: string | null | undefined, now: number): boolean {
  if (!iso) return false;
  return now - new Date(iso).getTime() < ONLINE_WINDOW_MS;
}
