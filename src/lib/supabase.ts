import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { FunctionsHttpError } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config';

export const supabase = createClient(
  SUPABASE_URL || 'https://not-configured.invalid',
  SUPABASE_ANON_KEY || 'not-configured',
  {
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
  },
);

export class AdminError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

/** Calls the calendar-admin server function and returns its JSON. */
export async function callAdmin<T = { ok: true }>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.functions.invoke('calendar-admin', {
    body: { action, payload },
  });
  if (error) {
    if (error instanceof FunctionsHttpError) {
      let body: { error?: string; code?: string } = {};
      try {
        body = await error.context.json();
      } catch {
        // fall through to the generic message
      }
      throw new AdminError(body.error || 'The request could not be completed.', body.code);
    }
    throw new AdminError('Could not reach the server. Check your connection and try again.');
  }
  return data as T;
}
