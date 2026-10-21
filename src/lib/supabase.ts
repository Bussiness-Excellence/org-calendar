import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { FunctionsHttpError } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';
import { PRO_PRICE, SELL_IN_APP, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config';
import { t } from '@/lib/i18n';

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
      if (body.code === 'USER_LIMIT') {
        throw new AdminError(
          SELL_IN_APP
            ? t('The free plan includes up to {n} people. Upgrade to Pro ({price} per person per year) to add more.', { n: 10, price: PRO_PRICE })
            : t('The free plan includes up to {n} people.', { n: 10 }),
          body.code,
        );
      }
      // Server messages are English; show them in the reader's language when we know them.
      throw new AdminError(body.error ? t(body.error) : t('The request could not be completed.'), body.code);
    }
    throw new AdminError(t('Could not reach the server. Check your connection and try again.'));
  }
  return data as T;
}
